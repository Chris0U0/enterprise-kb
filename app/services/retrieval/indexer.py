"""
Qdrant 索引管理器 — 将文档 sections 的三合一向量写入 Qdrant
"""
from __future__ import annotations

import logging
import uuid

from qdrant_client import models

from app.core.config import get_settings
from app.core.qdrant_client import get_qdrant, ensure_collection
from app.services.retrieval.embedder import get_embedder

logger = logging.getLogger(__name__)
settings = get_settings()


class VectorIndexer:
    """
    文档向量索引管理：
    1. 将 doc_sections 的文本编码为 BGE-M3 三合一向量
    2. 写入 Qdrant，payload 包含元数据（用于过滤和引用溯源）
    3. 支持按 project_id / doc_id 删除索引
    """

    def __init__(self):
        self.client = get_qdrant()
        self.collection = settings.QDRANT_COLLECTION
        self.embedder = get_embedder()
        ensure_collection(self.client)

    async def index_sections(
        self,
        sections: list[dict],
        project_id: str,
        doc_id: str,
        doc_name: str,
        source_path: str,
        source_format: str,
        md_path: str,
        checksum: str | None = None,
        upload_by: str | None = None,
    ) -> int:
        """
        将文档章节向量化并写入 Qdrant。

        Args:
            sections: [{ id, section_path, section_title, content, level, page_num, ... }]
            project_id: 项目 ID（用于 payload 过滤隔离）
            doc_id: 文档 ID
            doc_name: 原始文件名
            source_path: MinIO 源文件路径
            source_format: 文件格式
            md_path: MinIO Markdown 路径
            checksum: 文件 MD5
            upload_by: 上传者 ID

        Returns:
            索引的 section 数量
        """
        if not sections:
            return 0

        # 准备文本（章节标题 + 内容拼接）
        texts = []
        for sec in sections:
            title = sec.get("section_title") or sec.get("title", "")
            content = sec.get("content", "")
            # 将标题和内容拼接以获得更好的语义表示
            combined = f"{title}\n{content}" if title else content
            texts.append(combined[:2000])  # 限制长度

        # 批量编码
        logger.info(f"向量化 {len(texts)} 个 sections (doc: {doc_name})")
        embeddings = self.embedder.encode_documents(texts)

        # 构建 Qdrant points
        points = []
        for i, (sec, emb) in enumerate(zip(sections, embeddings)):
            point_id = str(sec.get("id", uuid.uuid4()))

            # 构建 payload（包含引用溯源所需的全部元数据）
            payload = {
                "project_id": project_id,
                "doc_id": doc_id,
                "doc_name": doc_name,
                "source_format": source_format,
                "source_path": source_path,
                "md_path": md_path,
                "section_path": sec.get("section_path", ""),
                "section_title": sec.get("section_title") or sec.get("title", ""),
                "level": sec.get("level", 1),
                "page_num": sec.get("page_num"),
                "sheet_name": sec.get("sheet_name"),
                "timestamp_sec": sec.get("timestamp_sec"),
                "content_snippet": sec.get("content", ""), # 不再截断，存储完整片段内容以供 Reranker 精排
                "checksum": checksum,
                "upload_by": upload_by,
            }

            # 构建 dense + sparse 双向量
            vectors = {
                "dense": emb.dense.tolist(),
            }

            # sparse vector
            sparse_indices = list(emb.sparse.keys())
            sparse_values = list(emb.sparse.values())

            point = models.PointStruct(
                id=point_id,
                vector=vectors,
                payload=payload,
            )

            points.append((point, sparse_indices, sparse_values))

        # 批量写入 Qdrant
        batch_size = 100
        indexed_count = 0

        for batch_start in range(0, len(points), batch_size):
            batch = points[batch_start : batch_start + batch_size]

            qdrant_points = []
            for point, sparse_idx, sparse_val in batch:
                # 将 sparse 向量也加入
                point.vector["sparse"] = models.SparseVector(
                    indices=sparse_idx,
                    values=sparse_val,
                )
                qdrant_points.append(point)

            self.client.upsert(
                collection_name=self.collection,
                points=qdrant_points,
            )
            indexed_count += len(batch)

        logger.info(f"索引完成: {indexed_count} sections → Qdrant ({self.collection})")
        return indexed_count

    def delete_by_doc(self, doc_id: str):
        """删除指定文档的所有向量"""
        self.client.delete(
            collection_name=self.collection,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="doc_id",
                            match=models.MatchValue(value=doc_id),
                        )
                    ]
                )
            ),
        )
        logger.info(f"已删除文档 {doc_id} 的全部向量索引")

    def delete_by_project(self, project_id: str):
        """删除整个项目的全部向量"""
        self.client.delete(
            collection_name=self.collection,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="project_id",
                            match=models.MatchValue(value=project_id),
                        )
                    ]
                )
            ),
        )
        logger.info(f"已删除项目 {project_id} 的全部向量索引")


# 单例
_indexer: VectorIndexer | None = None


def get_indexer() -> VectorIndexer:
    global _indexer
    if _indexer is None:
        _indexer = VectorIndexer()
    return _indexer

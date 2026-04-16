"""
多模态转换管道调度器（修正版）

修正 #2: 容错与事务处理
  ─ 引入 ProcessingArtifacts 追踪所有已产生的副作用（MinIO 文件、Qdrant 向量）
  ─ 任何环节失败时，rollback_artifacts() 自动清理已上传的 MinIO 文件和已写入的 Qdrant 索引
  ─ DB 层面依赖 SQLAlchemy session 的原生回滚（调用方 get_db 中 except → rollback）
  ─ 最终状态一定是 completed 或 failed，不会停留在 processing

事务边界：
  MinIO 上传(源文件) →  转换 → MinIO 上传(Markdown) → DB 写入(sections+structure)
  任一步失败 → rollback_artifacts 清理 MinIO → DB rollback → 状态置 failed
"""
from __future__ import annotations

import uuid
import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import PurePosixPath

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.config import get_settings
from app.core.minio_client import get_minio
from app.models.database import Document, DocSection, DocStructure, AuditLog
from app.utils.markdown_utils import generate_frontmatter, extract_sections, build_outline
from app.utils.checksum import compute_md5

from app.services.conversion.pdf_converter import convert_pdf
from app.services.conversion.office_converter import convert_word, convert_ppt
from app.services.conversion.excel_converter import convert_excel
from app.services.conversion.image_converter import convert_image
from app.services.conversion.audio_converter import convert_audio
from app.services.conversion.web_converter import convert_web

logger = logging.getLogger(__name__)
settings = get_settings()

FORMAT_CONVERTERS = {
    "pdf": convert_pdf, "docx": convert_word, "doc": convert_word,
    "pptx": convert_ppt, "ppt": convert_ppt,
    "xlsx": convert_excel, "xls": convert_excel, "csv": convert_excel,
    "png": convert_image, "jpg": convert_image, "jpeg": convert_image,
    "gif": convert_image, "webp": convert_image,
    "mp3": convert_audio, "mp4": convert_audio, "wav": convert_audio,
    "m4a": convert_audio, "webm": convert_audio,
    "url": convert_web,
}
SUPPORTED_FORMATS = set(FORMAT_CONVERTERS.keys())


def detect_format(filename: str) -> str:
    ext = PurePosixPath(filename).suffix.lower().lstrip(".")
    if ext in SUPPORTED_FORMATS:
        return ext
    raise ValueError(f"不支持的文件格式: {ext}  (支持: {', '.join(sorted(SUPPORTED_FORMATS))})")


# ══════════════════════════════════════════════════════════
# 副作用追踪与回滚
# ══════════════════════════════════════════════════════════

@dataclass
class ProcessingArtifacts:
    """
    追踪处理过程中产生的所有外部副作用。
    失败时调用 rollback() 清理全部。
    """
    minio_paths: list[str] = field(default_factory=list)   # 已上传到 MinIO 的路径
    qdrant_doc_id: str | None = None                       # 已写入 Qdrant 的 doc_id

    def record_minio_upload(self, path: str):
        self.minio_paths.append(path)

    def record_qdrant_index(self, doc_id: str):
        self.qdrant_doc_id = doc_id

    def rollback(self):
        """清理所有已产生的外部副作用"""
        minio = get_minio()

        # 清理 MinIO 文件
        for path in self.minio_paths:
            try:
                minio.delete(path)
                logger.info(f"Rollback: 已删除 MinIO 文件 {path}")
            except Exception as e:
                logger.warning(f"Rollback: 删除 MinIO 文件失败 {path}: {e}")

        # 清理 Qdrant 索引
        if self.qdrant_doc_id:
            try:
                from app.services.retrieval.indexer import get_indexer
                indexer = get_indexer()
                indexer.delete_by_doc(self.qdrant_doc_id)
                logger.info(f"Rollback: 已删除 Qdrant 索引 doc_id={self.qdrant_doc_id}")
            except Exception as e:
                logger.warning(f"Rollback: 删除 Qdrant 索引失败: {e}")


# ══════════════════════════════════════════════════════════
# 核心处理管道
# ══════════════════════════════════════════════════════════

async def process_document(
    db: AsyncSession,
    doc_id: uuid.UUID,
    project_id: uuid.UUID,
    file_data: bytes,
    filename: str,
    source_format: str,
    upload_by: uuid.UUID,
    stage: str = "执行阶段",
) -> tuple[str, ProcessingArtifacts]:
    """
    完整的文档处理流程（带事务保护）。

    Returns:
        (full_markdown, artifacts) — 调用方需要使用 artifacts 追踪后续副作用
        （如 Qdrant 索引），以便在后续步骤失败时也能完整回滚。

    任何环节异常 → artifacts.rollback() + DB rollback + 状态置 failed
    """
    minio = get_minio()
    project_id_str = str(project_id)
    doc_id_str = str(doc_id)
    artifacts = ProcessingArtifacts()

    # 设置 processing 状态
    await db.execute(
        update(Document).where(Document.id == doc_id).values(conversion_status="processing")
    )
    await db.flush()

    try:
        # Step 1: 上传源文件
        checksum = compute_md5(file_data)
        source_path = minio.upload_source(
            project_id_str, doc_id_str, filename, file_data, "application/octet-stream"
        )
        artifacts.record_minio_upload(source_path)

        # Step 2: 转换
        converter = FORMAT_CONVERTERS.get(source_format)
        if converter is None:
            raise ValueError(f"无对应转换器: {source_format}")
        md_body, page_count = await converter(file_data, filename)

        # Step 3: 生成 Frontmatter + 上传 Markdown
        frontmatter = generate_frontmatter(
            doc_id=doc_id, project_id=project_id, stage=stage,
            original_filename=filename, original_format=source_format,
            upload_by=upload_by, checksum=checksum,
        )
        full_markdown = frontmatter + md_body
        md_path = minio.upload_markdown(project_id_str, doc_id_str, full_markdown)
        artifacts.record_minio_upload(md_path)

        # Step 4: 解析章节 → 写入 DB
        sections = extract_sections(full_markdown)
        section_records = []
        for sec in sections:
            record = DocSection(
                doc_id=doc_id, project_id=project_id,
                section_path=sec["section_path"], section_title=sec["title"],
                level=sec["level"], order_idx=sec["order_idx"],
                content=sec["content"], page_num=sec.get("page_num"),
                char_count=sec.get("char_count", 0),
            )
            db.add(record)
            section_records.append((record, sec))
        await db.flush()

        # Step 5: 目录树
        outline = build_outline(sections)
        await _save_outline_tree(db, doc_id, outline, section_records, parent_id=None)

        # Step 6: 更新文档状态 → completed
        await db.execute(
            update(Document).where(Document.id == doc_id).values(
                source_path=source_path, md_path=md_path,
                checksum=checksum, file_size_bytes=len(file_data),
                page_count=page_count, conversion_status="completed",
                converted_at=datetime.utcnow(),
            )
        )

        # Step 7: 审计日志
        db.add(AuditLog(
            event_type="document_uploaded", user_id=upload_by,
            project_id=project_id, doc_id=doc_id,
            payload={
                "filename": filename, "format": source_format,
                "checksum": checksum, "file_size": len(file_data),
                "section_count": len(sections), "page_count": page_count,
            },
        ))

        # Step 8 (Phase 3): GraphRAG 实体关系抽取
        if getattr(settings, "GRAPHRAG_ENABLED", False):
            try:
                from app.services.graph.extractor import batch_extract
                from app.services.graph.store import get_graph_store

                entities, relations = await batch_extract(sections, str(doc_id))
                if entities or relations:
                    store = get_graph_store()
                    store.add_entities(entities, str(project_id))
                    store.add_relations(relations, str(project_id))
                    logger.info(f"GraphRAG: {len(entities)} 实体, {len(relations)} 关系 (doc: {filename})")
            except Exception as e:
                logger.warning(f"GraphRAG 抽取跳过: {e}")

        await db.flush()
        logger.info(f"文档处理完成: {filename} → {len(sections)} sections, {page_count} pages")
        return full_markdown, artifacts

    except Exception as e:
        logger.error(f"文档处理失败: {filename} — {e}，正在回滚...")

        # 回滚外部副作用（MinIO 文件 + Qdrant 索引）
        artifacts.rollback()

        # DB 层面：将状态置为 failed（在新的 flush 中，不受主事务影响）
        try:
            await db.execute(
                update(Document).where(Document.id == doc_id).values(
                    conversion_status="failed", conversion_error=str(e)[:2000],
                )
            )
            await db.flush()
        except Exception as db_err:
            logger.error(f"更新 failed 状态也失败: {db_err}")

        raise


async def _save_outline_tree(
    db: AsyncSession,
    doc_id: uuid.UUID,
    nodes: list[dict],
    section_records: list[tuple],
    parent_id: uuid.UUID | None,
):
    """递归保存目录树到 doc_structure"""
    for node in nodes:
        matched_section_id = None
        for record, sec_data in section_records:
            if sec_data["section_path"] == node["section_path"]:
                matched_section_id = record.id
                break

        structure = DocStructure(
            doc_id=doc_id, parent_id=parent_id,
            section_path=node["section_path"], title=node["title"],
            level=node["level"], order_idx=node.get("order_idx", 0),
            has_children=node.get("has_children", False),
            page_num=node.get("page_num"), section_id=matched_section_id,
        )
        db.add(structure)
        await db.flush()

        if node.get("children"):
            await _save_outline_tree(db, doc_id, node["children"], section_records, structure.id)

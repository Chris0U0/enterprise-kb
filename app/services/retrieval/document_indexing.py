"""
文档向量索引与后置增强 — 供 Celery 快速入库 / 异步增强任务复用
"""
from __future__ import annotations

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.minio_client import get_minio
from app.models.database import DocSection, Document
from app.utils.markdown_utils import extract_sections

logger = logging.getLogger(__name__)
settings = get_settings()


async def load_sections_from_db(db: AsyncSession, doc_id: uuid.UUID) -> list[dict]:
    """从 DB 加载章节（保留稳定 section id，便于增强后重索引）。"""
    result = await db.execute(
        select(DocSection)
        .where(DocSection.doc_id == doc_id)
        .order_by(DocSection.order_idx)
    )
    rows = result.scalars().all()
    return [
        {
            "id": str(row.id),
            "section_path": row.section_path,
            "section_title": row.section_title,
            "title": row.section_title,
            "content": row.content,
            "level": row.level,
            "order_idx": row.order_idx,
            "page_num": row.page_num,
            "char_count": row.char_count,
        }
        for row in rows
    ]


def sections_from_markdown(md_content: str) -> list[dict]:
    """从 Markdown 解析章节并生成临时 id（无 DB 时的回退）。"""
    section_dicts = []
    for sec in extract_sections(md_content):
        sec = dict(sec)
        sec["id"] = str(uuid.uuid4())
        sec["section_title"] = sec.get("title", "")
        section_dicts.append(sec)
    return section_dicts


async def index_document_sections(
    *,
    sections: list[dict],
    project_id: str,
    doc_id: str,
    filename: str,
    source_format: str,
    upload_by: str,
    source_path: str,
    md_path: str,
    checksum: str | None = None,
    use_contextual: bool = False,
    full_doc_content: str | None = None,
    replace_existing: bool = False,
) -> int:
    """
    向量化并写入 Qdrant。

    replace_existing=True 时先删除该文档旧向量（用于 Contextual 增强后重索引）。
    """
    if not sections:
        return 0

    section_dicts = [dict(s) for s in sections]
    for sec in section_dicts:
        if not sec.get("id"):
            sec["id"] = str(uuid.uuid4())

    if use_contextual and settings.CONTEXTUAL_RETRIEVAL_ENABLED and full_doc_content:
        try:
            from app.services.retrieval.contextual import get_contextual_retrieval

            cr = get_contextual_retrieval()
            section_dicts = await cr.enrich_sections(
                sections=section_dicts,
                full_doc_content=full_doc_content,
                doc_name=filename,
            )
        except Exception as e:
            logger.warning("Contextual Retrieval 跳过: %s", e)

    from app.services.retrieval.indexer import get_indexer

    indexer = get_indexer()
    if replace_existing:
        indexer.delete_by_doc(doc_id)

    count = await indexer.index_sections(
        sections=section_dicts,
        project_id=project_id,
        doc_id=doc_id,
        doc_name=filename,
        source_path=source_path,
        source_format=source_format,
        md_path=md_path,
        checksum=checksum,
        upload_by=upload_by,
    )
    return count


async def run_graphrag_enhancement(
    *,
    sections: list[dict],
    doc_id: str,
    project_id: str,
    filename: str,
) -> None:
    """GraphRAG 实体关系抽取并写入 Kuzu（后置增强，失败仅记录日志）。"""
    if not settings.GRAPHRAG_ENABLED:
        return

    try:
        from app.services.graph.extractor import batch_extract
        from app.services.graph.store import get_graph_store

        store = get_graph_store()
        project_schema = store.get_project_schema(project_id)
        schema = project_schema if project_schema.get("entities") else None

        entities, relations = await batch_extract(sections, doc_id, schema=schema)
        if entities or relations:
            store.add_entities(entities, project_id)
            store.add_relations(relations, project_id)
            logger.info(
                "GraphRAG 增强完成: %d 实体, %d 关系 (doc: %s)",
                len(entities),
                len(relations),
                filename,
            )
    except Exception as e:
        logger.warning("GraphRAG 增强跳过: %s", e)


async def load_document_markdown(project_id: str, doc_id: str) -> str:
    """从 MinIO 读取已转换的 Markdown 全文。"""
    minio = get_minio()
    md_path = minio.markdown_path(project_id, doc_id)
    raw = minio.download(md_path)
    return raw.decode("utf-8", errors="replace")


async def get_document_meta(db: AsyncSession, doc_id: uuid.UUID) -> Document | None:
    result = await db.execute(select(Document).where(Document.id == doc_id))
    return result.scalar_one_or_none()

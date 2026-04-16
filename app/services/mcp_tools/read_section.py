"""
MCP 工具: read_section
读取指定章节的完整 Markdown 内容，保留原始结构
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import DocSection, Document
from app.models.schemas import MCPReadResponse, CitationSource, RetrievalMethod


async def read_section(
    doc_id: uuid.UUID,
    section_path: str,
    project_id: uuid.UUID,
    db: AsyncSession,
) -> MCPReadResponse:
    """
    读取指定文档的指定章节完整内容

    Args:
        doc_id: 文档 ID
        section_path: 章节路径 (e.g. "第一章/1.1节")
        project_id: 项目 ID（权限校验）
        db: 数据库 session

    Returns:
        MCPReadResponse 包含完整章节内容和引用信息
    """
    # 获取文档信息
    doc_result = await db.execute(
        select(Document)
        .where(Document.id == doc_id)
        .where(Document.project_id == project_id)
    )
    doc = doc_result.scalar_one_or_none()
    if doc is None:
        raise ValueError(f"文档 {doc_id} 不存在或不属于项目 {project_id}")

    # 查找章节 — 精确匹配
    section_result = await db.execute(
        select(DocSection)
        .where(DocSection.doc_id == doc_id)
        .where(DocSection.project_id == project_id)
        .where(DocSection.section_path == section_path)
    )
    section = section_result.scalar_one_or_none()

    # 如果精确匹配失败，尝试模糊匹配
    if section is None:
        section_result = await db.execute(
            select(DocSection)
            .where(DocSection.doc_id == doc_id)
            .where(DocSection.project_id == project_id)
            .where(DocSection.section_path.ilike(f"%{section_path}%"))
            .limit(1)
        )
        section = section_result.scalar_one_or_none()

    if section is None:
        raise ValueError(
            f"章节 '{section_path}' 在文档 '{doc.original_filename}' 中不存在"
        )

    # 构建引用信息
    citation = CitationSource(
        doc_id=doc.id,
        doc_name=doc.original_filename,
        doc_type=None,
        md_path=doc.md_path or "",
        section_path=section.section_path,
        section_title=section.section_title,
        source_path=doc.source_path or "",
        source_format=doc.source_format,
        page_num=section.page_num,
        sheet_name=section.sheet_name,
        timestamp_sec=section.timestamp_sec,
        content_snippet=section.content[:300],
        checksum=doc.checksum,
        upload_by=doc.upload_by,
        upload_at=doc.upload_at,
        relevance_score=1.0,
        retrieval_method=RetrievalMethod.MCP_TOOL,
    )

    return MCPReadResponse(
        doc_id=doc.id,
        section_path=section.section_path,
        section_title=section.section_title,
        content=section.content,
        page_num=section.page_num,
        citation=citation,
    )

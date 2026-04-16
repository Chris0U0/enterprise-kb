"""
MCP 工具: search_sections
按关键词在项目文档中搜索，返回匹配章节（PostgreSQL 全文检索）
"""
from __future__ import annotations

import uuid

from sqlalchemy import select, text, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import DocSection, Document
from app.models.schemas import SectionInfo, MCPSearchResponse


async def search_sections(
    query: str,
    project_id: uuid.UUID,
    db: AsyncSession,
    limit: int = 10,
) -> MCPSearchResponse:
    """
    在项目文档的所有章节中进行全文检索

    检索策略：
    1. 优先使用 PostgreSQL tsvector 全文检索（支持中文分词需配置）
    2. 回退到 ILIKE 模糊匹配
    3. 结果按相关性排序

    Args:
        query: 搜索关键词
        project_id: 项目 ID（强制隔离）
        db: 数据库 session
        limit: 最大返回数

    Returns:
        MCPSearchResponse 包含匹配的章节列表
    """
    # 方案 1: tsvector 全文检索
    try:
        ts_query = func.plainto_tsquery("simple", query)

        result = await db.execute(
            select(DocSection)
            .where(DocSection.project_id == project_id)
            .where(DocSection.ts_vector.op("@@")(ts_query))
            .order_by(
                func.ts_rank(DocSection.ts_vector, ts_query).desc()
            )
            .limit(limit)
        )
        sections = result.scalars().all()

        if sections:
            return _build_response(query, project_id, sections)
    except Exception:
        pass

    # 方案 2: ILIKE 模糊匹配（回退方案）
    search_pattern = f"%{query}%"
    result = await db.execute(
        select(DocSection)
        .where(DocSection.project_id == project_id)
        .where(
            or_(
                DocSection.content.ilike(search_pattern),
                DocSection.section_title.ilike(search_pattern),
            )
        )
        .order_by(DocSection.order_idx)
        .limit(limit)
    )
    sections = result.scalars().all()

    return _build_response(query, project_id, sections)


def _build_response(
    query: str,
    project_id: uuid.UUID,
    sections: list,
) -> MCPSearchResponse:
    """构建搜索响应"""
    section_infos = [
        SectionInfo(
            id=sec.id,
            doc_id=sec.doc_id,
            section_path=sec.section_path,
            section_title=sec.section_title,
            level=sec.level,
            content=sec.content[:500],  # 截断内容预览
            page_num=sec.page_num,
            sheet_name=sec.sheet_name,
            timestamp_sec=sec.timestamp_sec,
            char_count=sec.char_count,
        )
        for sec in sections
    ]

    return MCPSearchResponse(
        query=query,
        project_id=project_id,
        total_hits=len(section_infos),
        sections=section_infos,
    )

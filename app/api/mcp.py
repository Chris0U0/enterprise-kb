"""
MCP 工具化查询 API — 暴露四个核心 MCP 工具为 REST 端点
Agent 通过这些端点主动决定"查什么"：
  list → outline → search → read 逐步下钻
"""
from __future__ import annotations

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.schemas import MCPListResponse, MCPOutlineResponse, MCPSearchResponse, MCPReadResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mcp", tags=["MCP Tools"])


@router.get("/list_documents/{project_id}", response_model=MCPListResponse)
async def mcp_list_documents(
    project_id: uuid.UUID,
    status: str | None = Query(default="completed", description="状态过滤"),
    db: AsyncSession = Depends(get_db),
):
    """
    MCP Tool: list_documents
    列出项目中所有文档，Agent 先了解知识库全貌再决策
    """
    from app.services.mcp_tools.list_documents import list_documents
    return await list_documents(project_id, db, status_filter=status)


@router.get("/get_outline/{doc_id}", response_model=MCPOutlineResponse)
async def mcp_get_outline(
    doc_id: uuid.UUID,
    project_id: uuid.UUID = Query(..., description="项目 ID"),
    db: AsyncSession = Depends(get_db),
):
    """
    MCP Tool: get_document_outline
    获取指定文档的章节目录树，Agent 先看目录再精读
    """
    from app.services.mcp_tools.get_outline import get_document_outline
    try:
        return await get_document_outline(doc_id, project_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/search_sections", response_model=MCPSearchResponse)
async def mcp_search_sections(
    query: str = Query(..., min_length=1, description="搜索关键词"),
    project_id: uuid.UUID = Query(..., description="项目 ID"),
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """
    MCP Tool: search_sections
    按关键词在项目文档中搜索，返回匹配章节（PostgreSQL 全文检索）
    """
    from app.services.mcp_tools.search_sections import search_sections
    return await search_sections(query, project_id, db, limit=limit)


@router.get("/read_section/{doc_id}", response_model=MCPReadResponse)
async def mcp_read_section(
    doc_id: uuid.UUID,
    section_path: str = Query(..., description="章节路径"),
    project_id: uuid.UUID = Query(..., description="项目 ID"),
    db: AsyncSession = Depends(get_db),
):
    """
    MCP Tool: read_section
    读取指定章节的完整 Markdown 内容，保留原始结构
    """
    from app.services.mcp_tools.read_section import read_section
    try:
        return await read_section(doc_id, section_path, project_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

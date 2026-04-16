"""
MCP 工具: list_documents
列出项目中所有文档，Agent 先了解知识库全貌再决策
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Document
from app.models.schemas import DocumentInfo, MCPListResponse


async def list_documents(
    project_id: uuid.UUID,
    db: AsyncSession,
    status_filter: str | None = "completed",
) -> MCPListResponse:
    """
    列出指定项目的所有文档

    Args:
        project_id: 项目 ID
        db: 数据库 session
        status_filter: 可选状态过滤 (completed / pending / processing / failed / None=全部)

    Returns:
        MCPListResponse 包含文档列表和总数
    """
    query = select(Document).where(Document.project_id == project_id)

    if status_filter:
        query = query.where(Document.conversion_status == status_filter)

    query = query.order_by(Document.upload_at.desc())

    result = await db.execute(query)
    docs = result.scalars().all()

    doc_infos = [
        DocumentInfo(
            id=doc.id,
            project_id=doc.project_id,
            original_filename=doc.original_filename,
            source_format=doc.source_format,
            conversion_status=doc.conversion_status,
            page_count=doc.page_count,
            file_size_bytes=doc.file_size_bytes,
            checksum=doc.checksum,
            upload_by=doc.upload_by,
            upload_at=doc.upload_at,
            converted_at=doc.converted_at,
        )
        for doc in docs
    ]

    return MCPListResponse(
        project_id=project_id,
        total_count=len(doc_infos),
        documents=doc_infos,
    )

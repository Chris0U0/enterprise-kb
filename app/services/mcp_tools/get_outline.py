"""
MCP 工具: get_document_outline
获取指定文档的章节目录树，Agent 先看目录再精读
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Document, DocStructure
from app.models.schemas import DocumentOutlineNode, MCPOutlineResponse


async def get_document_outline(
    doc_id: uuid.UUID,
    project_id: uuid.UUID,
    db: AsyncSession,
) -> MCPOutlineResponse:
    """
    获取文档的章节目录树结构

    Args:
        doc_id: 文档 ID
        project_id: 项目 ID（权限校验）
        db: 数据库 session

    Returns:
        MCPOutlineResponse 包含嵌套的目录树
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

    # 查询所有目录结构节点
    struct_result = await db.execute(
        select(DocStructure)
        .where(DocStructure.doc_id == doc_id)
        .order_by(DocStructure.level, DocStructure.order_idx)
    )
    structures = struct_result.scalars().all()

    # 构建树结构
    outline = _build_tree(structures)

    return MCPOutlineResponse(
        doc_id=doc.id,
        doc_name=doc.original_filename,
        outline=outline,
    )


def _build_tree(structures: list) -> list[DocumentOutlineNode]:
    """从扁平的 DocStructure 列表构建嵌套目录树"""
    nodes_by_id: dict[uuid.UUID, DocumentOutlineNode] = {}
    root_nodes: list[DocumentOutlineNode] = []

    for s in structures:
        node = DocumentOutlineNode(
            section_path=s.section_path,
            title=s.title,
            level=s.level,
            page_num=s.page_num,
            has_children=s.has_children,
            children=[],
        )
        nodes_by_id[s.id] = node

        if s.parent_id is None:
            root_nodes.append(node)
        elif s.parent_id in nodes_by_id:
            nodes_by_id[s.parent_id].children.append(node)
        else:
            # 父节点尚未处理（不应发生，因为按 level 排序了）
            root_nodes.append(node)

    return root_nodes

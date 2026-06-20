"""
GraphRAG API — 实体浏览 / 关系查询 / 子图可视化（Kuzu）
"""
from __future__ import annotations

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_project_admin, require_project_editor, require_project_member
from app.core.database import get_db
from app.core.config import get_settings
from app.models.database import User

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/graph", tags=["GraphRAG"])


class GraphQueryBody(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    mode: str = Field(default="text2cypher", description="text2cypher | nl")


@router.get("/projects/{project_id}/graph")
async def get_project_graph(
    project_id: uuid.UUID,
    limit: int = Query(default=200, ge=1, le=500),
    entity_types: str | None = Query(default=None, description="逗号分隔实体类型过滤"),
    _: tuple = Depends(require_project_member),
):
    """拉取项目子图（React Flow nodes / edges）。"""
    _check_enabled()
    from app.services.graph.store import get_graph_store

    type_list = [t.strip() for t in entity_types.split(",")] if entity_types else None
    store = get_graph_store()
    return store.get_project_subgraph(str(project_id), limit=limit, entity_types=type_list)


@router.post("/projects/{project_id}/query")
async def post_project_graph_query(
    project_id: uuid.UUID,
    body: GraphQueryBody,
    _: tuple = Depends(require_project_member),
):
    """自然语言图查询（Text2Cypher + 模板查询）。"""
    _check_enabled()
    from app.services.graph.query import query_graph

    result = await query_graph(body.query, str(project_id))
    return {
        "query": body.query,
        "mode": body.mode,
        "result": result or "未找到相关图谱信息",
    }


@router.get("/entities/{project_id}")
async def list_entity_types(
    project_id: uuid.UUID,
    _: tuple = Depends(require_project_member),
):
    """获取项目中所有实体类型及数量"""
    _check_enabled()
    from app.services.graph.store import get_graph_store
    store = get_graph_store()
    types = store.get_entity_types(str(project_id))
    return {"project_id": str(project_id), "entity_types": types}


@router.get("/neighbors")
async def get_neighbors(
    entity_name: str = Query(...),
    project_id: uuid.UUID = Query(...),
    depth: int = Query(default=1, ge=1, le=3),
    _: tuple = Depends(require_project_member),
):
    """查找实体的邻居（1-3 度）"""
    _check_enabled()
    from app.services.graph.store import get_graph_store
    store = get_graph_store()
    results = store.find_neighbors(entity_name, str(project_id), depth)
    return {
        "entity": entity_name,
        "depth": depth,
        "neighbors": results,
    }


@router.get("/query")
async def graph_query(
    query: str = Query(..., min_length=1),
    project_id: uuid.UUID = Query(...),
    _: tuple = Depends(require_project_member),
):
    """自然语言图查询（GET 兼容旧调用）"""
    _check_enabled()
    from app.services.graph.query import query_graph
    result = await query_graph(query, str(project_id))
    return {
        "query": query,
        "result": result or "未找到相关图谱信息",
    }


@router.post("/extract/{doc_id}")
async def trigger_extraction(
    doc_id: uuid.UUID,
    project_id: uuid.UUID = Query(...),
    _: tuple = Depends(require_project_editor),
    db: AsyncSession = Depends(get_db),
):
    """手动触发单个文档的实体关系抽取"""
    _check_enabled()
    from sqlalchemy import select
    from app.models.database import DocSection
    from app.services.graph.extractor import batch_extract
    from app.services.graph.store import get_graph_store

    result = await db.execute(
        select(DocSection)
        .where(DocSection.doc_id == doc_id, DocSection.project_id == project_id)
        .order_by(DocSection.order_idx)
    )
    sections = result.scalars().all()
    if not sections:
        raise HTTPException(status_code=404, detail="文档无章节数据")

    section_dicts = [
        {"content": s.content, "section_path": s.section_path}
        for s in sections
    ]

    entities, relations = await batch_extract(section_dicts, str(doc_id))

    store = get_graph_store()
    store.add_entities(entities, str(project_id))
    store.add_relations(relations, str(project_id))

    return {
        "doc_id": str(doc_id),
        "entities_extracted": len(entities),
        "relations_extracted": len(relations),
    }


@router.delete("/project/{project_id}")
async def delete_project_graph(
    project_id: uuid.UUID,
    _: User = Depends(require_project_admin),
):
    """删除项目的全部图数据"""
    _check_enabled()
    from app.services.graph.store import get_graph_store
    store = get_graph_store()
    store.delete_by_project(str(project_id))
    return {"message": f"项目 {project_id} 的图数据已删除"}


def _check_enabled():
    if not getattr(settings, "GRAPHRAG_ENABLED", False):
        raise HTTPException(status_code=400, detail="GraphRAG 未启用，请设置 GRAPHRAG_ENABLED=true")

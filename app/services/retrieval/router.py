"""
查询路由器 — Phase 3 完整版
新增: MULTI_AGENT 策略（四 Agent 协作）和 GRAPH_ENHANCED 策略（图增强检索）
"""
from __future__ import annotations

import logging
from enum import Enum

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.database import Document

logger = logging.getLogger(__name__)
settings = get_settings()

DOC_COUNT_THRESHOLD = 50


class RetrievalStrategy(str, Enum):
    VECTOR_RAG = "vector_rag"
    MCP_TOOL = "mcp_tool"
    AGENTIC_RAG = "agentic_rag"        # Phase 2 保留兼容
    MULTI_AGENT = "multi_agent"         # Phase 3: 四 Agent 协作
    GRAPH_ENHANCED = "graph_enhanced"   # Phase 3: 图增强检索


async def route_query(
    query: str,
    project_id: str,
    db: AsyncSession,
    force_strategy: RetrievalStrategy | None = None,
) -> RetrievalStrategy:
    """
    查询路由决策（Phase 3）：

    1. 强制策略 → 直接使用
    2. 复杂查询（多跳推理） → MULTI_AGENT
    3. 关系类查询 + GraphRAG 已启用 + 文档量 >= 阈值 → GRAPH_ENHANCED
    4. 文档量 >= 50 → VECTOR_RAG
    5. 文档量 < 50 → MCP_TOOL
    """
    if force_strategy:
        return force_strategy

    result = await db.execute(
        select(func.count(Document.id))
        .where(Document.project_id == project_id)
        .where(Document.conversion_status == "completed")
    )
    doc_count = result.scalar() or 0

    complexity = _analyze_query_complexity(query)

    # 复杂推理 → Multi-Agent
    if complexity == "complex":
        logger.info(f"复杂查询 → multi_agent (文档数: {doc_count})")
        return RetrievalStrategy.MULTI_AGENT

    # 关系类查询 + 图已启用
    if complexity == "relational" and getattr(settings, "GRAPHRAG_ENABLED", False):
        if doc_count >= getattr(settings, "GRAPHRAG_DOC_THRESHOLD", 30):
            logger.info(f"关系查询 + 图已启用 → graph_enhanced (文档数: {doc_count})")
            return RetrievalStrategy.GRAPH_ENHANCED

    # 标准路由
    if doc_count >= DOC_COUNT_THRESHOLD:
        logger.info(f"文档数 {doc_count} >= {DOC_COUNT_THRESHOLD} → vector_rag")
        return RetrievalStrategy.VECTOR_RAG
    else:
        logger.info(f"文档数 {doc_count} < {DOC_COUNT_THRESHOLD} → mcp_tool")
        return RetrievalStrategy.MCP_TOOL


def _analyze_query_complexity(query: str) -> str:
    """
    返回: "simple" | "relational" | "complex"
    """
    complex_keywords = [
        "比较", "对比", "分析趋势", "变化原因",
        "为什么", "如何影响", "哪些因素", "综合评估",
        "不同之处", "优劣对比", "跨文档",
        "compare across", "analyze trend", "why did",
    ]

    relational_keywords = [
        "负责", "依赖", "关系", "关联", "之间",
        "谁管", "属于", "影响了", "导致",
        "responsible", "depends", "related",
    ]

    query_lower = query.lower()

    complex_matches = sum(1 for kw in complex_keywords if kw in query_lower)
    if complex_matches >= 2 or (complex_matches >= 1 and len(query) > 80):
        return "complex"
    if len(query) > 120:
        return "complex"

    if any(kw in query_lower for kw in relational_keywords):
        return "relational"

    return "simple"

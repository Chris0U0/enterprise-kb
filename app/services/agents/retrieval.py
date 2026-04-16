"""
Retrieval Agent — 检索专家

职责边界：
  - 使用向量检索、MCP 工具、GraphRAG 获取原始内容
  - 只返回原始内容 + 来源，不做分析
  - 不越权做推理或生成
"""
from __future__ import annotations

import logging

from app.services.agents.base import BaseAgent
from app.services.agents.message import AgentMessage, AgentRole, TaskStatus

logger = logging.getLogger(__name__)


class RetrievalAgent(BaseAgent):
    role = AgentRole.RETRIEVAL
    name = "retrieval_agent"

    async def execute(self, msg: AgentMessage) -> AgentMessage:
        """
        执行检索：
        1. 向量检索 (HybridSearcher)
        2. 如果启用 GraphRAG，追加图查询结果
        """
        from app.services.retrieval.searcher import get_searcher
        from app.core.config import get_settings

        settings = get_settings()
        query = msg.query
        project_id = msg.project_id
        top_k = msg.context.get("top_k", 5) if isinstance(msg.context, dict) else 5

        # 向量检索
        searcher = get_searcher()
        results = await searcher.search(query=query, project_id=project_id, top_k=top_k)

        if not results:
            msg.result = "未检索到相关信息"
            msg.confidence = 0.2
            msg.status = TaskStatus.COMPLETED
            return msg

        # 拼接结果
        text_parts = []
        sources = []
        for i, r in enumerate(results, 1):
            doc_name = r.payload.get("doc_name", "未知")
            section = r.payload.get("section_path", "")
            text_parts.append(f"[来源{i}] {doc_name}/{section}: {r.content_snippet}")
            sources.append(r.payload)

        # GraphRAG 增强（如果启用）
        graph_text = ""
        if getattr(settings, "GRAPHRAG_ENABLED", False):
            try:
                from app.services.graph.query import query_graph
                graph_results = await query_graph(query, project_id)
                if graph_results:
                    graph_text = "\n\n[图谱关系]\n" + graph_results
            except Exception as e:
                logger.warning(f"GraphRAG 查询跳过: {e}")

        combined = "\n".join(text_parts) + graph_text
        avg_score = sum(r.score for r in results) / len(results)

        msg.result = combined
        msg.sources = sources
        msg.confidence = min(avg_score * 1.2, 1.0)
        msg.status = TaskStatus.COMPLETED
        return msg

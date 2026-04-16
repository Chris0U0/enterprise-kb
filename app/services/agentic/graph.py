"""
Agentic RAG LangGraph 图定义
Plan-and-Execute 架构：Planner → [Executor]×N → Synthesizer

图结构:
  START → planner → executor → should_continue?
                                  ├─ Yes → executor (循环)
                                  └─ No  → synthesizer → END
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from langgraph.graph import StateGraph, END

from app.services.agentic.state import AgenticState, MAX_STEPS, TIMEOUT_SECONDS
from app.services.agentic.planner import plan_node
from app.services.agentic.executor import executor_node
from app.services.agentic.synthesizer import synthesizer_node

logger = logging.getLogger(__name__)


def _should_continue(state: AgenticState) -> str:
    """
    条件边：判断是否继续执行下一步骤

    终止条件（任一满足即停止）:
    1. plan 为空
    2. should_continue == False
    3. current_step >= len(plan)
    4. current_step >= MAX_STEPS
    """
    plan = state.get("plan", [])
    current = state.get("current_step", 0)
    cont = state.get("should_continue", False)

    if not plan or not cont or current >= len(plan) or current >= MAX_STEPS:
        return "synthesize"
    return "execute"


def build_agentic_graph() -> StateGraph:
    """构建 Agentic RAG 的 LangGraph 状态图"""

    graph = StateGraph(AgenticState)

    # 添加节点
    graph.add_node("planner", plan_node)
    graph.add_node("executor", executor_node)
    graph.add_node("synthesizer", synthesizer_node)

    # 入口
    graph.set_entry_point("planner")

    # 边
    graph.add_edge("planner", "executor")
    graph.add_conditional_edges(
        "executor",
        _should_continue,
        {
            "execute": "executor",      # 继续执行下一步
            "synthesize": "synthesizer", # 结束执行，汇总
        },
    )
    graph.add_edge("synthesizer", END)

    return graph


# 编译后的图（单例）
_compiled_graph = None


def get_agentic_graph():
    global _compiled_graph
    if _compiled_graph is None:
        graph = build_agentic_graph()
        _compiled_graph = graph.compile()
    return _compiled_graph


async def run_agentic_rag(
    query: str,
    project_id: str,
    top_k: int = 5,
) -> dict:
    """
    执行 Agentic RAG 完整流程

    Args:
        query: 用户查询
        project_id: 项目 ID
        top_k: 每步检索数量

    Returns:
        {
            "answer": str,
            "citations": list[dict],
            "traces": list[dict],   # 推理轨迹（前端展示）
            "confidence": float,
            "steps_executed": int,
            "llm_calls": int,
            "total_duration_ms": float,
        }
    """
    start = time.time()

    initial_state: AgenticState = {
        "original_query": query,
        "project_id": project_id,
        "top_k": top_k,
        "plan": [],
        "current_step": 0,
        "retrieved_contexts": [],
        "analysis_results": [],
        "traces": [],
        "final_answer": "",
        "citations": [],
        "overall_confidence": 0.0,
        "llm_call_count": 0,
        "total_duration_ms": 0.0,
        "should_continue": True,
        "error": "",
    }

    compiled = get_agentic_graph()

    # 带超时执行
    try:
        final_state = await asyncio.wait_for(
            _invoke_graph(compiled, initial_state),
            timeout=TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.warning(f"Agentic RAG 超时 ({TIMEOUT_SECONDS}s), 强制返回已有结果")
        final_state = initial_state
        final_state["final_answer"] = "检索分析超时，以下为已获取的部分结果：\n" + "\n".join(
            r[:200] for r in initial_state.get("analysis_results", [])
        )

    total_ms = (time.time() - start) * 1000
    plan = final_state.get("plan", [])
    completed_steps = sum(1 for s in plan if s.get("status") == "completed")

    logger.info(
        f"Agentic RAG 完成: {completed_steps}/{len(plan)} 步, "
        f"{final_state.get('llm_call_count', 0)} LLM 调用, "
        f"{total_ms:.0f}ms"
    )

    return {
        "answer": final_state.get("final_answer", ""),
        "citations": final_state.get("citations", []),
        "traces": final_state.get("traces", []),
        "confidence": final_state.get("overall_confidence", 0.0),
        "steps_executed": completed_steps,
        "llm_calls": final_state.get("llm_call_count", 0),
        "total_duration_ms": round(total_ms, 2),
    }


async def _invoke_graph(compiled, state: AgenticState) -> dict:
    """异步调用 LangGraph 图"""
    result = await compiled.ainvoke(state)
    return result

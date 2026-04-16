"""
Multi-Agent LangGraph 图定义（Phase 3）

图结构（星形拓扑）：
  START → orchestrator → dispatch → [retrieval|analysis|generation](可并行) → aggregate → END

替代 Phase 2 的线性 Plan-and-Execute 图。
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, TypedDict

from langgraph.graph import StateGraph, END

from app.services.agents.message import AgentMessage, AgentRole, TaskStatus
from app.services.agents.orchestrator import OrchestratorAgent
from app.services.agents.retrieval import RetrievalAgent
from app.services.agents.analysis import AnalysisAgent
from app.services.agents.generation import GenerationAgent

logger = logging.getLogger(__name__)

# ── Agent 单例 ───────────────────────────────────────────
_orchestrator = OrchestratorAgent()
_retrieval = RetrievalAgent()
_analysis = AnalysisAgent()
_generation = GenerationAgent()

AGENT_MAP = {
    "retrieval": _retrieval,
    "analysis": _analysis,
    "generation": _generation,
}


# ── State ────────────────────────────────────────────────

class MultiAgentState(TypedDict):
    query: str
    project_id: str
    top_k: int
    # Orchestrator 输出
    plan: list[dict]
    # 累积结果
    agent_results: list[dict]   # AgentMessage.to_dict() 列表
    all_sources: list[dict]
    # 最终输出
    final_answer: str
    citations: list[dict]
    traces: list[dict]
    # 计量
    total_tokens: int
    total_duration_ms: float
    error: str


# ── Nodes ────────────────────────────────────────────────

async def orchestrate_node(state: MultiAgentState) -> dict:
    """Orchestrator: 分解任务"""
    msg = AgentMessage(
        sender=AgentRole.ORCHESTRATOR,
        receiver=AgentRole.ORCHESTRATOR,
        query=state["query"],
        project_id=state["project_id"],
        token_budget=16000,
        timeout_seconds=15,
    )
    result = await _orchestrator.handle(msg)

    plan = []
    if result.status == TaskStatus.COMPLETED:
        try:
            plan = json.loads(result.result)
        except json.JSONDecodeError:
            plan = []

    return {
        "plan": plan,
        "total_tokens": result.token_usage,
        "traces": [{
            "agent": "orchestrator",
            "action": "plan",
            "result": f"分解为 {len(plan)} 个子任务",
            "tokens": result.token_usage,
            "duration_ms": result.duration_ms,
        }],
    }


async def dispatch_node(state: MultiAgentState) -> dict:
    """
    分发子任务到对应 Agent。
    标记 parallel=True 的任务并行执行，其余串行。
    """
    plan = state.get("plan", [])
    if not plan:
        return {"agent_results": [], "all_sources": []}

    all_results = []
    all_sources = []
    traces = list(state.get("traces", []))
    total_tokens = state.get("total_tokens", 0)

    # 分离并行和串行任务
    parallel_tasks = [s for s in plan if s.get("parallel")]
    serial_tasks = [s for s in plan if not s.get("parallel")]

    # 先执行并行任务
    if parallel_tasks:
        parallel_msgs = []
        for step in parallel_tasks:
            msg = AgentMessage(
                sender=AgentRole.ORCHESTRATOR,
                receiver=AgentRole(step.get("agent", "retrieval")),
                action=step.get("action", "retrieve"),
                query=step.get("query", state["query"]),
                project_id=state["project_id"],
                context={"top_k": state.get("top_k", 5)},
            )
            parallel_msgs.append((step, msg))

        async_tasks = [
            AGENT_MAP.get(step.get("agent", "retrieval"), _retrieval).handle(msg)
            for step, msg in parallel_msgs
        ]
        results = await asyncio.gather(*async_tasks, return_exceptions=True)

        for (step, _), result in zip(parallel_msgs, results):
            if isinstance(result, Exception):
                logger.error(f"并行任务失败: {step}: {result}")
                continue
            all_results.append(result.to_dict())
            all_sources.extend(result.sources)
            total_tokens += result.token_usage
            traces.append({
                "agent": step.get("agent"), "action": step.get("action"),
                "query": step.get("query", "")[:100],
                "result": result.result[:200],
                "confidence": result.confidence,
                "tokens": result.token_usage,
                "duration_ms": result.duration_ms,
            })

    # 再串行执行剩余任务（可使用前序结果作为上下文）
    accumulated_context = list(all_sources)
    for step in serial_tasks:
        agent_name = step.get("agent", "retrieval")
        agent = AGENT_MAP.get(agent_name, _retrieval)

        msg = AgentMessage(
            sender=AgentRole.ORCHESTRATOR,
            receiver=agent.role,
            action=step.get("action", "retrieve"),
            query=step.get("query", state["query"]),
            project_id=state["project_id"],
            context=accumulated_context if agent_name != "retrieval" else {"top_k": state.get("top_k", 5)},
        )

        result = await agent.handle(msg)
        all_results.append(result.to_dict())
        all_sources.extend(result.sources)
        accumulated_context.extend(result.sources)
        total_tokens += result.token_usage
        traces.append({
            "agent": agent_name, "action": step.get("action"),
            "query": step.get("query", "")[:100],
            "result": result.result[:200],
            "confidence": result.confidence,
            "tokens": result.token_usage,
            "duration_ms": result.duration_ms,
        })

    return {
        "agent_results": all_results,
        "all_sources": all_sources,
        "traces": traces,
        "total_tokens": total_tokens,
    }


async def generate_node(state: MultiAgentState) -> dict:
    """Generation Agent: 汇总所有结果生成最终答案"""
    all_sources = state.get("all_sources", [])
    agent_results = state.get("agent_results", [])

    # 合并上下文：检索来源 + 分析结果文本
    combined_context = list(all_sources)
    for r in agent_results:
        if r.get("result"):
            combined_context.append(r["result"])

    msg = AgentMessage(
        sender=AgentRole.ORCHESTRATOR,
        receiver=AgentRole.GENERATION,
        action="generate",
        query=state["query"],
        project_id=state["project_id"],
        context=combined_context,
    )

    result = await _generation.handle(msg)
    traces = list(state.get("traces", []))
    traces.append({
        "agent": "generation", "action": "generate",
        "result": "最终答案已生成",
        "tokens": result.token_usage,
        "duration_ms": result.duration_ms,
    })

    # 构建引用
    from app.services.retrieval.citation import build_citation
    citations = []
    seen = set()
    for src in all_sources:
        if isinstance(src, dict):
            key = f"{src.get('doc_id')}_{src.get('section_path')}"
            if key not in seen:
                seen.add(key)
                citations.append(build_citation(src, score=0.8, method="multi_agent").model_dump())

    return {
        "final_answer": result.result,
        "citations": citations,
        "traces": traces,
        "total_tokens": state.get("total_tokens", 0) + result.token_usage,
    }


# ── Graph Assembly ───────────────────────────────────────

def build_multi_agent_graph() -> StateGraph:
    graph = StateGraph(MultiAgentState)

    graph.add_node("orchestrator", orchestrate_node)
    graph.add_node("dispatch", dispatch_node)
    graph.add_node("generate", generate_node)

    graph.set_entry_point("orchestrator")
    graph.add_edge("orchestrator", "dispatch")
    graph.add_edge("dispatch", "generate")
    graph.add_edge("generate", END)

    return graph


_compiled = None


def get_multi_agent_graph():
    global _compiled
    if _compiled is None:
        _compiled = build_multi_agent_graph().compile()
    return _compiled


async def run_multi_agent(query: str, project_id: str, top_k: int = 5) -> dict:
    """执行 Multi-Agent 协作流程"""
    start = time.time()

    initial: MultiAgentState = {
        "query": query,
        "project_id": project_id,
        "top_k": top_k,
        "plan": [],
        "agent_results": [],
        "all_sources": [],
        "final_answer": "",
        "citations": [],
        "traces": [],
        "total_tokens": 0,
        "total_duration_ms": 0.0,
        "error": "",
    }

    compiled = get_multi_agent_graph()

    try:
        final = await asyncio.wait_for(
            compiled.ainvoke(initial),
            timeout=45,
        )
    except asyncio.TimeoutError:
        logger.warning("Multi-Agent 超时")
        final = initial
        final["final_answer"] = "处理超时"

    total_ms = (time.time() - start) * 1000

    return {
        "answer": final.get("final_answer", ""),
        "citations": final.get("citations", []),
        "traces": final.get("traces", []),
        "total_tokens": final.get("total_tokens", 0),
        "total_duration_ms": round(total_ms, 2),
    }

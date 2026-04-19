"""
Executor 节点 — 逐步执行计划中的每个步骤
支持 retrieve / analyze / compare / summarize 四种动作
"""
from __future__ import annotations

import logging
import time

from app.core.config import get_settings
from app.services.llm import complete_chat
from app.services.agentic.state import (
    AgenticState, MAX_LLM_CALLS, MIN_CONFIDENCE,
    StepStatus, AgenticTrace,
)

logger = logging.getLogger(__name__)
settings = get_settings()


async def executor_node(state: AgenticState) -> dict:
    """
    Executor 节点：执行当前步骤

    根据 action 类型：
    - retrieve: 调用向量检索
    - analyze: 使用 LLM 分析已有上下文
    - compare: 比较多个来源
    - summarize: 汇总分析
    """
    start = time.time()

    plan = state["plan"]
    current_idx = state["current_step"]
    llm_calls = state.get("llm_call_count", 0)

    # 安全检查: LLM 调用次数上限
    if llm_calls >= MAX_LLM_CALLS:
        logger.warning(f"LLM 调用已达上限 ({MAX_LLM_CALLS}), 强制结束")
        return {"should_continue": False}

    if current_idx >= len(plan):
        return {"should_continue": False}

    step = plan[current_idx]
    step["status"] = StepStatus.RUNNING.value
    action = step["action"]
    query = step["query"]

    logger.info(f"执行步骤 {step['step_id']}: [{action}] {query}")

    try:
        if action == "retrieve":
            result, sources, confidence = await _execute_retrieve(
                query, state["project_id"], state.get("top_k", 5)
            )
        elif action in ("analyze", "compare", "summarize"):
            result, sources, confidence = await _execute_analysis(
                action, query, state.get("retrieved_contexts", []),
                state.get("analysis_results", [])
            )
            llm_calls += 1
        else:
            result = f"未知动作类型: {action}"
            sources = []
            confidence = 0.0

        step["status"] = StepStatus.COMPLETED.value
        step["result"] = result
        step["sources"] = sources
        step["confidence"] = confidence

    except Exception as e:
        logger.error(f"步骤 {step['step_id']} 执行失败: {e}")
        step["status"] = StepStatus.FAILED.value
        step["result"] = f"执行失败: {str(e)}"
        result = ""
        sources = []
        confidence = 0.0

    duration_ms = (time.time() - start) * 1000

    # 构建推理轨迹
    trace = {
        "step_id": step["step_id"],
        "thought": step["thought"],
        "query": query,
        "found": result[:200] if result else "(无结果)",
        "sources_count": len(sources),
        "confidence": confidence,
        "duration_ms": round(duration_ms, 2),
    }

    # 更新状态
    plan[current_idx] = step
    retrieved_contexts = state.get("retrieved_contexts", [])
    analysis_results = state.get("analysis_results", [])
    traces = state.get("traces", [])

    if action == "retrieve" and sources:
        retrieved_contexts.extend(sources)
    if result:
        analysis_results.append(result)
    traces.append(trace)

    next_step = current_idx + 1
    should_continue = next_step < len(plan) and confidence >= MIN_CONFIDENCE

    return {
        "plan": plan,
        "current_step": next_step,
        "retrieved_contexts": retrieved_contexts,
        "analysis_results": analysis_results,
        "traces": traces,
        "llm_call_count": llm_calls,
        "should_continue": should_continue,
    }


async def _execute_retrieve(query: str, project_id: str, top_k: int) -> tuple[str, list[dict], float]:
    """执行检索动作"""
    from app.services.retrieval.searcher import get_searcher

    searcher = get_searcher()
    results = await searcher.search(query=query, project_id=project_id, top_k=top_k)

    if not results:
        return "未检索到相关信息", [], 0.3

    # 拼接检索结果
    text_parts = []
    sources = []
    for i, r in enumerate(results, 1):
        doc_name = r.payload.get("doc_name", "未知")
        section = r.payload.get("section_path", "")
        text_parts.append(f"[来源{i}] {doc_name}/{section}: {r.content_snippet}")
        sources.append(r.payload)

    combined = "\n".join(text_parts)
    avg_score = sum(r.score for r in results) / len(results)
    confidence = min(avg_score * 1.2, 1.0)  # 归一化到 [0, 1]

    return combined, sources, confidence


async def _execute_analysis(
    action: str,
    query: str,
    contexts: list[dict],
    prior_results: list[str],
) -> tuple[str, list[dict], float]:
    """执行分析/比较/汇总动作"""
    # 构建上下文
    context_text = ""
    if contexts:
        snippets = []
        for ctx in contexts[-10:]:  # 最多取最近10条
            name = ctx.get("doc_name", "")
            snippet = ctx.get("content_snippet", "")
            snippets.append(f"- [{name}] {snippet}")
        context_text = "已检索到的文档内容：\n" + "\n".join(snippets)

    prior_text = ""
    if prior_results:
        prior_text = "前面步骤的分析结果：\n" + "\n---\n".join(prior_results[-5:])

    action_prompts = {
        "analyze": "请分析以下信息并回答问题。给出具体的分析结论。",
        "compare": "请比较以下信息中的不同数据点或观点，指出异同。",
        "summarize": "请汇总以下所有信息，形成完整的答案。标注引用来源 [ref:N]。",
    }

    prompt = f"""{action_prompts.get(action, '请分析以下信息：')}

{context_text}

{prior_text}

问题: {query}

请直接给出分析结论："""

    result = await complete_chat(prompt, max_tokens=1024)
    # 分析动作的置信度基于上下文丰富度
    confidence = min(0.5 + len(contexts) * 0.05 + len(prior_results) * 0.1, 1.0)

    return result, [], confidence

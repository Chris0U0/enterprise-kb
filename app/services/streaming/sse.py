"""
SSE 流式输出服务（修正版）

Fix #1: 全面使用 AsyncAnthropic 异步客户端，不再阻塞 Event Loop
Fix #3: stream_agentic_rag 复用 LangGraph 状态机（通过 astream_events），
        不再手动重写循环逻辑，消除 DRY 违反

SSE 事件类型：
  - step:      Agentic RAG 推理步骤更新
  - thinking:  当前思考过程
  - chunk:     LLM 生成的文本增量
  - citation:  引用来源信息
  - done:      完成信号 + 最终元数据
  - error:     错误信息
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import AsyncGenerator

import anthropic

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _sse_event(event_type: str, data: dict) -> str:
    """格式化为 SSE 事件字符串"""
    json_data = json.dumps(data, ensure_ascii=False, default=str)
    return f"event: {event_type}\ndata: {json_data}\n\n"


# ══════════════════════════════════════════════════════════
# 流式 LLM 调用 — 使用 AsyncAnthropic
# ══════════════════════════════════════════════════════════

async def stream_llm_response(
    prompt: str,
    system: str | None = None,
) -> AsyncGenerator[str, None]:
    """
    流式调用 Claude API（异步），逐 token 返回 SSE 事件。
    使用 AsyncAnthropic 客户端，不阻塞 Event Loop。
    """
    try:
        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

        kwargs = {
            "model": settings.ANTHROPIC_MODEL,
            "max_tokens": 2048,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system

        async with client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield _sse_event("chunk", {"text": text})

    except Exception as e:
        logger.error(f"流式 LLM 调用失败: {e}")
        yield _sse_event("error", {"message": str(e)})


# ══════════════════════════════════════════════════════════
# 流式 Agentic RAG — 复用 LangGraph 状态机
# ══════════════════════════════════════════════════════════

async def stream_agentic_rag(
    query: str,
    project_id: str,
    top_k: int = 5,
) -> AsyncGenerator[str, None]:
    """
    流式 Agentic RAG — 通过 LangGraph 的 astream 接口获取状态快照，
    将每个节点的状态变化实时推送为 SSE 事件。

    Fix #3: 不再手动循环调用 plan_node/executor_node，
    而是复用 graph.py 中定义的同一张 LangGraph 图。
    """
    start = time.time()

    from app.services.agentic.graph import get_agentic_graph
    from app.services.agentic.state import AgenticState, TIMEOUT_SECONDS

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

    yield _sse_event("step", {
        "phase": "starting",
        "message": "正在分析您的问题...",
    })

    prev_step = -1
    final_state = initial_state

    try:
        # 使用 LangGraph 的 astream 获取每个节点执行后的状态快照
        async for state_snapshot in compiled.astream(initial_state):
            # state_snapshot 是 {node_name: partial_state_update} 的字典
            for node_name, node_output in state_snapshot.items():
                final_state.update(node_output)

                if node_name == "planner":
                    plan = node_output.get("plan", [])
                    yield _sse_event("step", {
                        "phase": "plan_ready",
                        "message": f"计划制定完成，共 {len(plan)} 个步骤",
                        "steps": [
                            {"id": s["step_id"], "thought": s["thought"], "action": s["action"]}
                            for s in plan
                        ],
                    })

                elif node_name == "executor":
                    current = final_state.get("current_step", 0)
                    plan = final_state.get("plan", [])
                    # current_step 已自增，所以上一步完成的是 current-1
                    completed_idx = current - 1
                    if 0 <= completed_idx < len(plan) and completed_idx != prev_step:
                        step = plan[completed_idx]
                        yield _sse_event("thinking", {
                            "step_id": step["step_id"],
                            "thought": step["thought"],
                            "action": step["action"],
                            "query": step["query"],
                        })
                        yield _sse_event("step", {
                            "phase": "step_completed",
                            "step_id": step["step_id"],
                            "status": step.get("status", ""),
                            "found": step.get("result", "")[:200],
                            "sources_count": len(step.get("sources", [])),
                            "confidence": step.get("confidence", 0),
                        })
                        prev_step = completed_idx

                elif node_name == "synthesizer":
                    yield _sse_event("step", {
                        "phase": "synthesizing",
                        "message": "正在综合分析结果...",
                    })

    except asyncio.TimeoutError:
        yield _sse_event("error", {"message": f"推理超时 ({TIMEOUT_SECONDS}s)"})
    except Exception as e:
        logger.error(f"Agentic RAG 流式执行失败: {e}")
        yield _sse_event("error", {"message": str(e)})

    # 流式输出最终答案
    answer = final_state.get("final_answer", "")
    if answer:
        # 将答案按段落分块推送（模拟流式效果）
        chunks = answer.split("\n")
        for chunk in chunks:
            if chunk:
                yield _sse_event("chunk", {"text": chunk + "\n"})
                await asyncio.sleep(0.01)

    # 推送引用
    from app.services.retrieval.citation import build_citation
    contexts = final_state.get("retrieved_contexts", [])
    citations_out = []
    seen = set()
    for ctx in contexts:
        key = f"{ctx.get('doc_id')}_{ctx.get('section_path')}"
        if key not in seen:
            seen.add(key)
            citation = build_citation(ctx, score=0.8, method="agentic_rag")
            c = citation.model_dump()
            for k, v in c.items():
                if hasattr(v, "isoformat"):
                    c[k] = v.isoformat()
                elif hasattr(v, "hex"):
                    c[k] = str(v)
            citations_out.append(c)
            yield _sse_event("citation", c)

    total_ms = (time.time() - start) * 1000
    plan = final_state.get("plan", [])
    completed = sum(1 for s in plan if s.get("status") == "completed")

    yield _sse_event("done", {
        "status": "completed",
        "steps_executed": completed,
        "total_steps": len(plan),
        "llm_calls": final_state.get("llm_call_count", 0),
        "total_duration_ms": round(total_ms, 2),
        "citation_count": len(citations_out),
    })


# ══════════════════════════════════════════════════════════
# 流式标准 RAG
# ══════════════════════════════════════════════════════════

async def stream_search_response(
    query: str,
    project_id: str,
    top_k: int = 5,
) -> AsyncGenerator[str, None]:
    """流式标准 RAG — 检索 + 流式生成答案"""
    start = time.time()

    yield _sse_event("step", {"phase": "retrieving", "message": "正在检索相关文档..."})

    from app.services.retrieval.searcher import get_searcher
    from app.services.retrieval.citation import build_citation, build_llm_context

    searcher = get_searcher()
    results = await searcher.search(query=query, project_id=project_id, top_k=top_k)

    if not results:
        yield _sse_event("chunk", {"text": "根据现有文档未找到与您问题相关的信息。"})
        yield _sse_event("done", {"status": "no_results"})
        return

    yield _sse_event("step", {
        "phase": "retrieved",
        "message": f"找到 {len(results)} 条相关内容，正在生成答案...",
        "result_count": len(results),
    })

    context_results = [
        {"content_snippet": r.content_snippet, "payload": r.payload, "score": r.score}
        for r in results
    ]
    prompt = build_llm_context(query, context_results)

    async for event in stream_llm_response(prompt):
        yield event

    for r in results:
        citation = build_citation(r.payload, r.score, r.retrieval_method)
        c = citation.model_dump()
        for k, v in c.items():
            if hasattr(v, "isoformat"):
                c[k] = v.isoformat()
            elif hasattr(v, "hex"):
                c[k] = str(v)
        yield _sse_event("citation", c)

    total_ms = (time.time() - start) * 1000
    yield _sse_event("done", {
        "status": "completed",
        "total_duration_ms": round(total_ms, 2),
        "citation_count": len(results),
    })

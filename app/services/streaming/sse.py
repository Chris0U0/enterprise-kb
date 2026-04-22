"""
SSE 流式输出服务（修正版）

LLM 流式输出经 app.services.llm（DashScope OpenAI 兼容 / Claude）。
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
import uuid
import datetime
from typing import AsyncGenerator, List, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.services.llm import stream_chat_chunks
from app.models.database import ChatSession, ChatMessage

logger = logging.getLogger(__name__)
settings = get_settings()

def _sse_event(event_type: str, data: dict) -> str:
    """格式化为 SSE 事件字符串"""
    json_data = json.dumps(data, ensure_ascii=False, default=str)
    return f"event: {event_type}\ndata: {json_data}\n\n"

async def get_chat_context(session_id: uuid.UUID, db: AsyncSession, limit: int = 6) -> List[dict]:
    """获取会话的历史上下文供 LLM 使用"""
    query = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    messages = result.scalars().all()
    # 转回正序：[{"role": "user", "content": "..."}, ...]
    return [{"role": m.role, "content": m.content} for m in reversed(messages)]

async def save_chat_message(
    session_id: uuid.UUID, 
    role: str, 
    content: str, 
    db: AsyncSession, 
    citations: Optional[List] = None
):
    """保存单条消息到数据库，并更新会话时间"""
    msg = ChatMessage(
        session_id=session_id,
        role=role,
        content=content,
        citations=citations
    )
    db.add(msg)
    # 更新会话的 updated_at
    await db.execute(
        update(ChatSession)
        .where(ChatSession.id == session_id)
        .values(updated_at=datetime.datetime.utcnow())
    )
    await db.commit()

async def stream_llm_response(
    prompt: str,
    system: str | None = None,
    history: List[dict] | None = None, # 支持传入历史
) -> AsyncGenerator[str, None]:
    """
    流式调用 LLM，支持注入对话历史。
    """
    try:
        async for text in stream_chat_chunks(prompt, system=system, history=history, max_tokens=2048):
            yield _sse_event("chunk", {"text": text})

    except Exception as e:
        logger.exception(f"流式 LLM 调用失败")
        yield _sse_event("error", {"message": f"连接模型失败: {str(e)}"})


# ══════════════════════════════════════════════════════════
# 流式 Agentic RAG — 复用 LangGraph 状态机
# ══════════════════════════════════════════════════════════

async def stream_agentic_rag(
    query: str,
    project_id: str,
    user_id: uuid.UUID,
    db: AsyncSession,
    session_id: Optional[uuid.UUID] = None,
    top_k: int = 5,
) -> AsyncGenerator[str, None]:
    """
    流式 Agentic RAG (支持持久化与多轮对话)
    """
    start_time = time.time()
    
    # 1. 自动处理 Session
    if not session_id:
        session = ChatSession(
            project_id=uuid.UUID(project_id),
            user_id=user_id,
            title=query[:50]
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        session_id = session.id
        yield _sse_event("session_id", {"id": str(session_id)})
    
    # 2. 获取历史上下文并保存用户消息
    history = await get_chat_context(session_id, db)
    await save_chat_message(session_id, "user", query, db)

    from app.services.agentic.graph import get_agentic_graph
    from app.services.agentic.state import AgenticState, TIMEOUT_SECONDS

    # 3. 运行 Agentic RAG
    initial_state: AgenticState = {
        "original_query": query,
        "project_id": project_id,
        "top_k": top_k,
        "chat_history": history, # 注入历史
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
    yield _sse_event("step", {"phase": "starting", "message": "正在分析您的问题..."})

    prev_step = -1
    final_state = initial_state

    try:
        async for state_snapshot in compiled.astream(initial_state):
            for node_name, node_output in state_snapshot.items():
                final_state.update(node_output)
                if node_name == "planner":
                    plan = node_output.get("plan", [])
                    yield _sse_event("step", {
                        "phase": "plan_ready",
                        "message": f"计划制定完成，共 {len(plan)} 个步骤",
                        "steps": [{"id": s["step_id"], "thought": s["thought"], "action": s["action"]} for s in plan],
                    })
                elif node_name == "executor":
                    current = final_state.get("current_step", 0)
                    plan = final_state.get("plan", [])
                    completed_idx = current - 1
                    if 0 <= completed_idx < len(plan) and completed_idx != prev_step:
                        step = plan[completed_idx]
                        yield _sse_event("thinking", {
                            "step_id": step["step_id"], "thought": step["thought"],
                            "action": step["action"], "query": step["query"],
                        })
                        yield _sse_event("step", {
                            "phase": "step_completed", "step_id": step["step_id"],
                            "status": step.get("status", ""), "found": step.get("result", "")[:200],
                            "sources_count": len(step.get("sources", [])), "confidence": step.get("confidence", 0),
                        })
                        prev_step = completed_idx
                elif node_name == "synthesizer":
                    yield _sse_event("step", {"phase": "synthesizing", "message": "正在综合分析结果..."})
    except asyncio.TimeoutError:
        yield _sse_event("error", {"message": f"推理超时 ({TIMEOUT_SECONDS}s)"})
    except Exception as e:
        logger.error(f"Agentic RAG 流式执行失败: {e}")
        yield _sse_event("error", {"message": str(e)})

    # 4. 流式输出最终答案
    answer = final_state.get("final_answer", "")
    if answer:
        chunks = answer.split("\n")
        for chunk in chunks:
            if chunk:
                yield _sse_event("chunk", {"text": chunk + "\n"})
                await asyncio.sleep(0.01)

    # 5. 推送引用并持久化最终结果
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
            # 序列化处理
            for k, v in c.items():
                if hasattr(v, "isoformat"): c[k] = v.isoformat()
                elif hasattr(v, "hex"): c[k] = str(v)
            citations_out.append(c)
            yield _sse_event("citation", c)

    if answer:
        await save_chat_message(session_id, "assistant", answer, db, citations=citations_out)

    total_ms = (time.time() - start_time) * 1000
    plan = final_state.get("plan", [])
    completed = sum(1 for s in plan if s.get("status") == "completed")

    yield _sse_event("done", {
        "status": "completed",
        "steps_executed": completed,
        "total_steps": len(plan),
        "llm_calls": final_state.get("llm_call_count", 0),
        "total_duration_ms": round(total_ms, 2),
        "citation_count": len(citations_out),
        "session_id": str(session_id)
    })


# ══════════════════════════════════════════════════════════
# 流式标准 RAG
# ══════════════════════════════════════════════════════════

async def stream_search_response(
    query: str,
    project_id: str,
    user_id: uuid.UUID,
    db: AsyncSession,
    session_id: Optional[uuid.UUID] = None,
    top_k: int = 5,
) -> AsyncGenerator[str, None]:
    """流式标准 RAG — 支持持久化与多轮对话"""
    start_time = time.time()

    # 1. 自动处理 Session
    if not session_id:
        session = ChatSession(
            project_id=uuid.UUID(project_id),
            user_id=user_id,
            title=query[:50]
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        session_id = session.id
        yield _sse_event("session_id", {"id": str(session_id)})
    
    # 2. 获取历史上下文并保存用户消息
    history = await get_chat_context(session_id, db)
    await save_chat_message(session_id, "user", query, db)

    yield _sse_event("step", {"phase": "retrieving", "message": "正在检索相关文档..."})

    from app.services.retrieval.searcher import get_searcher
    from app.services.retrieval.citation import build_citation, build_llm_context

    searcher = get_searcher()
    results = await searcher.search(query=query, project_id=project_id, top_k=top_k)

    if not results:
        no_res_msg = "根据现有文档未找到与您问题相关的信息。"
        yield _sse_event("chunk", {"text": no_res_msg})
        await save_chat_message(session_id, "assistant", no_res_msg, db)
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

    # 3. 流式生成并累计答案
    full_answer = ""
    async for event in stream_llm_response(prompt, history=history):
        # 解析出文本增量以进行累计
        if "chunk" in event:
            try:
                # 提取 data 部分的 json
                data_json = event.split("data: ")[1].strip()
                chunk_data = json.loads(data_json)
                full_answer += chunk_data.get("text", "")
            except:
                pass
        yield event

    # 4. 推送引用并持久化答案
    citations_data = []
    for r in results:
        citation = build_citation(r.payload, r.score, r.retrieval_method)
        c = citation.model_dump()
        # 序列化处理
        for k, v in c.items():
            if hasattr(v, "isoformat"): c[k] = v.isoformat()
            elif hasattr(v, "hex"): c[k] = str(v)
        
        citations_data.append(c)
        yield _sse_event("citation", c)

    # 保存 AI 回答
    if full_answer:
        await save_chat_message(session_id, "assistant", full_answer, db, citations=citations_data)

    total_ms = (time.time() - start_time) * 1000
    yield _sse_event("done", {
        "status": "completed",
        "total_duration_ms": round(total_ms, 2),
        "citation_count": len(results),
        "session_id": str(session_id)
    })

"""
问答审计 + RAGAS 在线抽样触发（SSE / 非流式共用）
"""
from __future__ import annotations

import asyncio
import logging
import uuid

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def extract_context_snippets(raw_contexts: list) -> list[str]:
    """从检索结果 payload、字符串列表等统一提取上下文片段。"""
    snippets: list[str] = []
    for item in raw_contexts or []:
        if isinstance(item, str) and item.strip():
            snippets.append(item.strip()[:500])
        elif isinstance(item, dict):
            text = item.get("content_snippet") or item.get("content") or ""
            if text:
                snippets.append(str(text).strip()[:500])
    return snippets


async def record_qa_query(
    *,
    project_id: uuid.UUID | str,
    user_id: uuid.UUID | None = None,
    query: str,
    answer: str,
    contexts: list,
    strategy: str,
    latency_ms: float | None = None,
    extra: dict | None = None,
) -> None:
    """写入 qa_query 审计日志（独立 session，适用于 SSE 已 commit 的场景）。"""
    from app.core.database import AsyncSessionLocal
    from app.models.database import AuditLog

    context_snippets = extract_context_snippets(contexts)
    payload: dict = {
        "query": query,
        "answer": (answer or "")[:2000],
        "contexts": context_snippets,
        "strategy": strategy,
    }
    if latency_ms is not None:
        payload["latency_ms"] = round(latency_ms, 2)
    if extra:
        payload.update(extra)

    pid = uuid.UUID(str(project_id)) if project_id else None
    try:
        async with AsyncSessionLocal() as db:
            db.add(
                AuditLog(
                    event_type="qa_query",
                    project_id=pid,
                    user_id=user_id,
                    payload=payload,
                )
            )
            await db.commit()
    except Exception as e:
        logger.warning(f"写入 qa_query 审计日志失败: {e}")


def schedule_ragas_evaluation(
    *,
    query: str,
    answer: str,
    contexts: list[str],
    project_id: str | None = None,
) -> None:
    """按 RAGAS_SAMPLE_RATE 异步触发在线评估（不阻塞响应）。"""
    if not getattr(settings, "RAGAS_ENABLED", False):
        return
    if not (answer or "").strip():
        return

    from app.services.evaluation.scheduler import evaluate_single_query

    asyncio.create_task(
        evaluate_single_query(
            query=query,
            answer=answer,
            contexts=contexts,
            project_id=project_id,
        )
    )


async def record_qa_and_schedule_eval(
    *,
    project_id: uuid.UUID | str,
    user_id: uuid.UUID | None = None,
    query: str,
    answer: str,
    contexts: list,
    strategy: str,
    latency_ms: float | None = None,
    extra: dict | None = None,
) -> None:
    """记录问答审计并触发 RAGAS 在线抽样。"""
    snippets = extract_context_snippets(contexts)
    await record_qa_query(
        project_id=project_id,
        user_id=user_id,
        query=query,
        answer=answer,
        contexts=snippets,
        strategy=strategy,
        latency_ms=latency_ms,
        extra=extra,
    )
    schedule_ragas_evaluation(
        query=query,
        answer=answer,
        contexts=snippets,
        project_id=str(project_id) if project_id else None,
    )

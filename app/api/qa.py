"""
问答会话 API（基于 audit_logs）
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_project_member, get_current_user
from app.core.database import get_db
from app.models.database import AuditLog, User

router = APIRouter(prefix="/qa", tags=["QA"])


@router.get("/sessions")
async def list_qa_sessions(
    project_id: uuid.UUID = Query(...),
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_project_member(project_id, user, db)
    stmt = (
        select(AuditLog)
        .where(
            AuditLog.event_type == "qa_query",
            AuditLog.project_id == project_id,
        )
        .order_by(desc(AuditLog.created_at))
    )
    logs = (await db.execute(stmt)).scalars().all()

    if q and q.strip():
        keyword = q.strip().lower()
        logs = [
            x
            for x in logs
            if keyword in str((x.payload or {}).get("query", "")).lower()
            or keyword in str((x.payload or {}).get("answer", "")).lower()
        ]

    total = len(logs)
    start = (page - 1) * page_size
    rows = logs[start : start + page_size]

    items = []
    for row in rows:
        payload = row.payload or {}
        answer = str(payload.get("answer", ""))
        items.append(
            {
                "session_id": str(row.id),
                "question": str(payload.get("query", "")),
                "answer_preview": answer[:180],
                "created_at": row.created_at.isoformat() if row.created_at else "",
                "citation_count": len(payload.get("cited_docs") or []),
                "retrieval_method": payload.get("strategy", ""),
                "user_id": str(row.user_id) if row.user_id else None,
            }
        )

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/sessions/{session_id}")
async def get_qa_session_detail(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(AuditLog).where(
                AuditLog.id == session_id,
                AuditLog.event_type == "qa_query",
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    if row.project_id is None:
        raise HTTPException(status_code=400, detail="该会话无项目信息")

    await ensure_project_member(row.project_id, user, db)
    payload = row.payload or {}
    return {
        "session_id": str(row.id),
        "project_id": str(row.project_id),
        "question": str(payload.get("query", "")),
        "answer": str(payload.get("answer", "")),
        "contexts": payload.get("contexts", []),
        "cited_docs": payload.get("cited_docs", []),
        "retrieval_method": payload.get("strategy", ""),
        "latency_ms": payload.get("latency_ms", 0),
        "created_at": row.created_at.isoformat() if row.created_at else "",
        "user_id": str(row.user_id) if row.user_id else None,
    }


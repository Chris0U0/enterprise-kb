"""会话导出与快照分享"""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import ChatMessage, ChatSession, ChatSessionShare, Project, User


def _role_label(role: str) -> str:
    return "你" if role == "user" else "AI 助手"


def _format_ts(dt: datetime | None) -> str:
    if not dt:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    local = dt.astimezone(timezone.utc)
    return local.strftime("%Y-%m-%d %H:%M UTC")


def sanitize_citations(citations: list | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for c in citations or []:
        if not isinstance(c, dict):
            continue
        item: dict[str, Any] = {}
        if c.get("doc_name"):
            item["doc_name"] = str(c["doc_name"])
        if c.get("section_title"):
            item["section_title"] = str(c["section_title"])
        elif c.get("section_path"):
            item["section_path"] = str(c["section_path"])
        if c.get("page_num") is not None:
            item["page_num"] = c["page_num"]
        if item:
            out.append(item)
    return out


def build_snapshot_messages(messages: List[ChatMessage]) -> list[dict[str, Any]]:
    return [
        {
            "role": m.role,
            "content": m.content,
            "citations": sanitize_citations(m.citations if isinstance(m.citations, list) else None),
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in messages
    ]


def export_session_markdown(
    *,
    title: str,
    project_name: str | None,
    messages: List[ChatMessage],
    exported_at: datetime | None = None,
) -> str:
    exported_at = exported_at or datetime.now(timezone.utc)
    lines = [
        f"# {title}",
        "",
        f"> 导出时间：{_format_ts(exported_at)}",
    ]
    if project_name:
        lines.append(f"> 项目：{project_name}")
    lines.append("")

    for m in messages:
        lines.append(f"## {_role_label(m.role)} · {_format_ts(m.created_at)}")
        lines.append("")
        lines.append(m.content)
        lines.append("")
        cites = sanitize_citations(m.citations if isinstance(m.citations, list) else None)
        if cites:
            lines.append("**引用：**")
            for c in cites:
                parts = [c.get("doc_name", "文档")]
                if c.get("section_title"):
                    parts.append(str(c["section_title"]))
                if c.get("page_num") is not None:
                    parts.append(f"第{c['page_num']}页")
                lines.append(f"- {' · '.join(parts)}")
            lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def export_session_json(
    *,
    title: str,
    project_name: str | None,
    session_id: str,
    messages: List[ChatMessage],
    exported_at: datetime | None = None,
) -> str:
    exported_at = exported_at or datetime.now(timezone.utc)
    payload = {
        "session_id": session_id,
        "title": title,
        "project_name": project_name,
        "exported_at": exported_at.isoformat(),
        "messages": build_snapshot_messages(messages),
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


def generate_share_token() -> str:
    return secrets.token_urlsafe(32)


async def load_session_messages(
    session_id,
    db: AsyncSession,
) -> tuple[ChatSession, List[ChatMessage], str | None]:
    session_result = await db.execute(select(ChatSession).where(ChatSession.id == session_id))
    session = session_result.scalar_one_or_none()
    if not session:
        raise ValueError("会话不存在")

    msg_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    messages = list(msg_result.scalars().all())

    project_name: str | None = None
    proj_result = await db.execute(select(Project.name).where(Project.id == session.project_id))
    project_name = proj_result.scalar_one_or_none()

    return session, messages, project_name


async def create_session_share(
    *,
    session: ChatSession,
    messages: List[ChatMessage],
    project_name: str | None,
    user: User,
    db: AsyncSession,
    expires_in_days: Optional[int] = 7,
) -> ChatSessionShare:
    if not messages:
        raise ValueError("空会话无法分享")

    expires_at = None
    if expires_in_days and expires_in_days > 0:
        expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)

    share = ChatSessionShare(
        session_id=session.id,
        share_token=generate_share_token(),
        created_by=user.id,
        title=session.title,
        project_name=project_name,
        snapshot=build_snapshot_messages(messages),
        expires_at=expires_at,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)
    return share


async def get_valid_share_by_token(
    token: str,
    db: AsyncSession,
    *,
    increment_view: bool = True,
) -> ChatSessionShare:
    result = await db.execute(
        select(ChatSessionShare).where(ChatSessionShare.share_token == token)
    )
    share = result.scalar_one_or_none()
    if not share:
        raise ValueError("分享不存在")

    if share.revoked_at is not None:
        raise ValueError("分享已撤销")

    if share.expires_at is not None:
        exp = share.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > exp:
            raise ValueError("分享已过期")

    if increment_view:
        share.view_count = (share.view_count or 0) + 1
        await db.commit()
        await db.refresh(share)

    return share

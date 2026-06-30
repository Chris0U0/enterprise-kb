from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_project_member, get_current_user
from app.core.database import get_db
from app.models.database import ChatMessage, ChatSession, ChatSessionShare, User
from app.services.chat.export_share import (
    create_session_share,
    export_session_json,
    export_session_markdown,
    load_session_messages,
)

router = APIRouter(prefix="/chat", tags=["Chat"])


class ChatMessageSchema(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    citations: Optional[List] = None
    feedback: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatSessionSchema(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EditMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=8000)


class MessageFeedbackRequest(BaseModel):
    rating: Optional[Literal["up", "down"]] = None


class RegenerateResponse(BaseModel):
    session_id: uuid.UUID
    query: str
    message_id: uuid.UUID


class CreateShareRequest(BaseModel):
    """expires_in_days: 0 表示永久有效，1~365 表示天数"""
    expires_in_days: Optional[int] = Field(default=7, ge=0, le=365)


class ShareLinkSchema(BaseModel):
    id: uuid.UUID
    share_token: str
    share_path: str
    title: str
    expires_at: datetime | None
    revoked_at: datetime | None
    view_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class CreateShareResponse(BaseModel):
    share_token: str
    share_path: str
    expires_at: datetime | None
    created_at: datetime


async def _get_owned_session(
    session_id: uuid.UUID,
    user: User,
    db: AsyncSession,
) -> ChatSession:
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    if session.user_id != user.id:
        raise HTTPException(status_code=403, detail="无权操作他人的会话")
    await ensure_project_member(session.project_id, user, db)
    return session


async def _get_owned_message(
    message_id: uuid.UUID,
    user: User,
    db: AsyncSession,
) -> tuple[ChatMessage, ChatSession]:
    result = await db.execute(select(ChatMessage).where(ChatMessage.id == message_id))
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="消息不存在")

    session_result = await db.execute(
        select(ChatSession).where(ChatSession.id == message.session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    if session.user_id != user.id:
        raise HTTPException(status_code=403, detail="无权操作他人的消息")

    await ensure_project_member(session.project_id, user, db)
    return message, session


async def _delete_messages_after(
    session_id: uuid.UUID,
    after_created_at: datetime,
    db: AsyncSession,
    inclusive: bool = False,
) -> None:
    if inclusive:
        await db.execute(
            delete(ChatMessage).where(
                ChatMessage.session_id == session_id,
                ChatMessage.created_at >= after_created_at,
            )
        )
    else:
        await db.execute(
            delete(ChatMessage).where(
                ChatMessage.session_id == session_id,
                ChatMessage.created_at > after_created_at,
            )
        )


async def _touch_session(session_id: uuid.UUID, db: AsyncSession) -> None:
    await db.execute(
        update(ChatSession)
        .where(ChatSession.id == session_id)
        .values(updated_at=datetime.utcnow())
    )


@router.get("/sessions", response_model=List[ChatSessionSchema])
async def list_chat_sessions(
    project_id: uuid.UUID = Query(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取项目下的对话历史列表"""
    await ensure_project_member(project_id, user, db)

    query = (
        select(ChatSession)
        .where(ChatSession.project_id == project_id, ChatSession.user_id == user.id)
        .order_by(ChatSession.updated_at.desc())
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/sessions/{session_id}/messages", response_model=List[ChatMessageSchema])
async def get_chat_messages(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取某个会话的所有历史消息"""
    query = select(ChatSession).where(ChatSession.id == session_id)
    result = await db.execute(query)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    await ensure_project_member(session.project_id, user, db)

    msg_query = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    msg_result = await db.execute(msg_query)
    return msg_result.scalars().all()


@router.delete("/sessions/{session_id}")
async def delete_chat_session(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除对话会话"""
    query = select(ChatSession).where(ChatSession.id == session_id)
    result = await db.execute(query)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    if session.user_id != user.id:
        raise HTTPException(status_code=403, detail="无权删除他人的会话")

    await db.delete(session)
    await db.commit()
    return {"message": "会话已删除"}


@router.delete("/messages/{message_id}")
async def delete_chat_message(
    message_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除单条消息"""
    message, session = await _get_owned_message(message_id, user, db)
    await db.delete(message)
    await _touch_session(session.id, db)
    await db.commit()
    return {"message": "消息已删除", "session_id": str(session.id)}


@router.patch("/messages/{message_id}", response_model=List[ChatMessageSchema])
async def edit_chat_message(
    message_id: uuid.UUID,
    body: EditMessageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """编辑用户消息，并删除该消息之后的所有记录（分叉）"""
    message, session = await _get_owned_message(message_id, user, db)
    if message.role != "user":
        raise HTTPException(status_code=400, detail="仅支持编辑用户消息")

    message.content = body.content.strip()
    await _delete_messages_after(session.id, message.created_at, db, inclusive=False)
    await _touch_session(session.id, db)
    await db.commit()
    await db.refresh(message)

    msg_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.asc())
    )
    return msg_result.scalars().all()


@router.post("/messages/{message_id}/feedback", response_model=ChatMessageSchema)
async def set_message_feedback(
    message_id: uuid.UUID,
    body: MessageFeedbackRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """为助手消息设置点赞/点踩反馈"""
    message, _session = await _get_owned_message(message_id, user, db)
    if message.role != "assistant":
        raise HTTPException(status_code=400, detail="仅支持对 AI 回答反馈")

    message.feedback = body.rating
    await db.commit()
    await db.refresh(message)
    return message


@router.post("/messages/{message_id}/regenerate", response_model=RegenerateResponse)
async def regenerate_from_message(
    message_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """重新生成：删除该条及之后的助手/用户消息，返回待重试的用户问题"""
    message, session = await _get_owned_message(message_id, user, db)

    if message.role == "assistant":
        prior_result = await db.execute(
            select(ChatMessage)
            .where(
                ChatMessage.session_id == session.id,
                ChatMessage.created_at < message.created_at,
                ChatMessage.role == "user",
            )
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
        user_msg = prior_result.scalar_one_or_none()
        if not user_msg:
            raise HTTPException(status_code=400, detail="未找到对应的用户提问")
        await _delete_messages_after(session.id, message.created_at, db, inclusive=True)
        await _touch_session(session.id, db)
        await db.commit()
        return RegenerateResponse(
            session_id=session.id,
            query=user_msg.content,
            message_id=user_msg.id,
        )

    if message.role == "user":
        await _delete_messages_after(session.id, message.created_at, db, inclusive=False)
        await _touch_session(session.id, db)
        await db.commit()
        return RegenerateResponse(
            session_id=session.id,
            query=message.content,
            message_id=message.id,
        )

    raise HTTPException(status_code=400, detail="不支持的消息类型")


@router.get("/sessions/{session_id}/export")
async def export_chat_session(
    session_id: uuid.UUID,
    format: Literal["md", "json"] = Query(default="md", alias="format"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """导出会话为 Markdown 或 JSON"""
    await _get_owned_session(session_id, user, db)
    try:
        session, messages, project_name = await load_session_messages(session_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    if not messages:
        raise HTTPException(status_code=400, detail="空会话无法导出")

    safe_title = "".join(c if c.isalnum() or c in "._- " else "_" for c in session.title)[:80].strip() or "chat"

    if format == "json":
        body = export_session_json(
            title=session.title,
            project_name=project_name,
            session_id=str(session.id),
            messages=messages,
        )
        return Response(
            content=body,
            media_type="application/json; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.json"'},
        )

    body = export_session_markdown(
        title=session.title,
        project_name=project_name,
        messages=messages,
    )
    return Response(
        content=body,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}.md"'},
    )


@router.post("/sessions/{session_id}/shares", response_model=CreateShareResponse)
async def create_chat_share(
    session_id: uuid.UUID,
    body: CreateShareRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建会话快照分享链接（公开只读）"""
    session = await _get_owned_session(session_id, user, db)
    try:
        _session, messages, project_name = await load_session_messages(session_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    try:
        share = await create_session_share(
            session=session,
            messages=messages,
            project_name=project_name,
            user=user,
            db=db,
            expires_in_days=body.expires_in_days,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return CreateShareResponse(
        share_token=share.share_token,
        share_path=f"/share/{share.share_token}",
        expires_at=share.expires_at,
        created_at=share.created_at,
    )


@router.get("/sessions/{session_id}/shares", response_model=List[ShareLinkSchema])
async def list_chat_shares(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出某会话的分享记录"""
    await _get_owned_session(session_id, user, db)
    result = await db.execute(
        select(ChatSessionShare)
        .where(ChatSessionShare.session_id == session_id)
        .order_by(ChatSessionShare.created_at.desc())
    )
    shares = result.scalars().all()
    return [
        ShareLinkSchema(
            id=s.id,
            share_token=s.share_token,
            share_path=f"/share/{s.share_token}",
            title=s.title,
            expires_at=s.expires_at,
            revoked_at=s.revoked_at,
            view_count=s.view_count or 0,
            created_at=s.created_at,
        )
        for s in shares
    ]


@router.delete("/shares/{token}")
async def revoke_chat_share(
    token: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """撤销分享链接"""
    result = await db.execute(
        select(ChatSessionShare).where(ChatSessionShare.share_token == token)
    )
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="分享不存在")

    session = await _get_owned_session(share.session_id, user, db)
    if share.created_by != user.id and session.user_id != user.id:
        raise HTTPException(status_code=403, detail="无权撤销该分享")

    share.revoked_at = datetime.utcnow()
    await db.commit()
    return {"message": "分享已撤销", "share_token": token}

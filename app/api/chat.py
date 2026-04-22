from __future__ import annotations

import uuid
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.api.deps import get_current_user, ensure_project_member
from app.core.database import get_db
from app.models.database import ChatSession, ChatMessage, User

router = APIRouter(prefix="/chat", tags=["Chat"])

class ChatMessageSchema(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    citations: Optional[List] = None
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

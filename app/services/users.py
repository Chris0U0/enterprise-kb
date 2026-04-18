"""用户查询（登录鉴权）"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import User


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    q = email.strip().lower()
    result = await db.execute(select(User).where(User.email == q))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()

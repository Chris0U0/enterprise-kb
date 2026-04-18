"""
共享依赖：当前用户、项目成员校验
"""
from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token, parse_user_id
from app.models.database import ProjectMember, User
from app.services.users import get_user_by_id

security_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(security_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供有效的 Bearer Token",
        )
    try:
        payload = decode_token(creds.credentials)
        if payload.get("kind") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token 类型无效")
        uid = parse_user_id(payload)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 无效或已过期",
        ) from None
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 用户无效",
        ) from None

    user = await get_user_by_id(db, uid)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在或已禁用")
    return user


async def get_project_member_role(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> str | None:
    result = await db.execute(
        select(ProjectMember.role).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    row = result.scalar_one_or_none()
    return row.lower() if row else None


async def _project_member_tuple(
    project_id: uuid.UUID,
    user: User,
    db: AsyncSession,
) -> tuple[User, str]:
    role = await get_project_member_role(project_id, user.id, db)
    if role is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该项目")
    return user, role


async def require_project_member(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> tuple[User, str]:
    return await _project_member_tuple(project_id, user, db)


async def require_project_editor(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> tuple[User, str]:
    u, role = await _project_member_tuple(project_id, user, db)
    if role not in ("admin", "editor"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要编辑者或管理员权限")
    return u, role


async def require_project_admin(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    u, role = await _project_member_tuple(project_id, user, db)
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要项目管理员权限")
    return u

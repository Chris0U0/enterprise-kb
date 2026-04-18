"""
认证：登录、刷新 Token、当前用户
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    parse_user_id,
    verify_password,
)
from app.models.database import User
from app.models.schemas import LoginRequest, RefreshRequest, TokenResponse, UserPublic
from app.services.users import get_user_by_email, get_user_by_id

from .deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Auth"])
settings = get_settings()


def _user_public(u: User) -> UserPublic:
    disp = {"admin": "Admin", "editor": "Editor", "viewer": "Viewer"}.get(
        (u.role or "viewer").lower(),
        "Viewer",
    )
    return UserPublic(id=str(u.id), email=u.email, name=u.name, role=disp)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    email = body.email.strip().lower()
    user = await get_user_by_email(db, email)
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已禁用")

    access, expires_in = create_access_token(user.id)
    refresh, refresh_exp = create_refresh_token(user.id)
    return TokenResponse(
        access_token=access,
        token_type="Bearer",
        expires_in=expires_in,
        refresh_token=refresh,
        refresh_expires_in=refresh_exp,
        user=_user_public(user),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout():
    """JWT 无状态：客户端丢弃 Token 即可；预留服务端黑名单可在此扩展。"""
    return None


@router.get("/me", response_model=UserPublic)
async def me(user: User = Depends(get_current_user)):
    return _user_public(user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("kind") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="非 refresh Token")
        uid = parse_user_id(payload)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh Token 无效或已过期") from None
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token 用户无效") from None

    user = await get_user_by_id(db, uid)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在或已禁用")

    access, expires_in = create_access_token(user.id)
    refresh, refresh_exp = create_refresh_token(user.id)
    return TokenResponse(
        access_token=access,
        token_type="Bearer",
        expires_in=expires_in,
        refresh_token=refresh,
        refresh_expires_in=refresh_exp,
        user=_user_public(user),
    )

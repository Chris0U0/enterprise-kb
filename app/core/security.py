"""
JWT 与密码哈希（前端 Bearer 鉴权）
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _encode(payload: dict) -> str:
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: uuid.UUID) -> tuple[str, int]:
    """返回 (token, expires_in 秒)。"""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    exp_ts = int(expire.timestamp())
    payload = {"sub": str(user_id), "kind": "access", "exp": exp_ts}
    token = _encode(payload)
    expires_in = max(1, exp_ts - int(datetime.now(timezone.utc).timestamp()))
    return token, expires_in


def create_refresh_token(user_id: uuid.UUID) -> tuple[str, int]:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    exp_ts = int(expire.timestamp())
    payload = {"sub": str(user_id), "kind": "refresh", "exp": exp_ts}
    token = _encode(payload)
    refresh_expires_in = max(1, exp_ts - int(datetime.now(timezone.utc).timestamp()))
    return token, refresh_expires_in


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])


def parse_user_id(payload: dict) -> uuid.UUID:
    sub = payload.get("sub")
    if not sub:
        raise JWTError("missing sub")
    return uuid.UUID(str(sub))

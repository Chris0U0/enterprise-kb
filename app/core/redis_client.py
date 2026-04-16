"""
Redis 客户端 — 缓存 + Celery broker
"""
from __future__ import annotations

import redis.asyncio as aioredis

from app.core.config import get_settings

settings = get_settings()

_pool: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        _pool = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _pool

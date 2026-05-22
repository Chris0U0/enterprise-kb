"""
PostgreSQL 异步连接管理（修正版）

事务管理策略：
  - get_db() 作为 FastAPI 依赖注入的 session 工厂
  - 正常路径: yield session → commit
  - 异常路径: rollback → re-raise（让 FastAPI 返回错误响应）
  - async with AsyncSessionLocal() 在请求结束时关闭 session、归还连接

连接健壮性（Docker / 梯子 / 瞬时断连）：
  - connect_args.timeout → asyncpg 建连超时
  - pool_pre_ping → 从池取出前探测连接是否仍可用
  - pool_recycle → 定期丢弃过旧连接，减少「半开」长连接被中间件掐断
"""
from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def build_async_engine_kwargs(
    s: Settings,
    *,
    pool_size: int = 20,
    max_overflow: int = 10,
) -> dict:
    """与 Celery 等子进程共用，避免各处 create_async_engine 参数漂移。"""
    return {
        "echo": s.APP_ENV == "development",
        "pool_size": pool_size,
        "max_overflow": max_overflow,
        "pool_pre_ping": True,
        "pool_recycle": s.POSTGRES_POOL_RECYCLE,
        "connect_args": {
            # asyncpg.connect(timeout=...)：TCP + 握手阶段总超时
            "timeout": float(s.POSTGRES_CONNECT_TIMEOUT),
        },
    }


def create_async_engine_from_settings(
    s: Settings,
    *,
    pool_size: int = 20,
    max_overflow: int = 10,
) -> AsyncEngine:
    return create_async_engine(s.DATABASE_URL, **build_async_engine_kwargs(s, pool_size=pool_size, max_overflow=max_overflow))


engine = create_async_engine_from_settings(settings)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """
    FastAPI 依赖注入：获取数据库 session

    事务边界与 API 请求对齐：
    - 请求正常完成 → commit（所有 flush 的变更持久化）
    - 请求异常 → rollback（撤销所有 flush 的变更，包括 processing 状态更新）
    - 这意味着如果 pipeline 失败后手动 flush 了 failed 状态，
      rollback 会撤销它。因此 pipeline 中的 failed 状态更新
      需要在独立的 session 中完成，或者改为在 Celery 任务中处理。
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception as e:
            logger.warning(f"DB session rollback: {type(e).__name__}: {e}")
            await session.rollback()
            raise

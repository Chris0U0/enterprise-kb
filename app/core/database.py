"""
PostgreSQL 异步连接管理（修正版）

事务管理策略：
  - get_db() 作为 FastAPI 依赖注入的 session 工厂
  - 正常路径: yield session → commit
  - 异常路径: rollback → re-raise（让 FastAPI 返回错误响应）
  - 无论成功失败: finally → close 释放连接回池
"""
from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=(settings.APP_ENV == "development"),
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
)

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
        finally:
            await session.close()

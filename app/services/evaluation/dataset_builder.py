"""
RAGAS 评估数据集构建器
从 audit_logs 表的 qa_query 事件中自动构建评估数据集
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AuditLog

logger = logging.getLogger(__name__)


@dataclass
class EvalSample:
    """单条评估样本"""
    query: str
    answer: str
    contexts: list[str]             # 检索到的上下文片段
    ground_truth: str | None = None # 人工标注（可选）
    metadata: dict = field(default_factory=dict)


async def build_dataset_from_logs(
    db: AsyncSession,
    project_id: uuid.UUID | None = None,
    hours: int = 24,
    max_samples: int = 50,
) -> list[EvalSample]:
    """
    从审计日志中采样构建评估数据集。

    Args:
        db: 数据库 session
        project_id: 可选的项目过滤
        hours: 回溯时间窗口（小时）
        max_samples: 最大采样数

    Returns:
        EvalSample 列表
    """
    since = datetime.utcnow() - timedelta(hours=hours)

    conditions = [
        AuditLog.event_type == "qa_query",
        AuditLog.created_at >= since,
    ]
    if project_id:
        conditions.append(AuditLog.project_id == project_id)

    result = await db.execute(
        select(AuditLog)
        .where(and_(*conditions))
        .order_by(AuditLog.created_at.desc())
        .limit(max_samples)
    )
    logs = result.scalars().all()

    samples = []
    for log in logs:
        payload = log.payload or {}
        query = payload.get("query", "")
        if not query:
            continue

        # 从 payload 中提取答案和上下文
        # 注意：当前 audit_logs 记录了 query, strategy, result_count
        # 需要在 search.py 中扩展记录 answer 和 contexts
        answer = payload.get("answer", "")
        contexts = payload.get("contexts", [])
        if isinstance(contexts, list):
            contexts = [str(c)[:500] for c in contexts]

        samples.append(EvalSample(
            query=query,
            answer=answer,
            contexts=contexts,
            metadata={
                "project_id": str(log.project_id) if log.project_id else "",
                "strategy": payload.get("strategy", ""),
                "latency_ms": payload.get("latency_ms", 0),
                "timestamp": log.created_at.isoformat() if log.created_at else "",
            },
        ))

    logger.info(f"评估数据集构建完成: {len(samples)} 条样本 (最近 {hours}h)")
    return samples


def build_dataset_from_golden(golden_path: str) -> list[EvalSample]:
    """
    从 JSON 文件加载金标准测试集（人工标注）。
    用于 CI/CD 回归评估。

    JSON 格式:
    [{"query": "...", "answer": "...", "contexts": [...], "ground_truth": "..."}, ...]
    """
    import json
    from pathlib import Path

    path = Path(golden_path)
    if not path.exists():
        logger.warning(f"金标准文件不存在: {golden_path}")
        return []

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    samples = []
    for item in data:
        samples.append(EvalSample(
            query=item.get("query", ""),
            answer=item.get("answer", ""),
            contexts=item.get("contexts", []),
            ground_truth=item.get("ground_truth"),
        ))

    logger.info(f"金标准数据集加载完成: {len(samples)} 条")
    return samples

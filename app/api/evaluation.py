"""
RAGAS 评估 API — 触发评估 / 查看历史 / CI/CD 回归
"""
from __future__ import annotations

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import get_settings
from app.models.database import AuditLog

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/evaluation", tags=["RAGAS Evaluation"])


@router.post("/trigger")
async def trigger_evaluation(
    project_id: uuid.UUID | None = None,
    hours: int = Query(default=24, ge=1, le=168),
    max_samples: int = Query(default=50, ge=5, le=200),
):
    """手动触发一次批量评估"""
    _check_enabled()
    from app.services.evaluation.scheduler import schedule_daily_evaluation

    result = await schedule_daily_evaluation(
        project_id=str(project_id) if project_id else None,
    )

    if result is None:
        return {"status": "skipped", "message": "无可评估的样本"}

    return {
        "status": "completed",
        "run_id": result.run_id,
        "dataset_size": result.dataset_size,
        "scores": {
            "faithfulness": round(result.faithfulness_avg, 3),
            "answer_relevancy": round(result.relevancy_avg, 3),
            "context_recall": round(result.recall_avg, 3),
        },
    }


@router.post("/ci")
async def ci_evaluation(
    golden_path: str = Query(default="tests/golden_dataset.json"),
):
    """
    CI/CD 回归评估

    使用金标准测试集评估，返回是否通过阈值。
    阈值由 RAGAS_MIN_THRESHOLD 配置控制。
    """
    _check_enabled()
    from app.services.evaluation.scheduler import run_ci_evaluation

    result = await run_ci_evaluation(golden_path)
    status_code = 200 if result.get("passed") else 422

    return result


@router.get("/history")
async def get_evaluation_history(
    project_id: uuid.UUID | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """查看评估历史记录"""
    _check_enabled()

    conditions = [AuditLog.event_type == "evaluation_run"]
    if project_id:
        conditions.append(AuditLog.project_id == project_id)

    result = await db.execute(
        select(AuditLog)
        .where(and_(*conditions))
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    logs = result.scalars().all()

    return {
        "total": len(logs),
        "runs": [
            {
                "run_id": (log.payload or {}).get("run_id", ""),
                "run_type": (log.payload or {}).get("run_type", ""),
                "dataset_size": (log.payload or {}).get("dataset_size", 0),
                "faithfulness": (log.payload or {}).get("faithfulness_avg", 0),
                "relevancy": (log.payload or {}).get("relevancy_avg", 0),
                "recall": (log.payload or {}).get("recall_avg", 0),
                "model_version": (log.payload or {}).get("model_version", ""),
                "created_at": log.created_at.isoformat() if log.created_at else "",
            }
            for log in logs
        ],
    }


@router.get("/compare")
async def compare_runs(
    run_id_a: str = Query(..., description="基线 run_id"),
    run_id_b: str = Query(..., description="对比 run_id"),
    db: AsyncSession = Depends(get_db),
):
    """对比两次评估的分数差异"""
    _check_enabled()

    async def _find_run(run_id: str):
        result = await db.execute(
            select(AuditLog).where(
                AuditLog.event_type == "evaluation_run",
            )
        )
        for log in result.scalars().all():
            if (log.payload or {}).get("run_id") == run_id:
                return log.payload
        return None

    a = await _find_run(run_id_a)
    b = await _find_run(run_id_b)

    if not a or not b:
        raise HTTPException(status_code=404, detail="指定的 run_id 不存在")

    def _delta(key):
        va = a.get(key, 0)
        vb = b.get(key, 0)
        return {"baseline": round(va, 3), "current": round(vb, 3), "delta": round(vb - va, 3)}

    return {
        "baseline_run": run_id_a,
        "current_run": run_id_b,
        "comparison": {
            "faithfulness": _delta("faithfulness_avg"),
            "relevancy": _delta("relevancy_avg"),
            "recall": _delta("recall_avg"),
        },
    }


def _check_enabled():
    if not getattr(settings, "RAGAS_ENABLED", False):
        raise HTTPException(status_code=400, detail="RAGAS 评估未启用，请设置 RAGAS_ENABLED=true")

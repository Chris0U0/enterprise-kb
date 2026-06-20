"""
RAGAS 评估调度器

运行模式:
  1. 离线批量评估: Celery Beat 每日凌晨执行
  2. 在线抽样评估: 每 N 次查询自动触发（SSE / 非流式问答后调用）
  3. CI/CD 回归评估: 手动/API 触发，使用金标准测试集
"""
from __future__ import annotations

import logging
import random
import uuid

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


async def schedule_daily_evaluation(
    project_id: str | None = None,
    hours: int | None = None,
    max_samples: int | None = None,
):
    """
    每日/手动批量评估（Celery Beat 或 API 触发）

    从 audit_logs 的 qa_query 事件中采样，执行 RAGAS 评估，
    结果写入 audit_logs（evaluation_run）。
    """
    from app.core.database import AsyncSessionLocal
    from app.services.evaluation.dataset_builder import build_dataset_from_logs
    from app.services.evaluation.ragas_runner import run_evaluation

    eval_hours = hours if hours is not None else 24
    eval_max = max_samples if max_samples is not None else getattr(settings, "RAGAS_DAILY_SAMPLE_SIZE", 50)

    async with AsyncSessionLocal() as db:
        samples = await build_dataset_from_logs(
            db=db,
            project_id=uuid.UUID(project_id) if project_id else None,
            hours=eval_hours,
            max_samples=eval_max,
        )

    if not samples:
        logger.info("无评估样本，跳过批量评估")
        return None

    result = await run_evaluation(samples, run_type="daily")
    await _save_eval_result(result, project_id)

    recall_note = f"C={result.recall_avg:.2f}" if result.recall_evaluated else "C=n/a"
    logger.info(
        f"批量评估完成: F={result.faithfulness_avg:.2f} "
        f"R={result.relevancy_avg:.2f} {recall_note} "
        f"({result.dataset_size} 样本)"
    )
    return result


async def evaluate_single_query(
    query: str,
    answer: str,
    contexts: list[str],
    project_id: str | None = None,
) -> dict | None:
    """
    在线抽样评估（按 RAGAS_SAMPLE_RATE 概率触发，异步执行）。
    """
    sample_rate = getattr(settings, "RAGAS_SAMPLE_RATE", 0.05)
    if random.random() > sample_rate:
        return None

    from app.services.evaluation.dataset_builder import EvalSample
    from app.services.evaluation.ragas_runner import run_evaluation

    sample = EvalSample(query=query, answer=answer, contexts=contexts)
    result = await run_evaluation([sample], run_type="online")
    await _save_eval_result(result, project_id)

    if result.samples:
        s = result.samples[0]
        recall_note = f"C={s.context_recall:.2f}" if result.recall_evaluated else "C=n/a"
        logger.info(
            f"在线评估 [{result.run_id}]: F={s.faithfulness:.2f} R={s.answer_relevancy:.2f} {recall_note}"
        )
        return {
            "run_id": result.run_id,
            "faithfulness": s.faithfulness,
            "answer_relevancy": s.answer_relevancy,
            "context_recall": s.context_recall if result.recall_evaluated else None,
        }
    return None


async def run_ci_evaluation(golden_path: str) -> dict:
    """
    CI/CD 回归评估 — 使用带 ground_truth 的金标准测试集。
    """
    from app.services.evaluation.dataset_builder import build_dataset_from_golden
    from app.services.evaluation.ragas_runner import run_evaluation

    samples = build_dataset_from_golden(golden_path)
    if not samples:
        return {"passed": False, "error": "金标准文件为空或不存在"}

    result = await run_evaluation(samples, run_type="ci")
    await _save_eval_result(result, project_id=None)

    threshold = getattr(settings, "RAGAS_MIN_THRESHOLD", 0.7)
    passed = result.faithfulness_avg >= threshold and result.relevancy_avg >= threshold
    if result.recall_evaluated:
        passed = passed and result.recall_avg >= threshold

    return {
        "passed": passed,
        "threshold": threshold,
        "faithfulness": result.faithfulness_avg,
        "relevancy": result.relevancy_avg,
        "recall": result.recall_avg if result.recall_evaluated else None,
        "recall_evaluated": result.recall_evaluated,
        "dataset_size": result.dataset_size,
        "run_id": result.run_id,
    }


async def _save_eval_result(result, project_id: str | None):
    """持久化评估结果到 audit_logs（evaluation_run）。"""
    from app.core.database import AsyncSessionLocal
    from app.models.database import AuditLog

    async with AsyncSessionLocal() as db:
        db.add(
            AuditLog(
                event_type="evaluation_run",
                project_id=uuid.UUID(project_id) if project_id else None,
                payload={
                    "run_id": result.run_id,
                    "run_type": result.run_type,
                    "dataset_size": result.dataset_size,
                    "faithfulness_avg": result.faithfulness_avg,
                    "relevancy_avg": result.relevancy_avg,
                    "recall_avg": result.recall_avg,
                    "recall_evaluated": result.recall_evaluated,
                    "model_version": result.model_version,
                },
            )
        )
        await db.commit()

"""
Celery 异步任务配置（修正版）

修正 #1: 同步与异步逻辑混杂
  ─ Celery task 运行在独立 worker 进程中，不阻塞 FastAPI Event Loop
  ─ task 内部创建独立的 async engine + session，完整执行转换+索引流程
  ─ 状态更新通过 Redis pubsub 或轮询 /documents/{doc_id} 查看

修正 #2: 容错与事务处理
  ─ 使用 pipeline.ProcessingArtifacts 追踪副作用
  ─ 异常时自动回滚 MinIO + Qdrant + DB
  ─ Celery 内置重试机制 (max_retries=2, 间隔60秒)
"""
from __future__ import annotations

import logging

from celery import Celery

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

celery_app = Celery(
    "enterprise_kb",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=600,
    task_soft_time_limit=540,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=50,
    # Phase 3: Beat 定时任务调度
    beat_schedule={
        "daily-ragas-evaluation": {
            "task": "tasks.daily_evaluation",
            "schedule": 86400.0,  # 每 24 小时（生产环境用 crontab(hour=2, minute=0)）
        },
    },
)


@celery_app.task(
    name="tasks.process_document",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,                # 任务完成后才 ack，worker 崩溃时自动重新投递
    reject_on_worker_lost=True,    # worker 异常退出时拒绝任务（触发重试）
)
def task_process_document(
    self,
    doc_id: str,
    project_id: str,
    filename: str,
    source_format: str,
    upload_by: str,
    stage: str = "执行阶段",
):
    """
    Celery 异步文档处理任务

    在独立 worker 进程中执行：
    1. 从 MinIO 下载源文件
    2. 调用 process_document 转换管道（含事务保护）
    3. Contextual Retrieval 上下文增强
    4. 向量索引写入 Qdrant

    调用方式:
        from app.core.celery_app import task_process_document
        task_process_document.delay(
            doc_id=str(doc_id), project_id=str(project_id),
            filename=file.filename, source_format=source_format,
            upload_by=str(upload_by),
        )
    """
    import asyncio
    import uuid

    async def _run():
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
        from sqlalchemy import update as sql_update
        from app.core.config import get_settings
        from app.core.minio_client import get_minio
        from app.services.conversion.pipeline import process_document
        from app.models.database import Document

        settings = get_settings()
        engine = create_async_engine(
            settings.DATABASE_URL,
            pool_size=5,
            max_overflow=2,
            pool_pre_ping=True,
        )
        SessionFactory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

        artifacts = None
        async with SessionFactory() as db:
            try:
                # 从 MinIO 下载源文件
                minio = get_minio()
                source_path = minio.source_path(project_id, doc_id, filename)
                file_data = minio.download(source_path)

                # 执行转换管道 — 返回 (markdown, artifacts)
                md_content, artifacts = await process_document(
                    db=db,
                    doc_id=uuid.UUID(doc_id),
                    project_id=uuid.UUID(project_id),
                    file_data=file_data,
                    filename=filename,
                    source_format=source_format,
                    upload_by=uuid.UUID(upload_by),
                    stage=stage,
                )

                # Contextual Retrieval + 向量索引
                await _index_with_contextual(
                    md_content=md_content,
                    artifacts=artifacts,
                    project_id=project_id,
                    doc_id=doc_id,
                    filename=filename,
                    source_format=source_format,
                    upload_by=upload_by,
                )

                await db.commit()
                logger.info(f"[Celery] 文档处理完成: {filename}")

            except Exception as e:
                await db.rollback()
                # 回滚所有外部副作用（MinIO + Qdrant）
                if artifacts:
                    artifacts.rollback()
                logger.error(f"[Celery] 文档处理失败: {filename} — {e}")

                # Fix #6: 在独立 session 中强制更新 failed 状态
                # 即使主 session 已 rollback，也保证状态不会卡在 processing
                try:
                    async with SessionFactory() as fail_db:
                        await fail_db.execute(
                            sql_update(Document)
                            .where(Document.id == uuid.UUID(doc_id))
                            .values(
                                conversion_status="failed",
                                conversion_error=str(e)[:2000],
                            )
                        )
                        await fail_db.commit()
                        logger.info(f"[Celery] 已将 {doc_id} 状态置为 failed")
                except Exception as status_err:
                    logger.critical(
                        f"[Celery] 无法更新 failed 状态 (doc_id={doc_id}): {status_err}. "
                        f"文档可能卡在 processing 状态，需要人工修复。"
                    )
                raise

        await engine.dispose()

    try:
        asyncio.run(_run())
    except Exception as exc:
        logger.error(f"[Celery] 任务异常，准备重试: {exc}")
        raise self.retry(exc=exc)


async def _index_with_contextual(
    md_content: str,
    project_id: str,
    doc_id: str,
    filename: str,
    source_format: str,
    upload_by: str,
    artifacts=None,
):
    """Contextual Retrieval + 向量索引 — 注册 Qdrant 到 artifacts"""
    import uuid
    from app.core.config import get_settings
    from app.core.minio_client import get_minio
    from app.utils.markdown_utils import extract_sections

    settings = get_settings()
    minio = get_minio()

    sections = extract_sections(md_content)
    section_dicts = []
    for sec in sections:
        sec["id"] = str(uuid.uuid4())
        section_dicts.append(sec)

    # Contextual Retrieval
    if settings.CONTEXTUAL_RETRIEVAL_ENABLED:
        try:
            from app.services.retrieval.contextual import get_contextual_retrieval
            cr = get_contextual_retrieval()
            section_dicts = await cr.enrich_sections(
                sections=section_dicts,
                full_doc_content=md_content,
                doc_name=filename,
            )
        except Exception as e:
            logger.warning(f"[Celery] Contextual Retrieval 跳过: {e}")

    # 向量索引
    from app.services.retrieval.indexer import get_indexer
    indexer = get_indexer()
    await indexer.index_sections(
        sections=section_dicts,
        project_id=project_id,
        doc_id=doc_id,
        doc_name=filename,
        source_path=minio.source_path(project_id, doc_id, filename),
        source_format=source_format,
        md_path=minio.markdown_path(project_id, doc_id),
        upload_by=upload_by,
    )

    # 注册到 artifacts 以便失败时回滚
    if artifacts is not None:
        artifacts.record_qdrant_index(doc_id)


# ══════════════════════════════════════════════════════════
# Phase 3: RAGAS 每日评估定时任务
# ══════════════════════════════════════════════════════════

@celery_app.task(name="tasks.daily_evaluation", bind=True, max_retries=1)
def task_daily_evaluation(self):
    """
    每日 RAGAS 自动评估任务（Celery Beat 触发）

    从最近 24h 的 audit_logs 中采样，执行评估，结果写入数据库。
    """
    import asyncio

    async def _run():
        from app.services.evaluation.scheduler import schedule_daily_evaluation
        result = await schedule_daily_evaluation()
        if result:
            logger.info(
                f"[Celery Beat] 每日评估完成: "
                f"F={result.faithfulness_avg:.2f} R={result.relevancy_avg:.2f} "
                f"C={result.recall_avg:.2f} ({result.dataset_size} 样本)"
            )
        else:
            logger.info("[Celery Beat] 无评估样本，跳过")

    try:
        asyncio.run(_run())
    except Exception as exc:
        logger.error(f"[Celery Beat] 每日评估失败: {exc}")
        raise self.retry(exc=exc, countdown=300)

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

入库管道（PIPELINE_FAST_INDEX_FIRST=true）:
  process_document → 基础向量化 → completed（可检索）
  → task_enhance_document（GraphRAG + Contextual 重索引）
"""
from __future__ import annotations

import logging
import sys

from celery import Celery
from celery.signals import worker_ready

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# Windows 上默认 prefork（billiard 多进程）与 Celery 5.x 任务分发不兼容，
# 会触发 trace.fast_trace_task 中「expected 3, got 0」类错误；开发机请用 solo。
_IS_WIN = sys.platform == "win32"

celery_app = Celery(
    "enterprise_kb",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

_worker_common = {
    "worker_prefetch_multiplier": 1,
}
if _IS_WIN:
    _worker_common["worker_pool"] = "solo"
else:
    _worker_common["worker_max_tasks_per_child"] = 50

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
    task_track_started=True,
    task_time_limit=600,
    task_soft_time_limit=540,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=50,
    beat_schedule={
        "daily-ragas-evaluation": {
            "task": "tasks.daily_evaluation",
            "schedule": 86400.0,
        },
    },
)


@worker_ready.connect
def _preload_embedding_on_worker_start(sender, **kwargs):
    """Worker 启动时预加载 BGE-M3，避免首个文档任务冷启动 ~25s。"""
    if not settings.CELERY_PRELOAD_EMBEDDING:
        logger.info("[Celery] Embedding 预加载已关闭 (CELERY_PRELOAD_EMBEDDING=false)")
        return
    try:
        from app.services.retrieval.embedder import get_embedder

        logger.info("[Celery] 预加载 BGE-M3 Embedding 模型...")
        get_embedder().encode(["warmup"], return_colbert=False)
        logger.info("[Celery] BGE-M3 Embedding 模型预加载完成")
    except Exception as e:
        logger.warning("[Celery] Embedding 预加载跳过: %s", e)


def _should_defer_enhancement() -> bool:
    return settings.PIPELINE_FAST_INDEX_FIRST and (
        settings.GRAPHRAG_ENABLED or settings.CONTEXTUAL_RETRIEVAL_ENABLED
    )


def _schedule_enhancement(
    *,
    doc_id: str,
    project_id: str,
    filename: str,
    source_format: str,
    upload_by: str,
) -> None:
    task_enhance_document.delay(
        doc_id=doc_id,
        project_id=project_id,
        filename=filename,
        source_format=source_format,
        upload_by=upload_by,
    )
    logger.info("[Celery] 已派发后置增强任务: %s", filename)


@celery_app.task(
    name="tasks.process_document",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
    reject_on_worker_lost=True,
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

    PIPELINE_FAST_INDEX_FIRST=true（默认）:
      转换 → 基础向量化 → 标记 completed → 派发 enhance 任务
  PIPELINE_FAST_INDEX_FIRST=false:
      转换 → Contextual + GraphRAG + 向量化（单次完成）
    """
    import asyncio
    import uuid

    async def _run():
        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
        from sqlalchemy import update as sql_update
        from app.core.config import get_settings
        from app.core.database import create_async_engine_from_settings
        from app.core.minio_client import get_minio
        from app.services.conversion.pipeline import process_document
        from app.services.retrieval.document_indexing import (
            get_document_meta,
            index_document_sections,
            load_sections_from_db,
            run_graphrag_enhancement,
            sections_from_markdown,
        )
        from app.models.database import Document

        cfg = get_settings()
        engine = create_async_engine(
            cfg.DATABASE_URL,
            pool_size=5,
            max_overflow=2,
        )
        SessionFactory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

        artifacts = None
        defer_enhance = _should_defer_enhancement()

        async with SessionFactory() as db:
            try:
                minio = get_minio()
                source_path = minio.source_path(project_id, doc_id, filename)
                file_data = minio.download(source_path)

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

                doc = await get_document_meta(db, uuid.UUID(doc_id))
                sections = await load_sections_from_db(db, uuid.UUID(doc_id))
                if not sections:
                    sections = sections_from_markdown(md_content)

                md_path = doc.md_path if doc else minio.markdown_path(project_id, doc_id)
                checksum = doc.checksum if doc else None

                if defer_enhance:
                    await index_document_sections(
                        sections=sections,
                        project_id=project_id,
                        doc_id=doc_id,
                        filename=filename,
                        source_format=source_format,
                        upload_by=upload_by,
                        source_path=source_path,
                        md_path=md_path,
                        checksum=checksum,
                        use_contextual=False,
                    )
                    logger.info("[Celery] 快速索引完成，文档可检索: %s", filename)
                else:
                    await index_document_sections(
                        sections=sections,
                        project_id=project_id,
                        doc_id=doc_id,
                        filename=filename,
                        source_format=source_format,
                        upload_by=upload_by,
                        source_path=source_path,
                        md_path=md_path,
                        checksum=checksum,
                        use_contextual=True,
                        full_doc_content=md_content,
                    )
                    await run_graphrag_enhancement(
                        sections=sections,
                        doc_id=doc_id,
                        project_id=project_id,
                        filename=filename,
                    )

                if artifacts is not None:
                    artifacts.record_qdrant_index(doc_id)

                try:
                    from app.services.preview.generator import ensure_preview

                    ensure_preview(
                        minio=minio,
                        project_id=project_id,
                        doc_id=doc_id,
                        filename=filename,
                        source_path=source_path,
                    )
                except Exception as preview_err:
                    logger.warning("[Celery] 预览副本生成失败: %s", preview_err)

                await db.commit()
                logger.info("[Celery] 文档处理完成: %s", filename)

                if defer_enhance:
                    _schedule_enhancement(
                        doc_id=doc_id,
                        project_id=project_id,
                        filename=filename,
                        source_format=source_format,
                        upload_by=upload_by,
                    )

            except Exception as e:
                await db.rollback()
                if artifacts:
                    artifacts.rollback()
                logger.error("[Celery] 文档处理失败: %s — %s", filename, e)

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
                        logger.info("[Celery] 已将 %s 状态置为 failed", doc_id)
                except Exception as status_err:
                    logger.critical(
                        "[Celery] 无法更新 failed 状态 (doc_id=%s): %s",
                        doc_id,
                        status_err,
                    )
                raise

        await engine.dispose()

    try:
        asyncio.run(_run())
    except Exception as exc:
        logger.error("[Celery] 任务异常，准备重试: %s", exc)
        raise self.retry(exc=exc)


@celery_app.task(
    name="tasks.enhance_document",
    bind=True,
    max_retries=1,
    default_retry_delay=120,
    acks_late=True,
)
def task_enhance_document(
    self,
    doc_id: str,
    project_id: str,
    filename: str,
    source_format: str,
    upload_by: str,
):
    """
    后置增强：GraphRAG 抽取 + Contextual Retrieval 重索引。
    失败不影响文档 completed 状态（已可基础检索）。
    """
    import asyncio
    import uuid

    async def _run():
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
        from app.core.config import get_settings
        from app.core.minio_client import get_minio
        from app.services.retrieval.document_indexing import (
            get_document_meta,
            index_document_sections,
            load_document_markdown,
            load_sections_from_db,
            run_graphrag_enhancement,
        )

        cfg = get_settings()
        engine = create_async_engine(
            cfg.DATABASE_URL,
            pool_size=3,
            max_overflow=1,
            pool_pre_ping=True,
        )
        SessionFactory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

        async with SessionFactory() as db:
            doc = await get_document_meta(db, uuid.UUID(doc_id))
            if doc is None:
                logger.warning("[Celery] 增强跳过：文档不存在 %s", doc_id)
                return
            if doc.conversion_status != "completed":
                logger.warning(
                    "[Celery] 增强跳过：文档未 completed (%s, status=%s)",
                    doc_id,
                    doc.conversion_status,
                )
                return

            sections = await load_sections_from_db(db, uuid.UUID(doc_id))
            if not sections:
                logger.warning("[Celery] 增强跳过：无章节 %s", doc_id)
                return

            minio = get_minio()
            source_path = doc.source_path or minio.source_path(project_id, doc_id, filename)
            md_path = doc.md_path or minio.markdown_path(project_id, doc_id)
            md_content = await load_document_markdown(project_id, doc_id)

            await run_graphrag_enhancement(
                sections=sections,
                doc_id=doc_id,
                project_id=project_id,
                filename=filename,
            )

            if cfg.CONTEXTUAL_RETRIEVAL_ENABLED:
                count = await index_document_sections(
                    sections=sections,
                    project_id=project_id,
                    doc_id=doc_id,
                    filename=filename,
                    source_format=source_format,
                    upload_by=upload_by,
                    source_path=source_path,
                    md_path=md_path,
                    checksum=doc.checksum,
                    use_contextual=True,
                    full_doc_content=md_content,
                    replace_existing=True,
                )
                logger.info("[Celery] Contextual 重索引完成: %s (%d sections)", filename, count)
            else:
                logger.info("[Celery] Contextual 已关闭，仅完成 GraphRAG 增强: %s", filename)

        await engine.dispose()

    try:
        asyncio.run(_run())
    except Exception as exc:
        logger.error("[Celery] 文档增强失败: %s — %s", filename, exc)
        raise self.retry(exc=exc)


@celery_app.task(name="tasks.daily_evaluation", bind=True, max_retries=1)
def task_daily_evaluation(self):
    """每日 RAGAS 自动评估任务（Celery Beat 触发）"""
    import asyncio

    async def _run():
        from app.services.evaluation.scheduler import schedule_daily_evaluation

        result = await schedule_daily_evaluation()
        if result:
            logger.info(
                "[Celery Beat] 每日评估完成: "
                f"F={result.faithfulness_avg:.2f} R={result.relevancy_avg:.2f} "
                f"C={result.recall_avg:.2f} ({result.dataset_size} 样本)"
            )
        else:
            logger.info("[Celery Beat] 无评估样本，跳过")

    try:
        asyncio.run(_run())
    except Exception as exc:
        logger.error("[Celery Beat] 每日评估失败: %s", exc)
        raise self.retry(exc=exc, countdown=300)

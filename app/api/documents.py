"""
文档管理 API（修正版）

修正 #1: 同步与异步逻辑混杂
  ─ upload_document 接口不再同步执行转换管道
  ─ 上传流程: 读文件 → 算 checksum → 上传 MinIO 源文件 → 创建 DB 记录(pending) → 派发 Celery 任务 → 立即返回
  ─ 重活(转换+索引)全部在 Celery worker 中异步完成
  ─ 前端通过 GET /documents/{doc_id} 轮询状态，或 WebSocket 推送（可扩展）

修正 #2: 容错与事务处理
  ─ MinIO 源文件上传失败 → 不创建 DB 记录，直接返回 400
  ─ DB 记录创建失败 → 回滚已上传的 MinIO 文件
  ─ Celery 任务失败 → pipeline 内部 ProcessingArtifacts 自动回滚 + 状态置 failed
  ─ Celery worker 崩溃 → acks_late + reject_on_worker_lost 保证任务自动重试
"""
from __future__ import annotations

import uuid
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import get_settings
from app.models.database import Document, AuditLog
from app.models.schemas import DocumentInfo, DocumentUploadResponse, ConversionStatus
from app.services.conversion.pipeline import detect_format, SUPPORTED_FORMATS
from app.utils.checksum import compute_md5

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    project_id: uuid.UUID = Form(...),
    upload_by: uuid.UUID = Form(...),
    stage: str = Form(default="执行阶段"),
    db: AsyncSession = Depends(get_db),
):
    """
    上传文档 — 非阻塞，立即返回

    流程:
    1. 验证文件格式和大小
    2. 计算 MD5 checksum
    3. 上传源文件到 MinIO（唯一的同步 I/O，通常 <1s）
    4. 创建 DB 记录 (status=pending)
    5. 派发 Celery 异步任务（转换+索引）
    6. 立即返回 doc_id，前端轮询 GET /documents/{doc_id} 查看状态

    如果 MinIO 或 DB 操作失败，执行回滚：
    - MinIO 失败 → 直接返回错误
    - DB 失败 → 清理已上传的 MinIO 文件
    """
    # ── 1. 验证 ──────────────────────────────────────────
    file_data = await file.read()
    if len(file_data) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"文件大小超过限制 ({settings.MAX_UPLOAD_SIZE_MB}MB)",
        )

    try:
        source_format = detect_format(file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # ── 2. Checksum ──────────────────────────────────────
    doc_id = uuid.uuid4()
    checksum = compute_md5(file_data)

    # ── 3. 上传源文件到 MinIO ────────────────────────────
    from app.core.minio_client import get_minio
    minio = get_minio()

    try:
        source_path = minio.upload_source(
            str(project_id), str(doc_id), file.filename,
            file_data, "application/octet-stream",
        )
    except Exception as e:
        logger.error(f"MinIO 源文件上传失败: {e}")
        raise HTTPException(status_code=502, detail=f"文件存储失败: {str(e)}")

    # ── 4. 创建 DB 记录 ─────────────────────────────────
    try:
        doc = Document(
            id=doc_id,
            project_id=project_id,
            original_filename=file.filename,
            source_format=source_format,
            source_path=source_path,
            checksum=checksum,
            file_size_bytes=len(file_data),
            upload_by=upload_by,
            conversion_status="pending",
        )
        db.add(doc)
        await db.flush()
    except Exception as e:
        # DB 失败 → 回滚 MinIO
        logger.error(f"DB 记录创建失败，回滚 MinIO: {e}")
        try:
            minio.delete(source_path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"数据库写入失败: {str(e)}")

    # ── 5. 派发 Celery 异步任务 ──────────────────────────
    try:
        from app.core.celery_app import task_process_document
        task_process_document.delay(
            doc_id=str(doc_id),
            project_id=str(project_id),
            filename=file.filename,
            source_format=source_format,
            upload_by=str(upload_by),
            stage=stage,
        )
        logger.info(f"Celery 任务已派发: doc_id={doc_id}, file={file.filename}")
    except Exception as e:
        # Celery 不可用时回退到同步处理（开发环境兜底）
        logger.warning(f"Celery 派发失败({e})，回退到同步处理")
        await _fallback_sync_process(
            db=db, doc_id=doc_id, project_id=project_id,
            file_data=file_data, filename=file.filename,
            source_format=source_format, upload_by=upload_by, stage=stage,
        )

    # ── 6. 立即返回 ─────────────────────────────────────
    return DocumentUploadResponse(
        doc_id=doc_id,
        project_id=project_id,
        filename=file.filename,
        source_format=source_format,
        checksum=checksum,
        status=ConversionStatus.PENDING,
        message="文件已上传，正在后台处理。请通过 GET /documents/{doc_id} 查询进度。",
    )


async def _fallback_sync_process(
    db: AsyncSession,
    doc_id: uuid.UUID,
    project_id: uuid.UUID,
    file_data: bytes,
    filename: str,
    source_format: str,
    upload_by: uuid.UUID,
    stage: str,
):
    """
    Celery 不可用时的同步回退方案。
    仅用于开发环境，生产环境应始终使用 Celery。

    使用 process_document 返回的 artifacts 追踪副作用，
    Qdrant 索引失败时也能完整回滚。
    """
    from app.services.conversion.pipeline import process_document

    artifacts = None
    try:
        md_content, artifacts = await process_document(
            db=db, doc_id=doc_id, project_id=project_id,
            file_data=file_data, filename=filename,
            source_format=source_format, upload_by=upload_by, stage=stage,
        )

        # 向量索引 — 注册到 artifacts 以便失败时回滚
        await _index_document(
            md_content=md_content, artifacts=artifacts,
            project_id=str(project_id), doc_id=str(doc_id),
            filename=filename, source_format=source_format,
            upload_by=str(upload_by),
        )

    except Exception as e:
        logger.error(f"同步回退处理失败: {e}")
        if artifacts:
            artifacts.rollback()
        # pipeline 内部已处理 failed 状态和 artifact 回滚


async def _index_document(
    md_content: str,
    project_id: str,
    doc_id: str,
    filename: str,
    source_format: str,
    upload_by: str,
    artifacts=None,
):
    """向量索引（含 Contextual Retrieval）— 注册到 artifacts 以便失败时回滚"""
    from app.utils.markdown_utils import extract_sections
    from app.core.minio_client import get_minio
    from app.services.retrieval.indexer import get_indexer

    sections = extract_sections(md_content)
    section_dicts = []
    for sec in sections:
        sec["id"] = str(uuid.uuid4())
        section_dicts.append(sec)

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
            logger.warning(f"Contextual Retrieval 跳过: {e}")

    minio = get_minio()
    indexer = get_indexer()
    await indexer.index_sections(
        sections=section_dicts,
        project_id=project_id, doc_id=doc_id, doc_name=filename,
        source_path=minio.source_path(project_id, doc_id, filename),
        source_format=source_format,
        md_path=minio.markdown_path(project_id, doc_id),
        upload_by=upload_by,
    )

    # 注册 Qdrant 索引到 artifacts，以便后续失败时可回滚
    if artifacts is not None:
        artifacts.record_qdrant_index(doc_id)


# ══════════════════════════════════════════════════════════
# 状态查询和管理接口（无变化，保留原有实现）
# ══════════════════════════════════════════════════════════

@router.get("/list/{project_id}", response_model=list[DocumentInfo])
async def list_documents(
    project_id: uuid.UUID,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """列出项目中的所有文档"""
    query = select(Document).where(Document.project_id == project_id)
    if status:
        query = query.where(Document.conversion_status == status)
    query = query.order_by(Document.upload_at.desc())
    result = await db.execute(query)
    docs = result.scalars().all()
    return [DocumentInfo.model_validate(doc) for doc in docs]


@router.get("/{doc_id}", response_model=DocumentInfo)
async def get_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    获取单个文档详情（含转换状态）
    前端轮询此接口查看异步转换进度: pending → processing → completed/failed
    """
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="文档不存在")
    return DocumentInfo.model_validate(doc)


@router.get("/{doc_id}/markdown")
async def get_document_markdown(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """获取文档的 Markdown 内容"""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="文档不存在")

    if doc.conversion_status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"文档尚未转换完成 (当前状态: {doc.conversion_status})",
        )

    from app.core.minio_client import get_minio
    minio = get_minio()
    md_content = minio.get_markdown(str(doc.project_id), str(doc.id))
    return {"doc_id": str(doc_id), "markdown": md_content}


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """删除文档及其所有索引"""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="文档不存在")

    # 删除向量索引
    try:
        from app.services.retrieval.indexer import get_indexer
        indexer = get_indexer()
        indexer.delete_by_doc(str(doc_id))
    except Exception as e:
        logger.warning(f"删除向量索引失败: {e}")

    # 删除 MinIO 文件
    try:
        from app.core.minio_client import get_minio
        minio = get_minio()
        if doc.source_path:
            minio.delete(doc.source_path)
        if doc.md_path:
            minio.delete(doc.md_path)
    except Exception as e:
        logger.warning(f"删除 MinIO 文件失败: {e}")

    # 删除数据库记录（级联删除 sections 和 structure）
    await db.delete(doc)

    return {"message": f"文档 {doc.original_filename} 已删除"}

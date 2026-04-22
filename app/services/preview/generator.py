import requests
import tempfile
from pathlib import Path
from dataclasses import dataclass
import logging

from minio.error import S3Error

from app.core.minio_client import MinIOClient
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

@dataclass
class PreviewResult:
    preview_path: str | None
    source_path: str
    mode: str
    reason: str | None = None
    content_type: str | None = None


def ensure_preview(
    *,
    minio: MinIOClient,
    project_id: str,
    doc_id: str,
    filename: str,
    source_path: str,
) -> PreviewResult:
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    # 无需转换的格式
    if ext in {"pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "txt", "md", "csv", "json", "log", "yaml", "yml", "xml"}:
        return PreviewResult(preview_path=source_path, source_path=source_path, mode="inline", content_type=None)

    # Office 格式处理 (通过 Gotenberg)
    if ext in {"xlsx", "xls", "docx", "pptx", "doc", "ppt"}:
        return _ensure_gotenberg_pdf_preview(
            minio=minio,
            project_id=project_id,
            doc_id=doc_id,
            filename=filename,
            source_path=source_path,
        )

    return PreviewResult(preview_path=None, source_path=source_path, mode="download", reason="该格式暂不支持站内预览")


def _ensure_gotenberg_pdf_preview(
    *,
    minio: MinIOClient,
    project_id: str,
    doc_id: str,
    filename: str,
    source_path: str,
) -> PreviewResult:
    preview_path = minio.preview_path(project_id, doc_id, "pdf")
    
    # 1. 检查缓存
    if _object_exists(minio, preview_path):
        return PreviewResult(preview_path=preview_path, source_path=source_path, mode="inline", content_type="application/pdf")

    # 2. 调用 Gotenberg 转换
    try:
        source_bytes = minio.download(source_path)
        
        # Gotenberg API: /forms/libreoffice/convert
        url = f"{settings.GOTENBERG_URL}/forms/libreoffice/convert"
        
        # 准备文件上传
        files = {'files': (filename, source_bytes)}
        
        response = requests.post(url, files=files, timeout=30)
        
        if response.status_code == 200:
            minio.upload_bytes(preview_path, response.content, "application/pdf")
            return PreviewResult(preview_path=preview_path, source_path=source_path, mode="inline", content_type="application/pdf")
        else:
            logger.error(f"Gotenberg 转换失败: {response.status_code} - {response.text}")
            return PreviewResult(
                preview_path=None, 
                source_path=source_path, 
                mode="download", 
                reason=f"预览副本生成失败 (Gotenberg Error: {response.status_code})"
            )
            
    except Exception as e:
        logger.error(f"Gotenberg 服务调用异常: {e}")
        return PreviewResult(
            preview_path=None,
            source_path=source_path,
            mode="download",
            reason=f"预览服务不可用: {str(e)}"
        )


def _object_exists(minio: MinIOClient, path: str) -> bool:
    try:
        minio.client.stat_object(minio.bucket, path)
        return True
    except S3Error:
        return False

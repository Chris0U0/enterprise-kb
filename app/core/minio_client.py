"""
MinIO 对象存储客户端 — 双存储架构（源文件 + Markdown）
"""
from __future__ import annotations

import io
from pathlib import PurePosixPath

from minio import Minio
from minio.error import S3Error

from app.core.config import get_settings

settings = get_settings()


class MinIOClient:
    """封装 MinIO 操作，管理源文件和 Markdown 的双存储结构"""

    def __init__(self):
        self.client = Minio(
            endpoint=settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        self.bucket = settings.MINIO_BUCKET
        self._ensure_bucket()

    def _ensure_bucket(self):
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)

    # ── 路径规范 ─────────────────────────────────────────
    @staticmethod
    def source_path(project_id: str, doc_id: str, filename: str) -> str:
        """源文件存储路径: projects/{project_id}/source/{doc_id}.{ext}"""
        ext = PurePosixPath(filename).suffix
        return f"projects/{project_id}/source/{doc_id}{ext}"

    @staticmethod
    def markdown_path(project_id: str, doc_id: str) -> str:
        """Markdown 存储路径: projects/{project_id}/markdown/{doc_id}.md"""
        return f"projects/{project_id}/markdown/{doc_id}.md"

    @staticmethod
    def preview_path(project_id: str, doc_id: str, ext: str) -> str:
        """预览文件存储路径: projects/{project_id}/preview/{doc_id}.{ext}"""
        clean_ext = ext.lstrip(".")
        return f"projects/{project_id}/preview/{doc_id}.{clean_ext}"

    # ── 上传 ─────────────────────────────────────────────
    def upload_source(
        self, project_id: str, doc_id: str, filename: str, data: bytes, content_type: str
    ) -> str:
        """上传源文件，返回 MinIO 路径"""
        path = self.source_path(project_id, doc_id, filename)
        self.client.put_object(
            self.bucket,
            path,
            io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )
        return path

    def upload_markdown(self, project_id: str, doc_id: str, md_content: str) -> str:
        """上传 Markdown 副本，返回 MinIO 路径"""
        path = self.markdown_path(project_id, doc_id)
        data = md_content.encode("utf-8")
        self.client.put_object(
            self.bucket,
            path,
            io.BytesIO(data),
            length=len(data),
            content_type="text/markdown",
        )
        return path

    def upload_bytes(self, path: str, data: bytes, content_type: str) -> str:
        """按指定路径上传任意二进制文件"""
        self.client.put_object(
            self.bucket,
            path,
            io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )
        return path

    # ── 下载 ─────────────────────────────────────────────
    def download(self, path: str) -> bytes:
        """从 MinIO 下载文件内容"""
        response = self.client.get_object(self.bucket, path)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def get_markdown(self, project_id: str, doc_id: str) -> str:
        """获取 Markdown 文本内容"""
        path = self.markdown_path(project_id, doc_id)
        return self.download(path).decode("utf-8")

    # ── 预签名 URL ───────────────────────────────────────
    def presigned_url(self, path: str, expires_hours: int = 1) -> str:
        """生成预签名下载链接"""
        from datetime import timedelta
        return self.client.presigned_get_object(
            self.bucket, path, expires=timedelta(hours=expires_hours)
        )

    # ── 删除 ─────────────────────────────────────────────
    def delete(self, path: str):
        self.client.remove_object(self.bucket, path)


# 单例
_client: MinIOClient | None = None


def get_minio() -> MinIOClient:
    global _client
    if _client is None:
        _client = MinIOClient()
    return _client

"""
Qdrant 向量数据库客户端 — 支持 BGE-M3 三合一向量索引
"""
from __future__ import annotations

from qdrant_client import QdrantClient, models
from qdrant_client.http.models import Distance, VectorParams, SparseVectorParams

from app.core.config import get_settings

settings = get_settings()

# BGE-M3 输出维度
DENSE_DIM = 1024


def get_qdrant() -> QdrantClient:
    return QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)


def ensure_collection(client: QdrantClient | None = None):
    """
    创建或确认 Qdrant collection 存在。
    支持 dense + sparse 双向量，以及 payload 索引用于 project_id 隔离过滤。
    """
    if client is None:
        client = get_qdrant()

    collection_name = settings.QDRANT_COLLECTION

    collections = [c.name for c in client.get_collections().collections]
    if collection_name in collections:
        return

    client.create_collection(
        collection_name=collection_name,
        vectors_config={
            "dense": VectorParams(size=DENSE_DIM, distance=Distance.COSINE),
        },
        sparse_vectors_config={
            "sparse": SparseVectorParams(),
        },
    )

    # 创建 payload 索引，用于 project_id 高效过滤（性能提升 10x）
    client.create_payload_index(
        collection_name=collection_name,
        field_name="project_id",
        field_schema=models.PayloadSchemaType.KEYWORD,
    )
    client.create_payload_index(
        collection_name=collection_name,
        field_name="doc_id",
        field_schema=models.PayloadSchemaType.KEYWORD,
    )
    client.create_payload_index(
        collection_name=collection_name,
        field_name="section_path",
        field_schema=models.PayloadSchemaType.KEYWORD,
    )

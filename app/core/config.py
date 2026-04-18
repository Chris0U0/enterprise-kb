"""
全局配置 — 从环境变量加载所有服务连接参数
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ── Application ──────────────────────────────────────
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"
    MAX_UPLOAD_SIZE_MB: int = 100

    # ── Auth (JWT) ───────────────────────────────────────
    JWT_SECRET_KEY: str = "change-me-in-production-use-long-random-string"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    # 单租户默认组织（项目 org_id、用户归属）
    DEFAULT_ORG_ID: str = "00000000-0000-0000-0000-000000000001"

    # ── PostgreSQL ───────────────────────────────────────
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "enterprise_kb"
    POSTGRES_USER: str = "kb_admin"
    POSTGRES_PASSWORD: str = "changeme"

    def _postgres_url(self, drivername: str) -> URL:
        """用 URL.create 传参，避免手写 URL 在 Windows/特殊字符下触发编码错误。"""
        return URL.create(
            drivername,
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_HOST,
            port=self.POSTGRES_PORT,
            database=self.POSTGRES_DB,
        )

    @property
    def DATABASE_URL(self) -> URL:
        return self._postgres_url("postgresql+asyncpg")

    @property
    def DATABASE_URL_SYNC(self) -> URL:
        return self._postgres_url("postgresql+psycopg2")

    # ── Qdrant ───────────────────────────────────────────
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_GRPC_PORT: int = 6334
    QDRANT_COLLECTION: str = "kb_documents"

    # ── MinIO ────────────────────────────────────────────
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "enterprise-kb"
    MINIO_SECURE: bool = False

    # ── Redis ────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # ── LLM ──────────────────────────────────────────────
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-4-20250514"

    # ── Embedding & Reranker ─────────────────────────────
    BGE_M3_MODEL_PATH: str = "BAAI/bge-m3"
    BGE_RERANKER_MODEL_PATH: str = "BAAI/bge-reranker-v2-m3"

    # ── Retrieval ────────────────────────────────────────
    DENSE_WEIGHT: float = 0.4
    SPARSE_WEIGHT: float = 0.4
    COLBERT_WEIGHT: float = 0.2
    RERANKER_TOP_K: int = 5
    RETRIEVAL_CANDIDATE_COUNT: int = 40
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 64

    # ── Phase 2: Agentic RAG ────────────────────────────
    AGENTIC_MAX_STEPS: int = 4
    AGENTIC_MAX_LLM_CALLS: int = 8
    AGENTIC_TIMEOUT_SECONDS: int = 30
    AGENTIC_MIN_CONFIDENCE: float = 0.6

    # ── Phase 2: Contextual Retrieval ────────────────────
    CONTEXTUAL_RETRIEVAL_ENABLED: bool = True
    CONTEXTUAL_BATCH_SIZE: int = 5
    CONTEXTUAL_MAX_CONCURRENT: int = 3

    # ── Phase 2: Streaming ───────────────────────────────
    SSE_KEEPALIVE_SECONDS: int = 15

    # ── Phase 3: Multi-Agent ─────────────────────────────
    AGENT_MAX_PARALLEL: int = 3
    AGENT_GLOBAL_TOKEN_BUDGET: int = 16000
    MULTI_AGENT_TIMEOUT: int = 45

    # ── Phase 3: GraphRAG ────────────────────────────────
    GRAPHRAG_ENABLED: bool = True
    GRAPHRAG_DOC_THRESHOLD: int = 30
    KUZU_DB_PATH: str = "/data/kuzu_db"

    # ── Phase 3: RAGAS Evaluation ────────────────────────
    RAGAS_ENABLED: bool = True
    RAGAS_SAMPLE_RATE: float = 0.05
    RAGAS_DAILY_SAMPLE_SIZE: int = 50
    RAGAS_MIN_THRESHOLD: float = 0.7


@lru_cache()
def get_settings() -> Settings:
    return Settings()

"""
企业项目知识库平台 — FastAPI 应用入口
Phase 1 + Phase 2 + Phase 3:
  多模态转换 + 基础/Agentic/Multi-Agent RAG + MCP + GraphRAG
  + Skills + SSE + Contextual Retrieval + RAGAS 自动评估
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.api.documents import router as documents_router
from app.api.search import router as search_router
from app.api.mcp import router as mcp_router
from app.api.graph import router as graph_router
from app.api.evaluation import router as evaluation_router
from app.api.auth import router as auth_router
from app.api.projects import router as projects_router

settings = get_settings()

# 日志配置
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    logger.info("=" * 60)
    logger.info("企业项目知识库平台 启动中... (Phase 1 + Phase 2)")
    logger.info(f"  环境: {settings.APP_ENV}")
    logger.info(f"  LLM:  {settings.ANTHROPIC_MODEL}")
    logger.info(f"  Embedding: {settings.BGE_M3_MODEL_PATH}")
    logger.info(f"  Contextual Retrieval: {'ON' if settings.CONTEXTUAL_RETRIEVAL_ENABLED else 'OFF'}")
    logger.info("=" * 60)

    # 初始化 Qdrant collection
    try:
        from app.core.qdrant_client import ensure_collection
        ensure_collection()
        logger.info("Qdrant collection 就绪")
    except Exception as e:
        logger.warning(f"Qdrant 初始化跳过: {e}")

    # 初始化 MinIO bucket
    try:
        from app.core.minio_client import get_minio
        get_minio()
        logger.info("MinIO bucket 就绪")
    except Exception as e:
        logger.warning(f"MinIO 初始化跳过: {e}")

    # Phase 2: 注册 Skills 体系
    try:
        import app.services.skills  # 触发 @register_skill 装饰器
        from app.services.skills.base import get_all_skills
        skills = get_all_skills()
        logger.info(f"Skills 已注册: {len(skills)} 个 — {list(skills.keys())}")
    except Exception as e:
        logger.warning(f"Skills 注册跳过: {e}")

    # Fix #5: 预加载 Embedding 和 Reranker 模型，消除首次搜索冷启动延迟
    try:
        from app.services.retrieval.embedder import get_embedder
        logger.info("正在预加载 BGE-M3 Embedding 模型...")
        embedder = get_embedder()
        embedder.encode(["warmup"], return_colbert=False)  # 触发实际加载
        logger.info("BGE-M3 Embedding 模型预加载完成")
    except Exception as e:
        logger.warning(f"Embedding 模型预加载跳过: {e}")

    try:
        from app.services.retrieval.searcher import get_searcher
        logger.info("正在预加载 BGE-Reranker 模型...")
        searcher = get_searcher()
        searcher._load_reranker()  # 显式触发 Reranker 加载
        logger.info("BGE-Reranker 模型预加载完成")
    except Exception as e:
        logger.warning(f"Reranker 模型预加载跳过: {e}")

    # Phase 3: 初始化 GraphRAG 图数据库
    if getattr(settings, "GRAPHRAG_ENABLED", False):
        try:
            from app.services.graph.store import get_graph_store
            get_graph_store()
            logger.info("Kuzu 图数据库就绪")
        except Exception as e:
            logger.warning(f"GraphRAG 初始化跳过: {e}")

    # Phase 3: RAGAS 评估就绪检查
    if getattr(settings, "RAGAS_ENABLED", False):
        logger.info(f"RAGAS 评估已启用 (采样率: {settings.RAGAS_SAMPLE_RATE}, 阈值: {settings.RAGAS_MIN_THRESHOLD})")

    yield

    logger.info("应用关闭")


app = FastAPI(
    title="企业项目知识库平台",
    description=(
        "Phase 1 + Phase 2 完整 API:\n\n"
        "**Phase 1:**\n"
        "- 多模态文档转换管道 (PDF/Word/Excel/PPT/图片/音视频/网页 → Markdown)\n"
        "- 基础 RAG 检索 (BGE-M3 三合一 + Qdrant + RRF + Reranker)\n"
        "- MCP 工具化查询 (list/outline/search/read 四工具)\n"
        "- 引用溯源 (内联引用标记 + Markdown 章节跳转 + 源文件定位)\n\n"
        "**Phase 2:**\n"
        "- Agentic RAG (LangGraph Plan-and-Execute, 最多4步, 推理透明化)\n"
        "- Skills 体系 (文档分析/跨文档对比/项目健康/报告生成)\n"
        "- SSE 流式输出 (GET /api/v1/search/stream, 感知延迟↓80%)\n"
        "- Contextual Retrieval (chunk 上下文前缀, 检索失败↓67%)"
    ),
    version="3.0.0",
    lifespan=lifespan,
)

register_exception_handlers(app)

# CORS：见 Settings.cors_origin_list；通配 `*` 时不启用 credentials（浏览器规范）
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_credentials=settings.cors_allow_credentials(),
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(documents_router, prefix="/api/v1")
app.include_router(search_router, prefix="/api/v1")
app.include_router(mcp_router, prefix="/api/v1")
app.include_router(graph_router, prefix="/api/v1")
app.include_router(evaluation_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(projects_router, prefix="/api/v1")


@app.get("/")
async def root():
    from app.services.skills.base import get_all_skills
    skills = get_all_skills()
    return {
        "name": "企业项目知识库平台",
        "version": "3.0.0",
        "phase": "Phase 1 + Phase 2",
        "modules": {
            "phase_1": [
                "多模态转换管道",
                "基础 RAG 检索 (BGE-M3 + Qdrant + RRF + Reranker)",
                "MCP 工具化查询 (list/outline/search/read)",
                "引用溯源基础版",
            ],
            "phase_2": [
                "Agentic RAG (LangGraph Plan-and-Execute)",
                f"Skills 体系 ({len(skills)} 个: {list(skills.keys())})",
                "SSE 流式输出",
                "Contextual Retrieval",
            ],
        },
        "api_prefix": "/api/v1",
        "openapi": "/docs",
        "endpoints": {
            "health": "GET /api/v1/health",
            "auth": "/api/v1/auth",
            "projects": "/api/v1/projects",
            "documents": "/api/v1/documents",
            "search": "POST /api/v1/search/",
            "stream": "GET /api/v1/search/stream?query=...&project_id=...",
            "skills": "POST /api/v1/search/skill/{skill_name}",
            "skills_list": "GET /api/v1/search/skills",
            "upload": "POST /api/v1/documents/upload",
            "mcp": "/api/v1/mcp/{tool_name}",
            "graph": "/api/v1/graph",
        },
    }


async def _health_payload() -> dict:
    checks = {}

    # PostgreSQL
    try:
        from sqlalchemy import text

        from app.core.database import engine
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except Exception as e:
        checks["postgres"] = f"error: {e}"

    # Qdrant
    try:
        from app.core.qdrant_client import get_qdrant
        client = get_qdrant()
        client.get_collections()
        checks["qdrant"] = "ok"
    except Exception as e:
        checks["qdrant"] = f"error: {e}"

    # MinIO
    try:
        from app.core.minio_client import get_minio
        minio = get_minio()
        minio.client.bucket_exists(settings.MINIO_BUCKET)
        checks["minio"] = "ok"
    except Exception as e:
        checks["minio"] = f"error: {e}"

    # Redis
    try:
        from app.core.redis_client import get_redis
        r = await get_redis()
        await r.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e}"

    # Skills
    try:
        from app.services.skills.base import get_all_skills
        skills = get_all_skills()
        checks["skills"] = f"ok ({len(skills)} registered)"
    except Exception as e:
        checks["skills"] = f"error: {e}"

    all_ok = all("ok" in str(v) for v in checks.values())
    return {"status": "healthy" if all_ok else "degraded", "checks": checks}


@app.get("/health")
async def health():
    """健康检查"""
    return await _health_payload()


@app.get("/api/v1/health")
async def health_api_v1():
    """与 `/health` 相同，便于前端统一使用 `/api/v1` 前缀。"""
    return await _health_payload()

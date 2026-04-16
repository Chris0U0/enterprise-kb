# 企业项目知识库平台 — 第一阶段

## 模块总览

```
enterprise-kb/
├── app/
│   ├── main.py                    # FastAPI 应用入口
│   ├── api/
│   │   ├── __init__.py
│   │   ├── documents.py           # 文档上传/管理 API
│   │   ├── search.py              # RAG 检索 API
│   │   └── mcp.py                 # MCP 工具化查询 API
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py              # 全局配置
│   │   ├── database.py            # PostgreSQL 连接
│   │   ├── minio_client.py        # MinIO 客户端
│   │   ├── qdrant_client.py       # Qdrant 客户端
│   │   └── redis_client.py        # Redis 客户端
│   ├── models/
│   │   ├── __init__.py
│   │   ├── database.py            # SQLAlchemy ORM 模型
│   │   └── schemas.py             # Pydantic 请求/响应模型
│   ├── services/
│   │   ├── __init__.py
│   │   ├── conversion/
│   │   │   ├── __init__.py
│   │   │   ├── pipeline.py        # 转换管道调度器
│   │   │   ├── pdf_converter.py   # PDF → Markdown
│   │   │   ├── office_converter.py# Word/PPT → Markdown
│   │   │   ├── excel_converter.py # Excel/CSV → Markdown
│   │   │   ├── image_converter.py # 图片 → Markdown
│   │   │   ├── audio_converter.py # 音视频 → Markdown
│   │   │   └── web_converter.py   # 网页 → Markdown
│   │   ├── retrieval/
│   │   │   ├── __init__.py
│   │   │   ├── embedder.py        # BGE-M3 向量化
│   │   │   ├── indexer.py         # Qdrant 索引管理
│   │   │   ├── searcher.py        # 混合检索 + RRF + Reranker
│   │   │   ├── router.py          # 查询路由
│   │   │   └── citation.py        # 引用溯源生成
│   │   └── mcp_tools/
│   │       ├── __init__.py
│   │       ├── list_documents.py  # list_documents 工具
│   │       ├── get_outline.py     # get_document_outline 工具
│   │       ├── search_sections.py # search_sections 工具
│   │       └── read_section.py    # read_section 工具
│   └── utils/
│       ├── __init__.py
│       ├── markdown_utils.py      # Frontmatter 生成/解析
│       └── checksum.py            # MD5 校验
├── config/
│   └── settings.yaml              # 环境配置
├── alembic/                       # 数据库迁移 (需 alembic init)
├── docker-compose.yml             # 基础设施编排
├── Dockerfile
├── requirements.txt
├── .env.example
└── README.md
```

## 快速启动

```bash
# 1. 启动基础设施
docker-compose up -d

# 2. 安装依赖
pip install -r requirements.txt

# 3. 初始化数据库
alembic upgrade head

# 4. 启动服务
uvicorn app.main:app --reload --port 8000

# 5. 启动 Celery worker (异步转换任务)
celery -A app.core.celery_app worker --loglevel=info
```

## 技术栈
- **LLM**: Claude claude-sonnet-4-6
- **Embedding**: BGE-M3 (dense + sparse + colbert)
- **Reranker**: BGE-Reranker-v2-m3c
- **向量库**: Qdrant
- **关系库**: PostgreSQL 16
- **文件存储**: MinIO
- **后端**: FastAPI + Celery + Redis
- **框架**: LlamaIndex + LangGraph

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
├── alembic/                       # Alembic 迁移脚本
├── docker-compose.yml             # 基础设施编排
├── Dockerfile
├── requirements.txt
├── .env.example
└── README.md
```

## 快速启动

```bash
# 1. 启动基础设施（首次会执行 scripts/init_db.sql 建库）
docker compose up -d

# 2. 复制环境变量并填写 ANTHROPIC_API_KEY 等
copy .env.example .env

# 3. 安装依赖
pip install -r requirements.txt

# 4. 自动迁移（补齐 ORM 相对 init_db.sql 的增量，例如 users 表）
alembic upgrade head

# 5. （可选）写入默认管理员 — 需先完成第 4 步
python scripts/seed_default_user.py

# 6. 启动 API
uvicorn app.main:app --reload --port 8000

# 7. （可选）Celery worker — 文档异步转换
celery -A app.core.celery_app worker --loglevel=info
```

### Docker 构建 Celery 镜像（依赖基础镜像）

`requirements.txt` 较大（含 PyTorch 等），建议先构建依赖层镜像，再构建 worker，避免每次改业务代码都重装依赖：

```bash
# Windows PowerShell
.\scripts\docker-build-base.ps1

# Linux / macOS
sh scripts/docker-build-base.sh

docker compose build celery-worker celery-beat
```

### 数据库迁移（Alembic）

- 应用增量变更：`alembic upgrade head`
- 修改 `app/models/database.py` 后生成新脚本：`alembic revision --autogenerate -m "描述"`，检查 `alembic/versions/` 后再执行 `alembic upgrade head`
- 连接串来自 `.env`（`DATABASE_URL_SYNC` / `psycopg2`），与 FastAPI 使用同一 PostgreSQL

## 技术栈
- **LLM**: Claude claude-sonnet-4-6
- **Embedding**: BGE-M3 (dense + sparse + colbert)
- **Reranker**: BGE-Reranker-v2-m3c
- **向量库**: Qdrant
- **关系库**: PostgreSQL 16
- **文件存储**: MinIO
- **后端**: FastAPI + Celery + Redis
- **框架**: LlamaIndex + LangGraph

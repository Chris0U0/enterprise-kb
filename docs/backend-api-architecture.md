# 后端 API 架构说明（以仓库实现为准）

本文描述 **当前 FastAPI 工程的分层、路由事实、鉴权策略与扩展约定**，作为前后端对接的**唯一权威**；旧版「愿望清单」式文档若与本文件冲突，以本文件与 OpenAPI（`/docs`）为准。

---

## 1. 分层结构

```
app/
├── main.py              # 应用入口：生命周期、CORS、异常处理、路由挂载
├── api/                 # HTTP 层：路由、依赖注入、参数校验（薄）
├── core/                # 横切：config、database、security、redis、clients、errors
├── models/              # ORM + Pydantic Schema（请求/响应模型）
├── services/            # 业务与领域逻辑（检索、转换、图、Skills 等）
└── utils/               # 工具函数
```

- **api**：只做参数解析、`Depends`、调用 `services` / `core`，避免在路由里写长逻辑。
- **services**：可复用、可单测；可调用 `models`、`core` 客户端。
- **models.schemas**：与 OpenAPI 文档一一对应；字段变更即版本契约变更。

---

## 2. 全局约定

| 项 | 实现 |
|----|------|
| 基础路径 | 业务 API 统一前缀 **`/api/v1`**（健康检查另有 `/health`） |
| 契约发现 | **`GET /docs`**（Swagger）、**`/openapi.json`** |
| 错误体 | `HTTPException` → `{ "detail": ..., "code": "<语义码>" }`；校验失败 → `{ "detail": [...], "code": "VALIDATION_ERROR" }` |
| CORS | 环境变量 **`CORS_ORIGINS`**：`逗号分隔` 或 `*`；为 `*` 时 **`allow_credentials=false`**（避免与浏览器规范冲突） |
| 鉴权 | Bearer JWT：`Authorization: Bearer <access_token>`；实现见 `app/api/deps.py` |

---

## 3. 路由一览（事实表）

所有下列路径均相对于 **`/api/v1`**（`main.py` 中 `include_router(..., prefix="/api/v1")`）。

| 模块 | Router `prefix` | 说明 |
|------|-----------------|------|
| Auth | `/auth` | 登录、登出、me、refresh |
| Projects | `/projects` | 项目 CRUD、成员（**需登录**） |
| Documents | `/documents` | 上传、列表、详情、Markdown、删除（**需 Bearer**，按项目成员/编辑权限） |
| Search | `/search` | RAG 检索、SSE、Skills（**需 Bearer** + 项目成员） |
| MCP | `/mcp` | 工具化查询 |
| Graph | `/graph` | GraphRAG 子图/实体/邻居等（**需 Bearer**；读操作为成员，抽取为编辑者，删全图为项目管理员） |
| Evaluation | `/evaluation` | RAGAS 等评估 |

**文档相关**（便于前端对齐）：

- 列表：`GET /documents/list/{project_id}`（非 `GET /documents?project_id=`）
- 上传：`POST /documents/upload`（`multipart/form-data`：`project_id` 必填；`upload_by` 可选，须与当前用户一致）
- 项目列表：`GET /projects` → `{ items, total, page, page_size }`
- 正文：`GET /documents/{doc_id}/markdown` → `{ doc_id, markdown }`（非 `/content`）

---

## 4. 鉴权矩阵（当前实现）

| 区域 | 是否要求 Bearer |
|------|------------------|
| `/api/v1/auth/login`、`/refresh` | 否 |
| `/api/v1/auth/me` | 是 |
| `/api/v1/projects/*` | 是（且按项目校验成员/角色） |
| `/api/v1/documents/*` | 是（列表/读：成员；上传/删：编辑者+；`upload_by` 与 Token 用户一致） |
| `/api/v1/search/*`（含 `/stream`、`/skills`） | 是（`project_id` 对应项目成员） |
| `/api/v1/graph/*` | 是（读：成员；`POST /extract`：编辑者；`DELETE /project/{id}`：项目管理员） |
| `/api/v1/mcp/*`、`/evaluation/*` 等 | 见各路由（后续可按项目维度补全） |

**扩展约定**：新增「带 `project_id`」的接口时，优先复用 `ensure_project_member`（body 内 project_id）、或 `Depends(require_project_member)`（路径/Query），与 `projects` 一致。

---

## 5. 错误码 `code`（与 HTTP 状态码对应）

`app/core/errors.py` 中按状态码映射，例如：`401` → `UNAUTHORIZED`，`422` 校验 → `VALIDATION_ERROR`。前端可按 `code` 做分支，**仍以 `detail` 为人类可读信息**。

---

## 6. 配置与扩展

- **新环境变量**：加到 `app/core/config.py` + `.env.example`，避免散落魔法常量。
- **新路由**：在 `app/api/` 新建模块，于 `main.py` `include_router`，并在此文档「路由一览」补一行。
- **破坏性变更**：优先通过新版本前缀（如未来 `/api/v2`）或字段可选/兼容期，避免静默改前端。

---

## 7. 与前端协作方式

1. **生成 TS 类型**（仓库根目录有 `scripts/export_openapi.py`，导出到 `frontend/openapi.json`）：
   ```bash
   cd frontend && npm run generate:api
   ```
   产物：`frontend/src/types/api.generated.ts`（勿手改）。
2. **Base URL**：环境变量 `NEXT_PUBLIC_API_BASE_URL`（见 `frontend/.env.example`），代码封装见 `frontend/src/lib/api.ts`（`apiV1()`）。
3. 以 **`/docs`** 与本文件为叙事权威；对接清单应引用或跟进 OpenAPI。
4. 生产环境将 **`CORS_ORIGINS`** 设为前端确切 Origin，并依赖 **`code` + `detail`** 做统一错误提示。

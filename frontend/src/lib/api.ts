/**
 * 后端 API 基地址与路径拼接（契约以仓库 `openapi.json` / `/docs` 为准）。
 * 环境变量：NEXT_PUBLIC_API_BASE_URL，默认 http://localhost:8000
 */
const raw = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export const API_BASE = raw.replace(/\/$/, "");

const API_V1 = `${API_BASE}/api/v1`;

/** 业务 API 前缀（与 FastAPI include_router 一致） */
export const apiV1 = (path: string) => {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_V1}${p}`;
};

/** 健康检查等同源路径（无 /api/v1 前缀时可走根路径） */
export const apiRoot = (path: string) => {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
};

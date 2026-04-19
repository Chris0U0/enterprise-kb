/**
 * 与 FastAPI 后端通信：自动附加 Bearer、access 过期时 refresh 重试一次、统一错误解析。
 */
import { apiV1 } from "@/lib/api";

const ACCESS = "kb-access-token";
const REFRESH = "kb-refresh-token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS);
}

export function setTokens(access: string, refresh: string | null | undefined) {
  localStorage.setItem(ACCESS, access);
  if (refresh) localStorage.setItem(REFRESH, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH);
}

type ApiErrorBody = { detail?: unknown; code?: string };

function formatDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => (typeof e === "object" && e && "msg" in e ? String((e as { msg: string }).msg) : JSON.stringify(e)))
      .join("; ");
  }
  return "请求失败";
}

function isAuthLoginUrl(url: string): boolean {
  return url.includes("/auth/login");
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      const res = await fetch(apiV1("/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        access_token: string;
        refresh_token?: string | null;
      };
      setTokens(data.access_token, data.refresh_token ?? undefined);
      return true;
    } catch {
      return false;
    }
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function doFetchJson<T>(
  path: string,
  init: (RequestInit & { json?: unknown }) | undefined,
  retriedAfterRefresh: boolean
): Promise<T> {
  const url = path.startsWith("http") ? path : apiV1(path);
  const headers = new Headers(init?.headers);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.json !== undefined) headers.set("Content-Type", "application/json");

  const res = await fetch(url, {
    ...init,
    headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });

  if (res.status === 401) {
    if (isAuthLoginUrl(url)) {
      const err = (await res.json().catch(() => ({}))) as ApiErrorBody;
      throw new Error(formatDetail(err.detail) || res.statusText);
    }
    if (!retriedAfterRefresh && getRefreshToken()) {
      const ok = await refreshAccessToken();
      if (ok) return doFetchJson<T>(path, init, true);
    }
    clearTokens();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new Error("未登录或登录已过期");
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(formatDetail(err.detail) || res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiFetchJson<T>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  return doFetchJson<T>(path, init, false);
}

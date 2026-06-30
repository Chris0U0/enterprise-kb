import { apiV1 } from "@/lib/api";
import { apiFetchJson, getAccessToken } from "@/lib/api-client";

export type CreateShareResponse = {
  share_token: string;
  share_path: string;
  expires_at: string | null;
  created_at: string;
};

export type ShareLinkItem = {
  id: string;
  share_token: string;
  share_path: string;
  title: string;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number;
  created_at: string;
};

export type PublicShareMessage = {
  role: string;
  content: string;
  citations: Array<{
    doc_name?: string | null;
    section_title?: string | null;
    section_path?: string | null;
    page_num?: number | null;
  }>;
  created_at: string | null;
};

export type PublicShareData = {
  title: string;
  project_name: string | null;
  shared_at: string;
  expires_at: string | null;
  view_count: number;
  messages: PublicShareMessage[];
};

export function buildShareUrl(sharePath: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}${sharePath}`;
  }
  return sharePath;
}

export async function downloadSessionExport(sessionId: string, format: "md" | "json"): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(apiV1(`/chat/sessions/${sessionId}/export?format=${format}`), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err.detail === "string" ? err.detail : `导出失败 (${res.status})`
    );
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  let filename = `chat.${format === "json" ? "json" : "md"}`;
  const match = cd?.match(/filename="([^"]+)"/);
  if (match?.[1]) filename = match[1];

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function createSessionShare(
  sessionId: string,
  expiresInDays = 7
): Promise<CreateShareResponse> {
  return apiFetchJson<CreateShareResponse>(`/chat/sessions/${sessionId}/shares`, {
    method: "POST",
    json: { expires_in_days: expiresInDays },
  });
}

export async function listSessionShares(sessionId: string): Promise<ShareLinkItem[]> {
  return apiFetchJson<ShareLinkItem[]>(`/chat/sessions/${sessionId}/shares`);
}

export async function revokeSessionShare(token: string): Promise<void> {
  await apiFetchJson(`/chat/shares/${token}`, { method: "DELETE" });
}

export async function fetchPublicShare(token: string): Promise<PublicShareData> {
  const res = await fetch(apiV1(`/share/${token}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === "string" ? err.detail : "分享不存在或已失效");
  }
  return res.json() as Promise<PublicShareData>;
}

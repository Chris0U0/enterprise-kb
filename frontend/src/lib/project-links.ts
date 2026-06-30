/** 跨模块跳转时保持 projectId，便于目标页筛选与高亮 */

export function withProjectQuery(
  basePath: string,
  projectId: string,
  extra?: Record<string, string>
): string {
  const init: Record<string, string> = { ...(extra ?? {}) };
  if (projectId) init.projectId = projectId;
  const qs = new URLSearchParams(init);
  const sep = basePath.includes("?") ? "&" : "?";
  const s = qs.toString();
  if (!s) return basePath;
  return `${basePath}${sep}${s}`;
}

/** Copilot 页 URL：projectId + 可选 sessionId */
export function copilotPath(projectId: string, sessionId?: string | null): string {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  if (sessionId) params.set("sessionId", sessionId);
  const qs = params.toString();
  return qs ? `/copilot?${qs}` : "/copilot";
}

export function projectPath(projectId: string, segment: string): string {
  const s = segment.replace(/^\//, "");
  return `/projects/${projectId}/${s}`;
}

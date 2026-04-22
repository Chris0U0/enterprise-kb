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

export function projectPath(projectId: string, segment: string): string {
  const s = segment.replace(/^\//, "");
  return `/projects/${projectId}/${s}`;
}

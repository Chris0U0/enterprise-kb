/**
 * 项目内权限（与后端 project_members.role 及 API 返回的 my_role 对齐）
 */
export type ProjectRole = "Admin" | "Editor" | "Viewer";

export function normalizeProjectRole(raw: string | undefined | null): ProjectRole | undefined {
  if (!raw) return undefined;
  const x = raw.trim();
  if (x === "Admin" || x === "Editor" || x === "Viewer") return x;
  return "Viewer";
}

export function canEditInProject(role: ProjectRole | undefined): boolean {
  return role === "Admin" || role === "Editor";
}

import { fallbackProjectRecord } from "@/data/project-registry";

/** 同步占位名；真实名称请用 `useProject` 拉取后端 */
export function getProjectDisplayName(projectId: string): string {
  return fallbackProjectRecord(projectId).name;
}

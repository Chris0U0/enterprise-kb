import { getProjectRecord } from "@/data/project-registry";

/** @deprecated 请优先使用 useProject / getProjectRecord */
export function getProjectDisplayName(projectId: string): string {
  return getProjectRecord(projectId).name;
}

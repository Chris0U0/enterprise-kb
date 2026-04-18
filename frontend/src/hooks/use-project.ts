"use client";

import { useMemo } from "react";
import { getProjectRecord, type ProjectRecord } from "@/data/project-registry";

/**
 * 子页面统一从项目 ID 取展示名、阶段、引导标记（与面包屑 segmentLabels 一致）。
 */
export function useProject(projectId: string | undefined): {
  project: ProjectRecord | null;
  isLoading: boolean;
} {
  const project = useMemo(() => {
    if (!projectId) return null;
    return getProjectRecord(projectId);
  }, [projectId]);

  return { project, isLoading: false };
}

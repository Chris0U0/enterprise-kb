/**
 * 与后端 `ProjectDetail` / onboarding 字段语义对齐；不再维护本地 PROJECT_REGISTRY。
 */
import type { ProjectRole } from "@/lib/project-permissions";

export type ProjectOnboardingFlags = {
  hasUploadedDoc: boolean;
  hasIndexedKnowledge: boolean;
  hasTriedQa: boolean;
  hasViewedRiskOrReport: boolean;
};

export type ProjectRecord = {
  id: string;
  name: string;
  phase: string;
  description?: string | null;
  onboarding: ProjectOnboardingFlags;
  health?: { progress: number; risk: number; quality: number };
  /** 当前用户在本项目中的角色（GET /projects/:id 的 my_role） */
  myRole?: ProjectRole;
};

export function mapOnboardingFromApi(raw: {
  has_uploaded_doc: boolean;
  has_indexed_knowledge: boolean;
  has_tried_qa: boolean;
  has_viewed_risk_or_report: boolean;
}): ProjectOnboardingFlags {
  return {
    hasUploadedDoc: raw.has_uploaded_doc,
    hasIndexedKnowledge: raw.has_indexed_knowledge,
    hasTriedQa: raw.has_tried_qa,
    hasViewedRiskOrReport: raw.has_viewed_risk_or_report,
  };
}

/** API 失败时的占位，避免页面空白 */
export function fallbackProjectRecord(projectId: string): ProjectRecord {
  return {
    id: projectId,
    name: `项目 ${projectId.slice(0, 8)}…`,
    phase: "—",
    onboarding: {
      hasUploadedDoc: false,
      hasIndexedKnowledge: false,
      hasTriedQa: false,
      hasViewedRiskOrReport: false,
    },
  };
}

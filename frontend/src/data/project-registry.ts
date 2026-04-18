/** 单一数据源：项目展示字段（后续可换 API） */
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
  onboarding: ProjectOnboardingFlags;
};

const DEFAULT_ONBOARDING: ProjectOnboardingFlags = {
  hasUploadedDoc: true,
  hasIndexedKnowledge: true,
  hasTriedQa: false,
  hasViewedRiskOrReport: false,
};

export const PROJECT_REGISTRY: Record<string, ProjectRecord> = {
  "1": {
    id: "1",
    name: "智能排班系统",
    phase: "开发联调",
    onboarding: {
      hasUploadedDoc: true,
      hasIndexedKnowledge: true,
      hasTriedQa: true,
      hasViewedRiskOrReport: false,
    },
  },
  "2": {
    id: "2",
    name: "企业知识库 RAG",
    phase: "需求设计",
    onboarding: {
      hasUploadedDoc: true,
      hasIndexedKnowledge: false,
      hasTriedQa: false,
      hasViewedRiskOrReport: false,
    },
  },
  "3": {
    id: "3",
    name: "自动化运维平台",
    phase: "灰度发布",
    onboarding: {
      hasUploadedDoc: true,
      hasIndexedKnowledge: true,
      hasTriedQa: false,
      hasViewedRiskOrReport: true,
    },
  },
};

export function getProjectRecord(projectId: string): ProjectRecord {
  const hit = PROJECT_REGISTRY[projectId];
  if (hit) return hit;
  return {
    id: projectId,
    name: `项目 #${projectId}`,
    phase: "进行中",
    onboarding: { ...DEFAULT_ONBOARDING },
  };
}

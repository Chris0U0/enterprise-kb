/** 与项目详情页 Mock 保持一致，后续可改为 API */
export function getProjectDisplayName(projectId: string): string {
  return projectId === "1" ? "智能排班系统" : "企业知识库 RAG";
}

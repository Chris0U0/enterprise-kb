export type BreadcrumbItem = { label: string; href?: string };

/** 路径段到展示名的映射（不含动态 id） */
const SEGMENT_LABELS: Record<string, string> = {
  projects: "项目管理",
  copilot: "AI 研读室",
  knowledge: "知识库管理",
  qa: "问答记录",
  artifacts: "产出物",
  collab: "协作空间",
  graph: "图谱探索",
  report: "报告中心",
  admin: "系统设置",
  approval: "入库审批",
  agent: "Agent 编排",
  resource: "资源配额",
  security: "安全合规",
  login: "登录",
};

function isLikelyIdSegment(segment: string): boolean {
  return /^[\da-f-]{8,}$/i.test(segment) || /^\d+$/.test(segment);
}

/**
 * 根据 pathname 生成默认面包屑；动态段显示为「项目详情」或由 overrides 覆盖。
 */
export function breadcrumbsFromPathname(
  pathname: string,
  overrides?: { segmentLabels?: Record<string, string> }
): BreadcrumbItem[] {
  if (pathname === "/" || pathname === "") {
    return [{ label: "全局工作台" }];
  }

  const parts = pathname.split("/").filter(Boolean);
  const items: BreadcrumbItem[] = [{ label: "全局工作台", href: "/" }];
  let acc = "";

  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    acc += `/${seg}`;
    const isLast = i === parts.length - 1;
    const overrideKey = acc;
    const prev = i > 0 ? parts[i - 1] : "";
    let label = overrides?.segmentLabels?.[overrideKey];
    if (!label) {
      if (prev === "qa") label = "会话详情";
      else if (prev === "artifacts") label = "产出物详情";
      else if (prev === "collab") label = "协作文档";
      else if (isLikelyIdSegment(seg)) label = "项目详情";
      else label = SEGMENT_LABELS[seg] ?? seg;
    }

    if (seg === "admin" && !isLast) {
      label = "系统设置";
    }

    items.push({
      label,
      href: isLast ? undefined : acc,
    });
  }

  return items;
}

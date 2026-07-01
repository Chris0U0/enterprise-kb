/** 引用点击目标：联动右侧 PDF 预览 */
export type CitationTarget = {
  docId: string;
  pageNum?: number | null;
  sectionPath?: string | null;
  sectionTitle?: string | null;
};

export type CitationListItem = {
  id: string;
  label: string;
  href: string;
  target?: CitationTarget;
};

type CitationLike = {
  doc_id?: string;
  doc_name?: string;
  section_path?: string;
  section_title?: string | null;
  page_num?: number | null;
};

export function buildCitationHref(c: CitationLike): string {
  const params = new URLSearchParams();
  if (c.doc_id) params.set("docId", c.doc_id);
  if (c.section_path) params.set("sectionPath", c.section_path);
  if (typeof c.page_num === "number") params.set("pageNum", String(c.page_num));
  const qs = params.toString();
  return qs ? `/knowledge?${qs}` : "/knowledge";
}

export function buildCitationLabel(c: CitationLike): string {
  const suffix = c.page_num ? ` · 第${c.page_num}页` : "";
  const section = c.section_title ?? c.section_path ?? "";
  return `${c.doc_name ?? "未知文档"}${section ? ` · ${section}` : ""}${suffix}`;
}

export function toCitationListItem(c: CitationLike, id: string): CitationListItem {
  return {
    id,
    label: buildCitationLabel(c),
    href: buildCitationHref(c),
    target: c.doc_id
      ? {
          docId: c.doc_id,
          pageNum: c.page_num,
          sectionPath: c.section_path,
          sectionTitle: c.section_title,
        }
      : undefined,
  };
}

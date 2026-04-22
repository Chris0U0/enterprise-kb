"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { withProjectQuery } from "@/lib/project-links";

export type CitationItem = {
  id: string;
  label: string;
  /** 跳知识库或文档锚点 */
  href: string;
};

export function CitationList({
  items,
  projectId,
}: {
  items: CitationItem[];
  projectId: string;
}) {
  return (
    <div className="rounded-sm border border-border bg-background/80 p-3">
      <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <FileText size={12} />
        引用来源
      </p>
      <ul className="space-y-1.5 text-xs">
        {items.map((c) => (
          <li key={c.id}>
            {/*
              若 href 已包含查询参数（如 docId/sectionPath），保留原参数并追加 projectId 上下文。
            */}
            <Link
              href={c.href.startsWith("http") ? c.href : withProjectQuery(c.href, projectId)}
              className="text-primary underline-offset-2 hover:underline"
            >
              {c.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

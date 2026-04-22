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
  onCitationClick,
}: {
  items: CitationItem[];
  projectId: string;
  onCitationClick?: (docId: string) => void;
}) {
  return (
    <div className="rounded-sm border border-border bg-background/80 p-3">
      <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <FileText size={12} />
        引用来源
      </p>
      <ul className="space-y-1.5 text-xs">
        {items.map((c, idx) => {
          // 解析 docId 供联动使用
          const url = new URL(c.href, "http://dummy.com");
          const docId = url.searchParams.get("docId");

          return (
            <li key={c.id} className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                {idx + 1}
              </span>
              <button
                type="button"
                onClick={() => docId && onCitationClick?.(docId)}
                className="text-left text-primary underline-offset-2 hover:underline truncate max-w-[200px]"
              >
                {c.label}
              </button>
              <Link
                href={c.href.startsWith("http") ? c.href : withProjectQuery(c.href, projectId)}
                className="ml-auto text-muted-foreground hover:text-primary"
                title="在知识库中打开"
              >
                <FileText size={10} />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

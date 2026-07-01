"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { withProjectQuery } from "@/lib/project-links";
import type { CitationListItem, CitationTarget } from "@/lib/citation-target";

export type { CitationListItem, CitationTarget };

export function CitationList({
  items,
  projectId,
  onCitationClick,
}: {
  items: CitationListItem[];
  projectId: string;
  onCitationClick?: (target: CitationTarget) => void;
}) {
  return (
    <div className="rounded-sm border border-border bg-background/80 p-3">
      <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <FileText size={12} />
        引用来源
      </p>
      <ul className="space-y-1.5 text-xs">
        {items.map((c, idx) => (
          <li key={c.id} className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
              {idx + 1}
            </span>
            <button
              type="button"
              onClick={() => c.target && onCitationClick?.(c.target)}
              disabled={!c.target}
              className="min-w-0 flex-1 truncate text-left text-primary underline-offset-2 hover:underline disabled:cursor-default disabled:text-foreground disabled:no-underline"
            >
              {c.label}
            </button>
            <Link
              href={c.href.startsWith("http") ? c.href : withProjectQuery(c.href, projectId)}
              className="shrink-0 text-muted-foreground hover:text-primary"
              title="在知识库中打开"
            >
              <FileText size={10} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

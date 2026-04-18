"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamStep } from "@/hooks/use-search-stream-mock";

export function SearchProgressPanel({
  steps,
  running,
}: {
  steps: StreamStep[];
  running: boolean;
}) {
  return (
    <div className="rounded-sm border border-border bg-muted/40 p-3 font-sans text-sm shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {running ? (
          <Loader2 size={14} className="animate-spin text-primary" />
        ) : null}
        <span className="font-medium text-foreground">检索进度</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          路由对用户透明
        </span>
      </div>
      <ul className="space-y-1.5 text-xs">
        {steps.map((s) => (
          <li
            key={s.id}
            className={cn(
              "flex items-start gap-2 rounded-sm px-2 py-1",
              s.status === "active" && "bg-primary/10 font-medium text-primary",
              s.status === "done" && "text-muted-foreground line-through opacity-80",
              s.status === "pending" && "text-muted-foreground/80"
            )}
          >
            <span className="shrink-0">
              {s.status === "done" ? "✓" : s.status === "active" ? "›" : "·"}
            </span>
            <span>{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

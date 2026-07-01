"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamStep } from "@/hooks/use-search-stream";

export function SearchProgressPanel({
  steps,
  running,
}: {
  steps: StreamStep[];
  running: boolean;
}) {
  if (steps.length === 0 && !running) return null;

  return (
    <div className="rounded-sm border border-border bg-muted/40 p-3 font-sans text-sm shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {running ? <Loader2 size={14} className="animate-spin text-primary" /> : null}
        <span className="font-medium text-foreground">检索进度</span>
      </div>
      <ul className="space-y-2 text-xs">
        {steps.map((s) => (
          <li key={s.id} className="rounded-sm px-2 py-1">
            <div
              className={cn(
                "flex items-start gap-2",
                s.status === "active" && "font-medium text-primary",
                s.status === "done" && "text-muted-foreground",
                s.status === "pending" && "text-muted-foreground/80"
              )}
            >
              <span className="mt-0.5 shrink-0">
                {s.status === "done" ? "✓" : s.status === "active" ? "›" : "·"}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <span>{s.label}</span>
                {s.message && s.message !== s.label ? (
                  <p className="text-[11px] text-muted-foreground">{s.message}</p>
                ) : null}
                {s.planSteps && s.planSteps.length > 0 ? (
                  <ul className="mt-1 space-y-1 border-l-2 border-primary/20 pl-2">
                    {s.planSteps.map((p) => (
                      <li key={String(p.id)} className="text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">步骤 {p.id}</span>
                        {p.action ? (
                          <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px]">{p.action}</span>
                        ) : null}
                        {p.thought ? <p className="mt-0.5 leading-relaxed">{p.thought}</p> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {s.found ? (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    结果摘要：{s.found}
                    {typeof s.sourcesCount === "number" ? ` · ${s.sourcesCount} 个来源` : ""}
                    {typeof s.confidence === "number" && s.confidence > 0
                      ? ` · 置信度 ${Math.round(s.confidence * 100)}%`
                      : ""}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

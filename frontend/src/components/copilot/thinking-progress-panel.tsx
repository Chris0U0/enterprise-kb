"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThinkingTrace } from "@/hooks/use-search-stream";

export function ThinkingProgressPanel({
  traces,
  running,
}: {
  traces: ThinkingTrace[];
  running: boolean;
}) {
  const [open, setOpen] = useState(true);

  if (traces.length === 0 && !running) return null;

  return (
    <div className="rounded-sm border border-border bg-muted/30 font-sans text-sm shadow-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-muted-foreground hover:bg-muted/40"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Brain size={14} className="text-primary/70" />
        <span className="font-medium text-foreground">推理过程</span>
        {running ? (
          <span className="text-[10px] uppercase tracking-wider text-primary">进行中</span>
        ) : (
          <span className="text-[10px] text-muted-foreground">{traces.length} 步</span>
        )}
      </button>
      {open && (
        <ul className="max-h-48 space-y-2 overflow-y-auto border-t border-border px-3 py-2 text-xs">
          {traces.length === 0 && running ? (
            <li className="text-muted-foreground animate-pulse">正在分析问题并制定计划…</li>
          ) : null}
          {traces.map((t, idx) => (
            <li key={`${t.stepId}-${idx}`} className="rounded-md bg-background/80 px-2 py-2">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-medium text-primary">步骤 {t.stepId}</span>
                {t.action ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {t.action}
                  </span>
                ) : null}
              </div>
              {t.thought ? <p className="leading-relaxed text-foreground">{t.thought}</p> : null}
              {t.query ? (
                <p className={cn("text-muted-foreground", t.thought && "mt-1")}>
                  检索：{t.query}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

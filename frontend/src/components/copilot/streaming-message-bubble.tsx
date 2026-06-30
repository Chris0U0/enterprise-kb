"use client";

import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Bot, Loader2 } from "lucide-react";
import { MarkdownContent } from "@/components/copilot/markdown-content";
import { CitationList } from "@/components/copilot/citation-list";

type StreamingMessageBubbleProps = {
  answer: string;
  error: string | null;
  running: boolean;
  citationLabels: { id: string; label: string; href: string }[];
  projectId: string;
  onCitationClick?: (docId: string) => void;
};

export function StreamingMessageBubble({
  answer,
  error,
  running,
  citationLabels,
  projectId,
  onCitationClick,
}: StreamingMessageBubbleProps) {
  const timeLabel = format(new Date(), "MM月dd日 HH:mm", { locale: zhCN });

  return (
    <div className="group flex gap-3">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-primary/10 text-primary"
        aria-hidden
      >
        <Bot size={16} />
      </div>

      <div className="min-w-0 max-w-[85%] space-y-1">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>AI 助手</span>
          <span>{timeLabel}</span>
          {running && <Loader2 size={12} className="animate-spin" />}
        </div>

        <div className="rounded-lg border border-border bg-white px-4 py-3 shadow-sm">
          {answer ? (
            running ? (
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{answer}</pre>
            ) : (
              <MarkdownContent content={answer} />
            )
          ) : running ? (
            <div className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground animate-pulse">
              AI 正在思考并检索相关文档...
            </div>
          ) : null}
          {error ? <p className="mt-2 text-sm font-medium text-destructive">{error}</p> : null}

          {citationLabels.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <CitationList
                items={citationLabels}
                projectId={projectId}
                onCitationClick={onCitationClick}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

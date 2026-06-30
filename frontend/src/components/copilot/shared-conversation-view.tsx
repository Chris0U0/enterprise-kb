"use client";

import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/copilot/markdown-content";
import type { PublicShareMessage } from "@/lib/chat-export-share";

function formatCitationLabel(c: PublicShareMessage["citations"][number]): string {
  const parts = [c.doc_name || "文档"];
  if (c.section_title) parts.push(c.section_title);
  else if (c.section_path) parts.push(c.section_path);
  if (typeof c.page_num === "number") parts.push(`第${c.page_num}页`);
  return parts.join(" · ");
}

function SharedMessageBubble({ message }: { message: PublicShareMessage }) {
  const isUser = message.role === "user";
  const timeLabel = message.created_at
    ? format(new Date(message.created_at), "MM月dd日 HH:mm", { locale: zhCN })
    : "";

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border",
          isUser ? "bg-secondary text-secondary-foreground" : "bg-primary/10 text-primary"
        )}
        aria-hidden
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div className={cn("min-w-0 max-w-[85%] space-y-1")}>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{isUser ? "提问者" : "AI 助手"}</span>
          {timeLabel ? <span>{timeLabel}</span> : null}
        </div>
        <div
          className={cn(
            "rounded-lg border border-border px-4 py-3 shadow-sm",
            isUser ? "bg-secondary/40" : "bg-white"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
          ) : (
            <MarkdownContent content={message.content} />
          )}
          {!isUser && message.citations.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
              {message.citations.map((c, i) => (
                <li key={i}>· {formatCitationLabel(c)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

type SharedConversationViewProps = {
  title: string;
  projectName?: string | null;
  sharedAt?: string;
  expiresAt?: string | null;
  viewCount?: number;
  messages: PublicShareMessage[];
};

export function SharedConversationView({
  title,
  projectName,
  sharedAt,
  expiresAt,
  viewCount,
  messages,
}: SharedConversationViewProps) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="space-y-2 border-b border-border pb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">只读分享</p>
        <h1 className="font-serif text-2xl font-semibold italic text-foreground">{title}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {projectName ? <span>项目：{projectName}</span> : null}
          {sharedAt ? (
            <span>分享于 {format(new Date(sharedAt), "yyyy-MM-dd HH:mm", { locale: zhCN })}</span>
          ) : null}
          {typeof viewCount === "number" ? <span>浏览 {viewCount} 次</span> : null}
          {expiresAt ? (
            <span>有效期至 {format(new Date(expiresAt), "yyyy-MM-dd HH:mm", { locale: zhCN })}</span>
          ) : null}
        </div>
      </header>

      <div className="space-y-8">
        {messages.map((msg, idx) => (
          <SharedMessageBubble key={`${msg.role}-${idx}`} message={msg} />
        ))}
      </div>
    </div>
  );
}

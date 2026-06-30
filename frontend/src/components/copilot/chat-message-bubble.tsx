"use client";

import { useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/copilot/markdown-content";
import { MessageActions, type MessageFeedback } from "@/components/copilot/message-actions";
import { CitationList } from "@/components/copilot/citation-list";
import type { ChatMessage } from "@/hooks/use-chat-sessions";

type CitationItem = {
  id: string;
  label: string;
  href: string;
};

type ChatMessageBubbleProps = {
  message: ChatMessage;
  projectId: string;
  citationItems?: CitationItem[];
  onCitationClick?: (docId: string) => void;
  onCopy: (content: string) => void;
  onFeedback?: (messageId: string, rating: MessageFeedback) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onDelete?: (messageId: string) => void;
  onRegenerate?: (messageId: string) => void;
  actionsDisabled?: boolean;
};

export function ChatMessageBubble({
  message,
  projectId,
  citationItems = [],
  onCitationClick,
  onCopy,
  onFeedback,
  onEdit,
  onDelete,
  onRegenerate,
  actionsDisabled = false,
}: ChatMessageBubbleProps) {
  const isUser = message.role === "user";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  const timeLabel = message.created_at
    ? format(new Date(message.created_at), "MM月dd日 HH:mm", { locale: zhCN })
    : "";

  const submitEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === message.content) {
      setEditing(false);
      setDraft(message.content);
      return;
    }
    onEdit?.(message.id, trimmed);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "group flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border",
          isUser ? "bg-secondary text-secondary-foreground" : "bg-primary/10 text-primary"
        )}
        aria-hidden
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      <div className={cn("min-w-0 max-w-[85%] space-y-1", isUser ? "items-end" : "items-start")}>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{isUser ? "你" : "AI 助手"}</span>
          {timeLabel ? <span>{timeLabel}</span> : null}
        </div>

        <div
          className={cn(
            "rounded-lg border border-border px-4 py-3 shadow-sm",
            isUser ? "bg-secondary/40" : "bg-white"
          )}
        >
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-[80px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setDraft(message.content);
                  }}
                >
                  取消
                </Button>
                <Button type="button" size="sm" onClick={submitEdit}>
                  保存并重新提问
                </Button>
              </div>
            </div>
          ) : isUser ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
          ) : (
            <MarkdownContent content={message.content} />
          )}

          {!isUser && citationItems.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <CitationList
                items={citationItems}
                projectId={projectId}
                onCitationClick={onCitationClick}
              />
            </div>
          )}
        </div>

        {!editing && (
          <MessageActions
            role={message.role}
            feedback={(message.feedback as MessageFeedback) ?? null}
            disabled={actionsDisabled}
            onCopy={() => onCopy(message.content)}
            onFeedback={
              !isUser && onFeedback
                ? (rating) => onFeedback(message.id, rating)
                : undefined
            }
            onEdit={isUser && onEdit ? () => setEditing(true) : undefined}
            onDelete={onDelete ? () => onDelete(message.id) : undefined}
            onRegenerate={!isUser && onRegenerate ? () => onRegenerate(message.id) : undefined}
          />
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Pencil,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type MessageFeedback = "up" | "down" | null;

type MessageActionsProps = {
  role: "user" | "assistant";
  feedback?: MessageFeedback;
  disabled?: boolean;
  onCopy: () => void;
  onFeedback?: (rating: MessageFeedback) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRegenerate?: () => void;
};

export function MessageActions({
  role,
  feedback = null,
  disabled = false,
  onCopy,
  onFeedback,
  onEdit,
  onDelete,
  onRegenerate,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    onCopy();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100",
        disabled && "pointer-events-none opacity-40"
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label="复制"
        onClick={() => void handleCopy()}
      >
        {copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
      </Button>

      {role === "assistant" && onFeedback && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", feedback === "up" && "text-primary bg-primary/10")}
            aria-label="有帮助"
            onClick={() => onFeedback(feedback === "up" ? null : "up")}
          >
            <ThumbsUp size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", feedback === "down" && "text-destructive bg-destructive/10")}
            aria-label="无帮助"
            onClick={() => onFeedback(feedback === "down" ? null : "down")}
          >
            <ThumbsDown size={14} />
          </Button>
        </>
      )}

      {role === "assistant" && onRegenerate && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="重新生成"
          onClick={onRegenerate}
        >
          <RotateCcw size={14} />
        </Button>
      )}

      {role === "user" && onEdit && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="编辑"
          onClick={onEdit}
        >
          <Pencil size={14} />
        </Button>
      )}

      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:text-destructive"
          aria-label="删除"
          onClick={onDelete}
        >
          <Trash2 size={14} />
        </Button>
      )}
    </div>
  );
}

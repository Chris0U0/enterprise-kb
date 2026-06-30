"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Send, Square } from "lucide-react";
import { cn } from "@/lib/utils";

type CopilotChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  running?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

export function CopilotChatInput({
  value,
  onChange,
  onSend,
  onStop,
  running = false,
  disabled = false,
  placeholder = "询问关于项目的问题…",
}: CopilotChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && running && onStop) {
        e.preventDefault();
        onStop();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [running, onStop]);

  return (
    <div className="relative rounded-md border border-input bg-white shadow-sm focus-within:ring-2 focus-within:ring-ring">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!disabled && !running && value.trim()) onSend();
          }
        }}
        placeholder={placeholder}
        rows={1}
        disabled={disabled}
        className={cn(
          "block w-full resize-none bg-transparent px-4 py-3 pr-28 text-base font-sans leading-relaxed",
          "placeholder:text-muted-foreground focus:outline-none",
          "min-h-[3.25rem] max-h-40"
        )}
        aria-label="向 AI 提问"
      />
      <div className="absolute bottom-2 right-2 flex gap-1">
        {running && onStop ? (
          <Button
            size="icon"
            type="button"
            variant="outline"
            className="h-9 w-9"
            aria-label="停止生成 (Esc)"
            onClick={onStop}
          >
            <Square size={16} className="fill-current" />
          </Button>
        ) : null}
        <Button
          size="icon"
          type="button"
          className="h-9 w-9 bg-primary hover:bg-primary/90"
          aria-label="发送"
          disabled={disabled || running || !value.trim()}
          onClick={onSend}
        >
          <Send size={18} />
        </Button>
      </div>
      <p className="border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground">
        Enter 发送 · Shift+Enter 换行 · Esc 停止生成
      </p>
    </div>
  );
}

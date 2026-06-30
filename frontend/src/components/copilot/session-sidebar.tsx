"use client";

import { useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, X, Pencil, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatSession } from "@/hooks/use-chat-sessions";

type SessionSidebarProps = {
  sessions: ChatSession[];
  activeSessionId: string | null;
  sessionQuery: string;
  onSessionQueryChange: (q: string) => void;
  isSessionStreaming: (id: string) => boolean;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => Promise<void>;
};

export function SessionSidebar({
  sessions,
  activeSessionId,
  sessionQuery,
  onSessionQueryChange,
  isSessionStreaming,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
}: SessionSidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);

  const startRename = (s: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(s.id);
    setRenameDraft(s.title);
  };

  const submitRename = async () => {
    if (!renamingId) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    setRenaming(true);
    try {
      await onRenameSession(renamingId, trimmed);
      setRenamingId(null);
    } finally {
      setRenaming(false);
    }
  };

  return (
    <div className="flex h-full flex-col p-4">
      <Button
        variant="outline"
        className="mb-3 w-full justify-start gap-2 border-dashed"
        onClick={onNewChat}
      >
        <Plus size={16} />
        开启新对话
      </Button>

      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={sessionQuery}
          onChange={(e) => onSessionQueryChange(e.target.value)}
          placeholder="搜索对话…"
          className="h-8 pl-8 text-xs"
          aria-label="搜索历史对话"
        />
      </div>

      <ScrollArea className="flex-1 -mx-2 px-2">
        <div className="space-y-1">
          {sessions.length === 0 ? (
            <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">
              {sessionQuery.trim() ? "无匹配对话" : "暂无历史对话"}
            </p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={cn(
                  "group flex items-center gap-1 rounded-sm px-2 py-2 text-xs transition-colors cursor-pointer",
                  activeSessionId === s.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
                onClick={() => renamingId !== s.id && onSelectSession(s.id)}
              >
                {renamingId === s.id ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    disabled={renaming}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => void submitRename()}
                    className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-xs text-foreground"
                  />
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.title}</p>
                      <p
                        className={cn(
                          "truncate text-[10px]",
                          activeSessionId === s.id ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}
                      >
                        {format(new Date(s.updated_at), "MM/dd HH:mm", { locale: zhCN })}
                      </p>
                    </div>
                    {isSessionStreaming(s.id) && (
                      <Loader2 size={12} className="shrink-0 animate-spin opacity-70" />
                    )}
                    <button
                      type="button"
                      className={cn(
                        "shrink-0 opacity-0 group-hover:opacity-100",
                        activeSessionId === s.id ? "hover:text-primary-foreground" : "hover:text-foreground"
                      )}
                      aria-label="重命名"
                      onClick={(e) => startRename(s, e)}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-destructive"
                      aria-label="删除"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(s.id);
                      }}
                    >
                      <X size={12} />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

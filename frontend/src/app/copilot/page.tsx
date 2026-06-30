"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { AppPage, PageHeader } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BookOpen, Search, Send, FileText, Loader2, Plus, X, ChevronDown, Square, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProject } from "@/hooks/use-project";
import { useProjectList } from "@/hooks/use-project-list";
import { useSearchStream } from "@/hooks/use-search-stream";
import { SearchProgressPanel } from "@/components/copilot/search-progress-panel";
import { ChatMessageBubble } from "@/components/copilot/chat-message-bubble";
import { SessionShareExportMenu } from "@/components/copilot/session-share-export-menu";
import { StreamingMessageBubble } from "@/components/copilot/streaming-message-bubble";
import type { MessageFeedback } from "@/components/copilot/message-actions";
import { copilotPath, withProjectQuery } from "@/lib/project-links";
import { PdfViewer } from "@/components/shared/pdf-viewer";
import { apiFetchJson } from "@/lib/api-client";
import {
  useChatSessions,
  useChatMessages,
  deleteChatMessage,
  editChatMessage,
  setMessageFeedback,
  regenerateChatMessage,
  type ChatMessage,
} from "@/hooks/use-chat-sessions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

type SourceResp = {
  doc_id: string;
  preview_url?: string;
  source_url: string;
  mode?: "inline" | "download";
  preview_content_type?: string | null;
  original_filename: string;
};

export default function CopilotPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items: projectList } = useProjectList();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const resolvedProjectId = selectedProjectId || searchParams.get("projectId") || projectList[0]?.id;

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  const urlInitializedRef = useRef(false);

  const { project: meta } = useProject(resolvedProjectId || undefined);
  const { sessions, refetch: refetchSessions, deleteSession } = useChatSessions(resolvedProjectId);
  const {
    messages: historyMessages,
    loading: loadingHistory,
    refetch: refetchMessages,
    updateMessageLocally,
    replaceMessages,
  } = useChatMessages(activeSessionId);

  const handleStreamComplete = useCallback(
    (sessionId: string) => {
      void refetchSessions();
      if (activeSessionIdRef.current === sessionId) {
        void refetchMessages();
      }
    },
    [refetchSessions, refetchMessages]
  );

  const handleSessionCreated = useCallback((sessionId: string) => {
    setActiveSessionId((current) => current ?? sessionId);
  }, []);

  const {
    steps,
    running,
    answer,
    error,
    citationLabels,
    pendingQuery,
    start,
    clearDisplay,
    stopCurrentStream,
    abortAllStreams,
    abortStreamByKey,
    isSessionStreaming,
    citations,
  } = useSearchStream({
    viewSessionId: activeSessionId,
    onSessionCreated: handleSessionCreated,
    onStreamComplete: handleStreamComplete,
  });

  const [input, setInput] = useState("");
  const [complex, setComplex] = useState(false);

  const syncUrl = useCallback(
    (projectId: string, sessionId: string | null) => {
      router.replace(copilotPath(projectId, sessionId), { scroll: false });
    },
    [router]
  );

  // 刷新页面时从 URL 恢复 sessionId（仅初始化一次）
  useEffect(() => {
    if (urlInitializedRef.current) return;
    const urlSession = searchParams.get("sessionId");
    if (urlSession) setActiveSessionId(urlSession);
    urlInitializedRef.current = true;
  }, [searchParams]);

  // 状态变更时同步到 URL
  useEffect(() => {
    if (!resolvedProjectId || !urlInitializedRef.current) return;
    syncUrl(resolvedProjectId, activeSessionId);
  }, [resolvedProjectId, activeSessionId, syncUrl]);

  const handleSwitchProject = (id: string) => {
    setSelectedProjectId(id);
    abortAllStreams();
    setActiveSessionId(null);
    router.replace(copilotPath(id));
  };

  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewType, setPreviewType] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activeDocName, setActiveDocName] = useState<string>("");

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.closest("[data-radix-scroll-area-viewport]");
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [answer, historyMessages, running, pendingQuery]);

  const handleCitationClick = (docId: string) => {
    setActiveDocId(docId);
  };

  useEffect(() => {
    if (!activeDocId) return;
    let cancelled = false;
    setPreviewLoading(true);
    void (async () => {
      try {
        const data = await apiFetchJson<SourceResp>(`/documents/${activeDocId}/preview_url`);
        if (!cancelled) {
          setPreviewUrl(data.preview_url || data.source_url);
          setPreviewType(data.preview_content_type || "");
          setActiveDocName(data.original_filename);
        }
      } catch (err) {
        console.error("加载预览失败:", err);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeDocId]);

  useEffect(() => {
    const firstId = citations[0]?.doc_id;
    if (firstId && !activeDocId) {
      setActiveDocId(firstId);
    }
  }, [citations, activeDocId]);

  const send = () => {
    if (!input.trim() || !resolvedProjectId || running) return;
    const query = input.trim();
    setInput("");
    void start(query, resolvedProjectId, complex ? 8 : 5, true, complex, activeSessionId);
  };

  const runQuery = useCallback(
    (query: string, sessionId?: string | null) => {
      if (!resolvedProjectId) return;
      void start(query, resolvedProjectId, complex ? 8 : 5, true, complex, sessionId ?? activeSessionId);
    },
    [resolvedProjectId, complex, activeSessionId, start]
  );

  const mapCitationItems = (msg: ChatMessage) =>
    (msg.citations ?? []).map((c, i) => ({
      id: `${msg.id}-${i}`,
      label: `${c.doc_name || "文档"}`,
      href: c.doc_id ? `/knowledge?docId=${c.doc_id}` : "/knowledge",
    }));

  const handleCopyMessage = (content: string) => {
    void navigator.clipboard?.writeText(content);
  };

  const handleFeedback = async (messageId: string, rating: MessageFeedback) => {
    try {
      const updated = await setMessageFeedback(messageId, rating);
      updateMessageLocally(messageId, { feedback: updated.feedback as MessageFeedback });
    } catch (e) {
      console.error("反馈提交失败:", e);
    }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    try {
      const messages = await editChatMessage(messageId, newContent);
      replaceMessages(messages);
      runQuery(newContent, activeSessionId);
    } catch (e) {
      console.error("编辑消息失败:", e);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await deleteChatMessage(messageId);
      await refetchMessages();
    } catch (e) {
      console.error("删除消息失败:", e);
    }
  };

  const handleRegenerateMessage = async (messageId: string) => {
    try {
      const result = await regenerateChatMessage(messageId);
      await refetchMessages();
      runQuery(result.query, result.session_id);
    } catch (e) {
      console.error("重新生成失败:", e);
    }
  };

  const messageActionsDisabled = running;

  const handleSelectSession = (id: string) => {
    clearDisplay();
    setActiveSessionId(id);
    void refetchMessages();
  };

  const handleDeleteSession = (id: string) => {
    void deleteSession(id);
    abortStreamByKey(id);
    if (activeSessionId === id) {
      setActiveSessionId(null);
      clearDisplay();
    }
  };

  const handleNewChat = () => {
    clearDisplay();
    setActiveSessionId(null);
  };

  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <AppPage
      surface="canvas"
      fullWidth
      noPadding
      className="text-foreground"
      innerClassName="flex min-h-0 flex-col space-y-0"
    >
      <PageHeader
        className="border-b border-border bg-white/50 px-4 py-4 backdrop-blur-sm sm:px-6 lg:px-8"
        title="AI 研读室"
        description="基于选定文档进行深度研读与问答"
        breadcrumbs={breadcrumbsFromPathname("/copilot")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SessionShareExportMenu
              sessionId={activeSessionId}
              disabled={
                !activeSessionId ||
                (historyMessages.length === 0 && !answer && !running)
              }
            />
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="gap-2 font-sans transition-all hover:bg-secondary/80">
                  项目: {meta?.name ?? "加载中..."}
                  <ChevronDown size={14} className={cn("opacity-50 transition-transform", dropdownOpen ? "rotate-180" : "")} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="flex items-center justify-between">
                  切换知识库项目
                  <Badge variant="outline" className="text-[10px] font-normal">{projectList.length}</Badge>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <ScrollArea className="h-[300px]">
                  {projectList.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => handleSwitchProject(p.id)}
                      className={cn(
                        "flex flex-col items-start gap-1 py-3 cursor-pointer mx-1 my-0.5 rounded-sm",
                        resolvedProjectId === p.id ? "bg-primary/10 text-primary border-l-2 border-primary" : ""
                      )}
                    >
                      <span className="font-semibold text-sm">{p.name}</span>
                      <span className="text-[10px] text-muted-foreground line-clamp-1">{p.description || "暂无描述"}</span>
                    </DropdownMenuItem>
                  ))}
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="hidden sm:flex items-center gap-2">
              <Badge variant="outline" className="border-border bg-white/50 font-sans h-8 px-3">
                {meta?.phase || "执行阶段"}
              </Badge>
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-accent text-xs font-bold"
                aria-hidden
              >
                {meta?.name?.slice(0, 1).toUpperCase() || "KB"}
              </div>
            </div>
          </div>
        }
      />

      <div className="flex min-h-[min(100dvh,920px)] flex-1 flex-col lg:min-h-[calc(100dvh-12rem)]">
        <ResizablePanelGroup orientation="horizontal" className="min-h-[560px] flex-1">
          <ResizablePanel defaultSize={15} minSize={10} className="border-r border-border bg-muted/10">
            <div className="flex h-full flex-col p-4">
              <Button
                variant="outline"
                className="mb-4 w-full justify-start gap-2 border-dashed"
                onClick={handleNewChat}
              >
                <Plus size={16} />
                开启新对话
              </Button>
              <ScrollArea className="flex-1 -mx-2 px-2">
                <div className="space-y-1">
                  {sessions.length === 0 ? (
                    <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">暂无历史对话</p>
                  ) : (
                    sessions.map((s) => (
                      <div
                        key={s.id}
                        className={cn(
                          "group flex items-center justify-between rounded-sm px-3 py-2 text-xs transition-colors cursor-pointer",
                          activeSessionId === s.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                        )}
                        onClick={() => handleSelectSession(s.id)}
                      >
                        <span className="truncate flex-1 mr-2">{s.title}</span>
                        {isSessionStreaming(s.id) && (
                          <Loader2 size={12} className="mr-1 shrink-0 animate-spin opacity-70" />
                        )}
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSession(s.id);
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="w-1 bg-border" />

          <ResizablePanel defaultSize={35} minSize={25}>
            <div className="flex h-full flex-col bg-background p-4 sm:p-6">
              <div className="mb-4 space-y-3">
                <SearchProgressPanel steps={steps} running={running} />
              </div>

              <ScrollArea className="flex-1 pr-4 font-sans leading-relaxed">
                <div className="space-y-8 pb-4" ref={scrollRef}>
                  {loadingHistory && historyMessages.length === 0 && activeSessionId ? (
                    <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      加载历史消息...
                    </div>
                  ) : null}

                  {historyMessages.map((msg) => (
                    <ChatMessageBubble
                      key={msg.id}
                      message={msg}
                      projectId={resolvedProjectId ?? ""}
                      citationItems={mapCitationItems(msg)}
                      onCitationClick={handleCitationClick}
                      onCopy={handleCopyMessage}
                      onFeedback={handleFeedback}
                      onEdit={handleEditMessage}
                      onDelete={handleDeleteMessage}
                      onRegenerate={handleRegenerateMessage}
                      actionsDisabled={messageActionsDisabled}
                    />
                  ))}

                  {pendingQuery && (
                    <div className="flex flex-row-reverse gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-secondary-foreground">
                        <User size={16} />
                      </div>
                      <div className="max-w-[85%] rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm leading-relaxed shadow-sm">
                        {pendingQuery}
                      </div>
                    </div>
                  )}

                  {(answer || error || (running && !answer)) && (
                    <StreamingMessageBubble
                      answer={answer}
                      error={error}
                      running={running}
                      citationLabels={citationLabels}
                      projectId={resolvedProjectId ?? ""}
                      onCitationClick={handleCitationClick}
                    />
                  )}

                  {!activeSessionId && !running && !pendingQuery && historyMessages.length === 0 && !answer && (
                    <div className="flex flex-col items-center justify-center h-[300px] text-center space-y-4 opacity-40">
                      <BookOpen size={48} className="text-muted-foreground" />
                      <div className="space-y-1">
                        <p className="text-base font-serif italic">准备好开始深度研读了吗？</p>
                        <p className="text-xs">选择项目并在下方输入您的问题，AI 将为您检索并解析文档。</p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="relative mt-6 space-y-3">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={complex}
                    onChange={(e) => setComplex(e.target.checked)}
                    className="accent-primary"
                  />
                  复杂问题（多步 Agent 检索，演示更长链路）
                </label>
                <div className="relative">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder="询问关于项目的问题..."
                    className="h-14 border-input bg-white pr-28 text-base font-sans shadow-sm focus-visible:ring-ring"
                    aria-label="向 AI 提问"
                  />
                  <div className="absolute right-2 top-2 flex gap-1">
                    {running ? (
                      <Button
                        size="icon"
                        type="button"
                        variant="outline"
                        className="h-10 w-10"
                        aria-label="停止生成"
                        onClick={stopCurrentStream}
                      >
                        <Square size={18} className="fill-current" />
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      type="button"
                      className="h-10 w-10 bg-primary transition-transform hover:bg-primary/90 active:scale-95"
                      aria-label="发送"
                      disabled={running}
                      onClick={send}
                    >
                      <Send size={20} />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="w-1 bg-border transition-colors hover:bg-accent" />

          <ResizablePanel defaultSize={55}>
            <div className="flex h-full flex-col bg-muted/20">
              <div className="z-10 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6 shadow-sm">
                <div className="flex items-center gap-3 text-sm font-medium min-w-0">
                  <FileText size={18} className="text-primary/60 shrink-0" />
                  <span className="font-serif text-base italic truncate">
                    {activeDocName || "选择引用文档以查看原文"}
                  </span>
                  {activeDocId && (
                    <Badge variant="secondary" className="text-[10px] font-sans">
                      ID: {activeDocId.slice(0, 8)}...
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {previewLoading && <Loader2 size={16} className="animate-spin text-muted-foreground mr-2" />}
                  <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                    <Link
                      href={withProjectQuery(
                        "/knowledge",
                        resolvedProjectId ?? "",
                        activeDocId ? { docId: activeDocId } : undefined
                      )}
                    >
                      <BookOpen size={16} />
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="flex-1 relative overflow-hidden bg-[#525659] p-4">
                {!activeDocId ? (
                  <div className="flex h-full flex-col items-center justify-center text-white/50 space-y-4">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                      <Search size={32} />
                    </div>
                    <p className="text-sm italic font-serif">提问后点击“引用”可在此处研读原文</p>
                  </div>
                ) : previewUrl && (previewType === "application/pdf" || previewUrl.toLowerCase().includes(".pdf")) ? (
                  <PdfViewer url={previewUrl} className="h-full w-full border-none shadow-2xl" />
                ) : previewUrl ? (
                  <iframe
                    src={previewUrl}
                    className="h-full w-full rounded-md border-none bg-white shadow-2xl"
                    title="文档预览"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-white">正在加载预览内容...</div>
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </AppPage>
  );
}

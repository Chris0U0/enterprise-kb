"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppPage, PageHeader } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BookOpen, Search, Send, FileText, Loader2, Plus, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProject } from "@/hooks/use-project";
import { useProjectList } from "@/hooks/use-project-list";
import { useSearchStream } from "@/hooks/use-search-stream";
import { SearchProgressPanel } from "@/components/copilot/search-progress-panel";
import { CitationList } from "@/components/copilot/citation-list";
import { AnswerActions } from "@/components/copilot/answer-actions";
import { projectPath, withProjectQuery } from "@/lib/project-links";
import { PdfViewer } from "@/components/shared/pdf-viewer";
import { apiFetchJson } from "@/lib/api-client";
import { useChatSessions, useChatMessages, ChatMessage } from "@/hooks/use-chat-sessions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";

// 引入 react-pdf 样式
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
  
  // 选中的项目 ID
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const resolvedProjectId = selectedProjectId || searchParams.get("projectId") || projectList[0]?.id;
  
  const { project: meta } = useProject(resolvedProjectId || undefined);

  // 切换项目处理
  const handleSwitchProject = (id: string) => {
    setSelectedProjectId(id);
    setSessionId(null); // 切换项目时清空当前会话
    router.replace(`/copilot?projectId=${id}`);
  };
  const { sessions, refetch: refetchSessions, deleteSession } = useChatSessions(resolvedProjectId);

  const { steps, running, answer, error, citationLabels, start, sessionId, setSessionId, citations } = useSearchStream();
  const { messages: historyMessages, setMessages: setHistoryMessages, loading: loadingHistory } = useChatMessages(sessionId);

  const [input, setInput] = useState("");
  const [complex, setComplex] = useState(false);

  // 右侧预览状态
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewType, setPreviewType] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activeDocName, setActiveDocName] = useState<string>("");

  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.closest('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [answer, historyMessages, running]);

  // 当回答结束时，更新侧边栏
  useEffect(() => {
    if (!running && answer && sessionId) {
      void refetchSessions();
      // 这里可以考虑手动同步 historyMessages，或者依赖 useChatMessages 的自动加载
    }
  }, [running, answer, sessionId, refetchSessions]);

  // 当点击引用时触发
  const handleCitationClick = (docId: string) => {
    setActiveDocId(docId);
  };

  // 监听 activeDocId 变化，获取预览链接
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
    return () => { cancelled = true; };
  }, [activeDocId]);

  // 当回答中出现新的引用时，自动预览第一个引用
  useEffect(() => {
    if (citations.length > 0 && !activeDocId) {
      setActiveDocId(citations[0].doc_id);
    }
  }, [citations, activeDocId]);

  const send = () => {
    if (!input.trim() || !resolvedProjectId) return;
    void start(input.trim(), resolvedProjectId, complex ? 8 : 5, true);
    setInput("");
  };

  // 开启新对话
  const handleNewChat = () => {
    setSessionId(null);
    setHistoryMessages([]);
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
        title="AI Copilot 研读室"
        description="基于选定文档进行深度研读与问答"
        breadcrumbs={breadcrumbsFromPathname("/copilot")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="gap-2 font-sans transition-all hover:bg-secondary/80">
                  项目: {meta?.name ?? "加载中..."}
                  <ChevronDown size={14} className={cn("opacity-50 transition-transform", dropdownOpen ? "rotate-180" : "")} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="end" 
                className="w-64" 
              >
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
          {/* 会话列表侧边栏 */}
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
                  {sessions.map((s) => (
                    <div 
                      key={s.id}
                      className={cn(
                        "group flex items-center justify-between rounded-sm px-3 py-2 text-xs transition-colors cursor-pointer",
                        sessionId === s.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                      onClick={() => setSessionId(s.id)}
                    >
                      <span className="truncate flex-1 mr-2">{s.title}</span>
                      <button 
                        className="opacity-0 group-hover:opacity-100 hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="w-1 bg-border" />

          {/* 中间：会话与思考区 */}
          <ResizablePanel defaultSize={35} minSize={25}>
            <div className="flex h-full flex-col bg-background p-4 sm:p-6">
              <div className="mb-4 space-y-3">
                <SearchProgressPanel steps={steps} running={running} />
              </div>

              <ScrollArea className="flex-1 pr-4 font-sans leading-relaxed">
                <div className="space-y-8 pb-4" ref={scrollRef}>
                  {/* 渲染历史消息 */}
                  {historyMessages.map((msg, idx) => (
                    <div 
                      key={msg.id || idx} 
                      className={cn(
                        "group relative border border-border p-4 shadow-sm",
                        msg.role === "user" ? "bg-secondary/30 ml-8" : "bg-white mr-8"
                      )}
                    >
                      <div className="prose prose-sm max-w-none">
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">
                          {msg.content}
                        </div>
                      </div>
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-border">
                          <CitationList 
                            items={msg.citations.map((c, i) => ({
                              id: `${msg.id}-${i}`,
                              label: `${c.doc_name || '文档'}`,
                              href: `/knowledge?docId=${c.doc_id}`
                            }))} 
                            projectId={resolvedProjectId ?? ""}
                            onCitationClick={handleCitationClick}
                          />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* 当前正在生成的消息 */}
                  {(answer || error || (running && !answer)) && (
                    <div className="paper-shadow group relative border border-border bg-white p-6 shadow-sm mr-8">
                      <div className="absolute -left-2 top-6 h-8 w-1 bg-primary opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="prose prose-sm max-w-none">
                        {answer ? (
                          <div className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                            {answer}
                          </div>
                        ) : running && !answer ? (
                          <div className="max-w-[80%] rounded-md bg-muted px-4 py-3 text-sm animate-pulse">
                            AI 正在思考并检索相关文档...
                          </div>
                        ) : null}
                        {error ? <p className="text-destructive text-sm font-medium">{error}</p> : null}
                      </div>
                      {citationLabels.length > 0 && (
                        <CitationList 
                          items={citationLabels} 
                          projectId={resolvedProjectId ?? ""} 
                          onCitationClick={handleCitationClick}
                        />
                      )}
                    </div>
                  )}

                  {!sessionId && !running && historyMessages.length === 0 && (
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
                    className="h-14 border-input bg-white pr-24 text-base font-sans shadow-sm focus-visible:ring-ring"
                    aria-label="向 Copilot 提问"
                  />
                  <Button
                    size="icon"
                    type="button"
                    className="absolute right-2 top-2 h-10 w-10 bg-primary transition-transform hover:bg-primary/90 active:scale-95"
                    aria-label="发送"
                    disabled={running}
                    onClick={send}
                  >
                    {running ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                  </Button>
                </div>
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="w-1 bg-border transition-colors hover:bg-accent" />

          {/* 右侧：源文件对比区 */}
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
                    <Link href={withProjectQuery("/knowledge", resolvedProjectId ?? "", activeDocId ?? undefined)}>
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
                  <div className="flex h-full items-center justify-center text-white">
                    正在加载预览内容...
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </AppPage>
  );
}

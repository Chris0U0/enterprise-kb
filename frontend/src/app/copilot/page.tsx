"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppPage, PageHeader } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BookOpen, Search, Send, FileText, Loader2 } from "lucide-react";
import { useProject } from "@/hooks/use-project";
import { useProjectList } from "@/hooks/use-project-list";
import { useSearchStreamMock } from "@/hooks/use-search-stream-mock";
import { SearchProgressPanel } from "@/components/copilot/search-progress-panel";
import { CitationList, type CitationItem } from "@/components/copilot/citation-list";
import { AnswerActions } from "@/components/copilot/answer-actions";
import { projectPath, withProjectQuery } from "@/lib/project-links";

const DEFAULT_SNIPPET =
  "根据需求文档，系统需在上传时计算 MD5 并写入审计日志，以满足审计合规要求。";

export default function CopilotPage() {
  const searchParams = useSearchParams();
  const { items: projectList } = useProjectList();
  const PROJECT_OPTIONS = projectList.map((p) => ({ id: p.id, name: p.name }));
  const resolvedProjectId = searchParams.get("projectId") ?? projectList[0]?.id ?? undefined;
  const { project: meta } = useProject(resolvedProjectId);

  const { steps, running, run } = useSearchStreamMock();
  const [input, setInput] = useState("");
  const [complex, setComplex] = useState(false);

  const citations: CitationItem[] = useMemo(
    () => [
      { id: "1", label: "需求文档V2.pdf · 第4页", href: "/knowledge" },
      { id: "2", label: "安全合规指南.md", href: "/knowledge" },
    ],
    []
  );

  const send = () => {
    if (!input.trim()) return;
    run(complex);
  };

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
                    <Link href={resolvedProjectId ? `/projects/${resolvedProjectId}` : "/projects"} className="inline-flex">
              <Badge variant="secondary" className="font-sans">
                项目: {meta?.name ?? "—"}
              </Badge>
            </Link>
            <Badge variant="outline" className="border-border bg-white/50 font-sans">
              需求文档V2
            </Badge>
            <Badge variant="outline" className="border-border bg-white/50 font-sans">
              架构设计
            </Badge>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-accent text-xs"
              aria-hidden
            >
              JD
            </div>
          </div>
        }
      />

      <div className="flex min-h-[min(100dvh,920px)] flex-1 flex-col lg:min-h-[calc(100dvh-12rem)]">
        <ResizablePanelGroup orientation="horizontal" className="min-h-[560px] flex-1">
          {/* 左侧：会话与思考区 */}
          <ResizablePanel defaultSize={45} minSize={30}>
            <div className="flex h-full flex-col bg-background p-4 sm:p-6">
              <div className="mb-4 space-y-3">
                <SearchProgressPanel steps={steps} running={running} />
                <p className="text-[11px] text-muted-foreground">
                  跨模块跳转携带{" "}
                  <code className="rounded bg-muted px-1">projectId</code>
                  ：{" "}
                  <Link
                    className="text-primary underline-offset-2 hover:underline"
                    href={withProjectQuery("/knowledge", resolvedProjectId ?? "")}
                  >
                    知识库
                  </Link>
                  {" · "}
                  <Link
                    className="text-primary underline-offset-2 hover:underline"
                    href={projectPath(resolvedProjectId ?? "", "artifacts")}
                  >
                    产出物
                  </Link>
                </p>
              </div>

              <ScrollArea className="flex-1 pr-4 font-sans leading-relaxed">
                <div className="space-y-8 pb-4">
                  <div className="paper-shadow group relative border border-border bg-white p-6 shadow-sm">
                    <div className="absolute -left-2 top-6 h-8 w-1 bg-primary opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="prose prose-sm max-w-none">
                      <p className="mb-4">
                        根据您的需求文档，本项目采用了微服务架构。在{" "}
                        <span className="cursor-help font-medium text-blue-800 underline decoration-dotted">
                          [需求文档V2.pdf · 第4页]
                        </span>{" "}
                        中明确提到了对 MD5 校验的要求。
                      </p>
                      <p className="mb-4">
                        为了满足企业审计合规要求，系统需要在文件上传的第一时间计算其哈希值。以下是建议的实现逻辑：
                      </p>
                      <div className="my-4 overflow-x-auto rounded-sm border border-border bg-muted p-4 font-mono text-xs">
                        {`def verify_md5(file_path):
    # 满足企业审计合规要求
    # 1. 读取文件流
    # 2. 计算 MD5 哈希
    # 3. 与数据库记录比对
    return calculate_hash(file_path)`}
                      </div>
                    </div>
                    <CitationList items={citations} projectId={resolvedProjectId ?? ""} />
                    <AnswerActions
                      projectId={resolvedProjectId ?? ""}
                      projects={PROJECT_OPTIONS}
                      defaultSnippet={DEFAULT_SNIPPET}
                    />
                  </div>

                  <div className="flex justify-end">
                    <div className="max-w-[80%] border border-border bg-secondary px-4 py-3 text-sm">
                      请详细解释一下 MD5 校验在审计日志中的体现。
                    </div>
                  </div>
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
            <div className="flex h-full flex-col bg-[#525659]">
              <div className="z-10 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6 shadow-sm">
                <div className="flex items-center gap-3 text-sm font-medium">
                  <FileText size={18} className="text-muted-foreground" />
                  <span className="font-serif text-base italic">需求文档V2.pdf</span>
                  <Badge className="border-green-200 bg-green-100 text-[10px] font-sans text-green-800">
                    MD5 已校验: 8f9e...2a1b
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="在文档中搜索">
                    <Search size={16} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="目录">
                    <BookOpen size={16} />
                  </Button>
                  <div className="mx-2 h-4 w-px self-center bg-border" />
                  <Button variant="outline" size="sm" className="h-8 text-xs font-sans">
                    导出原文
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1">
                <div className="flex min-h-full justify-center p-12">
                  <div className="relative min-h-[1100px] w-full max-w-[850px] border border-black/5 bg-white p-24 shadow-2xl">
                    <div className="absolute left-0 top-0 h-1 w-full bg-primary/10" />

                    <div className="mb-12 border-b-2 border-double border-border pb-8">
                      <h1 className="mb-4 text-4xl font-bold tracking-tight">项目需求说明书</h1>
                      <div className="flex justify-between font-sans text-sm text-muted-foreground">
                        <span>版本: V2.0.4</span>
                        <span>最后更新: 2026-03-12</span>
                      </div>
                    </div>

                    <div className="space-y-8 leading-[1.8] text-[#333]">
                      <section>
                        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                            3
                          </span>
                          系统安全要求
                        </h2>
                        <p>
                          本章节详细描述了系统在数据存储与传输过程中的安全性要求。所有进入生产环境的文档必须经过严格的校验流程。
                        </p>
                      </section>

                      <section className="relative">
                        <div className="pointer-events-none absolute -left-8 -right-8 bottom-0 top-0 border-l-4 border-yellow-500 bg-yellow-100/40" />

                        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                            4
                          </span>
                          MD5 校验逻辑
                        </h2>
                        <p className="mb-4">
                          为了确保文档的完整性（Integrity）和不可篡改性（Non-repudiation），系统必须实现基于 MD5 算法的哈希校验机制。
                        </p>
                        <ul className="list-disc space-y-2 pl-6 font-sans text-sm">
                          <li>上传时自动触发哈希计算。</li>
                          <li>哈希值需存入不可变审计日志表。</li>
                          <li>每次读取前需重新计算并比对。</li>
                        </ul>
                      </section>

                      <section>
                        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                            5
                          </span>
                          审计合规性
                        </h2>
                        <p>
                          根据《企业数据安全管理办法》，所有操作日志必须包含文件哈希指纹，以备外部审计机关核查。
                        </p>
                      </section>
                    </div>

                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 font-sans text-xs text-muted-foreground">
                      第 4 页 / 共 24 页
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </AppPage>
  );
}

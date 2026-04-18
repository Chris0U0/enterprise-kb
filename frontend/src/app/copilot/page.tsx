"use client";

import { cn } from "@/lib/utils";
import React from 'react';
import { AppPage, PageHeader } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BookOpen, Search, Send, FileText, ChevronRight, Loader2 } from "lucide-react";

export default function CopilotPage() {
  // Mock 数据
  const traces = [
    { id: 1, action: "正在检索全局知识库...", status: "completed" },
    { id: 2, action: "提取《需求文档V2.pdf》第3-5页内容...", status: "in_progress" },
  ];

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
            <Badge variant="secondary" className="font-sans">
              项目: 智能排班系统
            </Badge>
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
      <ResizablePanelGroup direction="horizontal" className="min-h-[560px] flex-1">
        
        {/* 左侧：会话与思考区 */}
        <ResizablePanel defaultSize={45} minSize={30}>
          <div className="flex h-full flex-col bg-background p-4 sm:p-6">

            {/* 思考轨迹 (Traces) */}
            <div className="mb-6 bg-muted/50 border border-border p-4 rounded-sm font-sans shadow-sm">
              <div className="flex items-center gap-2 mb-3 text-muted-foreground text-sm font-medium">
                <Loader2 size={14} className="animate-spin" />
                <span>Agent 思考轨迹</span>
              </div>
              <div className="space-y-2">
                {traces.map(t => (
                  <div key={t.id} className="flex items-center gap-2 text-xs">
                    <ChevronRight size={12} className={t.status === 'in_progress' ? 'text-primary' : 'text-muted-foreground'} />
                    <span className={cn(
                      t.status === 'completed' ? 'line-through opacity-50' : 'font-medium',
                      "text-foreground/80"
                    )}>
                      {t.action}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 聊天内容区 */}
            <ScrollArea className="flex-1 pr-4 font-sans leading-relaxed">
              <div className="space-y-8 pb-4">
                {/* AI 消息示例 */}
                <div className="bg-white p-6 border border-border shadow-sm paper-shadow relative group">
                  <div className="absolute -left-2 top-6 w-1 h-8 bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="prose prose-sm max-w-none">
                    <p className="mb-4">根据您的需求文档，本项目采用了微服务架构。在 <span className="underline decoration-dotted cursor-help text-blue-800 font-medium">[需求文档V2.pdf · 第4页]</span> 中明确提到了对 MD5 校验的要求。</p>
                    <p className="mb-4">为了满足企业审计合规要求，系统需要在文件上传的第一时间计算其哈希值。以下是建议的实现逻辑：</p>
                    <div className="bg-muted p-4 rounded-sm border border-border my-4 font-mono text-xs overflow-x-auto">
                      {`def verify_md5(file_path):
    # 满足企业审计合规要求
    # 1. 读取文件流
    # 2. 计算 MD5 哈希
    # 3. 与数据库记录比对
    return calculate_hash(file_path)`}
                    </div>
                    <p className="text-xs text-muted-foreground mt-4 italic">引用来源: 《需求文档V2.pdf》, 《安全合规指南.md》</p>
                  </div>
                </div>

                {/* 用户消息示例 */}
                <div className="flex justify-end">
                  <div className="bg-secondary px-4 py-3 border border-border max-w-[80%] text-sm">
                    请详细解释一下 MD5 校验在审计日志中的体现。
                  </div>
                </div>
              </div>
            </ScrollArea>

            {/* 输入框 */}
            <div className="relative mt-6">
              <Input 
                placeholder="询问关于项目的问题..." 
                className="h-14 border-input bg-white pr-14 text-base font-sans shadow-sm focus-visible:ring-ring"
                aria-label="向 Copilot 提问"
              />
              <Button size="icon" className="absolute right-2 top-2 h-10 w-10 bg-primary hover:bg-primary/90 transition-transform active:scale-95" aria-label="发送">
                <Send size={20} />
              </Button>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="w-1 bg-border hover:bg-accent transition-colors" />

        {/* 右侧：源文件对比区 */}
        <ResizablePanel defaultSize={55}>
          <div className="h-full flex flex-col bg-[#525659]">
            <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-background z-10 shadow-sm">
              <div className="flex items-center gap-3 text-sm font-medium">
                <FileText size={18} className="text-muted-foreground" />
                <span className="font-serif italic text-base">需求文档V2.pdf</span>
                <Badge className="bg-green-100 text-green-800 border-green-200 text-[10px] font-sans">MD5 已校验: 8f9e...2a1b</Badge>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="在文档中搜索"><Search size={16} /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="目录"><BookOpen size={16} /></Button>
                <div className="w-px h-4 bg-border mx-2 self-center" />
                <Button variant="outline" size="sm" className="h-8 text-xs font-sans">导出原文</Button>
              </div>
            </div>
            
            <ScrollArea className="flex-1">
              <div className="p-12 flex justify-center min-h-full">
                {/* 模拟 PDF 页面 */}
                <div className="w-full max-w-[850px] bg-white shadow-2xl p-24 relative min-h-[1100px] border border-black/5">
                  <div className="absolute top-0 left-0 w-full h-1 bg-primary/10" />
                  
                  <div className="mb-12 border-b-2 border-double border-border pb-8">
                    <h1 className="text-4xl font-bold mb-4 tracking-tight">项目需求说明书</h1>
                    <div className="flex justify-between text-sm text-muted-foreground font-sans">
                      <span>版本: V2.0.4</span>
                      <span>最后更新: 2026-03-12</span>
                    </div>
                  </div>

                  <div className="space-y-8 text-[#333] leading-[1.8]">
                    <section>
                      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs">3</span>
                        系统安全要求
                      </h2>
                      <p>
                        本章节详细描述了系统在数据存储与传输过程中的安全性要求。所有进入生产环境的文档必须经过严格的校验流程。
                      </p>
                    </section>

                    <section className="relative">
                      {/* 高亮区域 */}
                      <div className="absolute -left-8 -right-8 top-0 bottom-0 bg-yellow-100/40 border-l-4 border-yellow-500 pointer-events-none" />
                      
                      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs">4</span>
                        MD5 校验逻辑
                      </h2>
                      <p className="mb-4">
                        为了确保文档的完整性（Integrity）和不可篡改性（Non-repudiation），系统必须实现基于 MD5 算法的哈希校验机制。
                      </p>
                      <ul className="list-disc pl-6 space-y-2 font-sans text-sm">
                        <li>上传时自动触发哈希计算。</li>
                        <li>哈希值需存入不可变审计日志表。</li>
                        <li>每次读取前需重新计算并比对。</li>
                      </ul>
                    </section>

                    <section>
                      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs">5</span>
                        审计合规性
                      </h2>
                      <p>
                        根据《企业数据安全管理办法》，所有操作日志必须包含文件哈希指纹，以备外部审计机关核查。
                      </p>
                    </section>
                  </div>

                  {/* 页码 */}
                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-xs text-muted-foreground font-sans">
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

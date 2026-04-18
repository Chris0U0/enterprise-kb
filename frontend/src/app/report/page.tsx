"use client";

import { cn } from "@/lib/utils";
import React, { useState } from 'react';
import { AppPage, PageHeader } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  FileText, 
  Sparkles, 
  Download, 
  ChevronRight, 
  History, 
  Printer, 
  Share2,
  FileDown,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw
} from "lucide-react";

export default function ReportBuilderPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportType, setReportType] = useState<string | null>(null);

  const handleGenerate = (type: string) => {
    setReportType(type);
    setIsGenerating(true);
    setTimeout(() => setIsGenerating(false), 3000);
  };

  const reportTemplates = [
    { id: 'review', title: "阶段复盘报告", icon: <RotateCcw size={18} />, desc: "对当前里程碑的进度、成果与偏差进行深度总结。" },
    { id: 'weekly', title: "周报自动生成", icon: <Clock size={18} />, desc: "聚合本周所有提交、文档变更与 Agent 思考摘要。" },
    { id: 'risk', title: "风险评估报告", icon: <AlertTriangle size={18} />, desc: "识别潜在的业务逻辑冲突与合规性隐患。" },
  ];

  return (
    <AppPage surface="canvas">
      <PageHeader
        title="报告生成与导出"
        description="利用 ReportGenerationSkill 一键生成多维度项目分析报告。"
        breadcrumbs={breadcrumbsFromPathname("/report")}
        actions={
          <Button variant="outline" className="gap-2">
            <History size={16} />
            历史记录
          </Button>
        }
      />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          
          {/* 左侧：模板选择 */}
          <div className="lg:col-span-1 space-y-4">
            <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">选择报告模板</div>
            {reportTemplates.map(template => (
              <Card 
                key={template.id} 
                className={cn(
                  "paper-border hover:shadow-md transition-all cursor-pointer group",
                  reportType === template.id ? "border-primary bg-primary/5 shadow-sm" : ""
                )}
                onClick={() => setReportType(template.id)}
              >
                <CardHeader className="p-4 space-y-2">
                  <div className={cn(
                    "w-10 h-10 rounded-sm flex items-center justify-center transition-colors",
                    reportType === template.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground"
                  )}>
                    {template.icon}
                  </div>
                  <CardTitle className="text-base font-serif italic">{template.title}</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">{template.desc}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

          {/* 右侧：编辑器与预览区 */}
          <div className="lg:col-span-3 space-y-6">
            <Card className="paper-border min-h-[700px] flex flex-col relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-primary/10" />
              
              {/* 工具栏 */}
              <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex items-center gap-2">
                   {reportType ? (
                     <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-serif italic">
                       {reportTemplates.find(t => t.id === reportType)?.title}
                     </Badge>
                   ) : (
                     <span className="text-sm text-muted-foreground italic">未选择模板</span>
                   )}
                   {isGenerating && (
                     <div className="flex items-center gap-2 text-xs text-primary font-sans">
                        <Sparkles size={14} className="animate-pulse" />
                        <span>AI 正在分析并生成内容...</span>
                     </div>
                   )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8"><Printer size={16} /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8"><Share2 size={16} /></Button>
                  <div className="w-px h-4 bg-border mx-2 self-center" />
                  <Button size="sm" className="h-8 gap-2 px-4" disabled={!reportType || isGenerating}>
                    <FileDown size={16} />
                    导出为 Word / PDF
                  </Button>
                </div>
              </div>

              {/* 内容区 */}
              <ScrollArea className="flex-1">
                <div className="p-16 max-w-[800px] mx-auto space-y-12 bg-white min-h-[600px] paper-shadow border-x border-black/5 mt-8 mb-8">
                  {!reportType ? (
                    <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-6 opacity-30 grayscale">
                      <FileText size={64} />
                      <div className="space-y-2">
                        <p className="text-xl font-serif italic font-bold">准备开始您的项目报告</p>
                        <p className="text-sm">请从左侧选择一个模板，并点击下方生成按钮。</p>
                      </div>
                      <Button onClick={() => handleGenerate('weekly')} className="gap-2 bg-primary">
                        <Sparkles size={16} /> 一键生成示例报告
                      </Button>
                    </div>
                  ) : isGenerating ? (
                    <div className="space-y-8 animate-pulse">
                      <div className="h-10 w-3/4 bg-muted rounded-sm" />
                      <div className="h-4 w-full bg-muted rounded-sm" />
                      <div className="h-4 w-full bg-muted rounded-sm" />
                      <div className="h-4 w-5/6 bg-muted rounded-sm" />
                      <div className="grid grid-cols-2 gap-4 pt-8">
                        <div className="h-32 bg-muted rounded-sm" />
                        <div className="h-32 bg-muted rounded-sm" />
                      </div>
                    </div>
                  ) : (
                    <div className="prose prose-sm max-w-none font-serif leading-loose">
                      <div className="border-b-2 border-double border-border pb-8 mb-12 text-center">
                        <h1 className="text-4xl font-bold tracking-tight mb-4">
                          {reportTemplates.find(t => t.id === reportType)?.title}
                        </h1>
                        <p className="font-sans text-xs text-muted-foreground uppercase tracking-widest">
                          生成日期: 2026-04-16 · 项目: 智能排班系统 · 状态: 草稿
                        </p>
                      </div>

                      <section className="space-y-4">
                        <h2 className="text-2xl font-bold italic border-l-4 border-primary pl-4 mb-6">1. 核心进展概述</h2>
                        <p>
                          根据本周对全局知识库和 14 次文档更新的分析，项目整体处于<strong>健康状态</strong>。
                          重点完成了 MD5 防篡改校验模块的开发，并同步更新了《架构设计说明书》第 4 章。
                        </p>
                        <div className="bg-muted/50 p-6 border border-border rounded-sm font-sans text-sm">
                           <ul className="list-disc pl-6 space-y-2">
                             <li>实现文件上传时的异步 MD5 哈希计算 (Completed)</li>
                             <li>集成 RAGAS 自动评估流水线 (In Progress)</li>
                             <li>完成 5 份核心合规文档的向量化索引 (Completed)</li>
                           </ul>
                        </div>
                      </section>

                      <section className="space-y-4 pt-8">
                        <h2 className="text-2xl font-bold italic border-l-4 border-primary pl-4 mb-6">2. 潜在风险评估</h2>
                        <p>
                          ReportGenerationSkill 识别出 2 个中级风险节点：
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans pt-4">
                          <Card className="paper-border border-yellow-200 bg-yellow-50 p-4">
                            <div className="flex items-center gap-2 text-yellow-800 font-bold mb-2">
                              <AlertTriangle size={14} />
                              <span className="text-xs uppercase tracking-wider">合规性风险</span>
                            </div>
                            <p className="text-xs text-yellow-900 leading-relaxed">
                              部分老旧文档（2025年以前）缺少 MD5 签名，可能无法通过自动化审计。
                            </p>
                          </Card>
                          <Card className="paper-border border-blue-200 bg-blue-50 p-4">
                            <div className="flex items-center gap-2 text-blue-800 font-bold mb-2">
                              <CheckCircle2 size={14} />
                              <span className="text-xs uppercase tracking-wider">进度建议</span>
                            </div>
                            <p className="text-xs text-blue-900 leading-relaxed">
                              建议下周重点推进 API 接口文档的补全，以减少前端联调成本。
                            </p>
                          </Card>
                        </div>
                      </section>

                      <div className="pt-24 text-center text-[10px] text-muted-foreground uppercase tracking-tighter">
                        本报告由 Enterprise KB AI 自动生成 · 经受权查看 · 机密文件
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* 底部操作区 */}
              {reportType && !isGenerating && (
                <div className="p-4 border-t border-border flex justify-between items-center bg-muted/30">
                  <p className="text-xs text-muted-foreground font-serif italic">
                    报告生成完成。您可以直接进行富文本二次编辑，更改后点击导出。
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleGenerate(reportType)}>
                      重新生成
                    </Button>
                    <Button size="sm" className="bg-primary shadow-sm font-bold">
                      确认并归档
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
    </AppPage>
  );
}

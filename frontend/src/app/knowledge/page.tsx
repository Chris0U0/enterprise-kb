"use client";

import { cn } from "@/lib/utils";
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { 
  FileText, 
  Upload, 
  Search, 
  ChevronRight, 
  ListTree, 
  MoreVertical,
  CheckCircle2,
  Clock,
  Loader2,
  Filter,
  Grid,
  List
} from "lucide-react";

export default function KnowledgeBasePage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeDoc, setActiveDoc] = useState<number | null>(null);

  // Mock 文档处理状态数据
  const [documents, setDocuments] = useState([
    { id: 1, name: "需求文档V2.pdf", size: "4.2 MB", status: "completed", progress: 100, updated: "2026-04-12" },
    { id: 2, name: "架构设计说明书.docx", size: "1.8 MB", status: "processing", progress: 65, updated: "2026-04-15" },
    { id: 3, name: "API接口定义.md", size: "124 KB", status: "pending", progress: 0, updated: "2026-04-16" },
    { id: 4, name: "安全合规指南.pdf", size: "2.1 MB", status: "completed", progress: 100, updated: "2026-03-20" },
  ]);

  // 模拟轮询状态更新
  useEffect(() => {
    const timer = setInterval(() => {
      setDocuments(docs => docs.map(doc => {
        if (doc.status === 'processing') {
          const nextProgress = doc.progress + 5;
          return {
            ...doc,
            progress: nextProgress >= 100 ? 100 : nextProgress,
            status: nextProgress >= 100 ? 'completed' : 'processing'
          };
        }
        if (doc.status === 'pending') {
          return { ...doc, status: 'processing', progress: 5 };
        }
        return doc;
      }));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* 顶部标题与操作栏 */}
        <div className="flex justify-between items-end border-b border-border pb-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold italic tracking-tight font-serif">知识库管理</h1>
            <p className="text-muted-foreground">上传多模态文件，AI 正在为您自动解析结构并提取特征。</p>
          </div>
          <div className="flex gap-4">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input placeholder="搜索文档内容..." className="pl-10 h-10 border-border bg-white" />
            </div>
            <Button className="gap-2 bg-primary">
              <Upload size={18} />
              上传文件
            </Button>
          </div>
        </div>

        <div className="flex gap-8">
          
          {/* 左侧：文档列表 */}
          <div className="flex-1 space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <Button 
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => setViewMode('grid')}
                >
                  <Grid size={16} />
                </Button>
                <Button 
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => setViewMode('list')}
                >
                  <List size={16} />
                </Button>
                <div className="h-4 w-px bg-border mx-2" />
                <Button variant="ghost" size="sm" className="gap-1 text-xs">
                  <Filter size={14} /> 筛选
                </Button>
              </div>
              <p className="text-xs text-muted-foreground font-serif italic">共 24 篇文档 · 占用 156.4 MB</p>
            </div>

            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {documents.map(doc => (
                  <Card 
                    key={doc.id} 
                    className={cn(
                      "paper-border hover:shadow-md transition-all cursor-pointer",
                      activeDoc === doc.id ? "ring-2 ring-primary border-transparent" : ""
                    )}
                    onClick={() => setActiveDoc(doc.id)}
                  >
                    <CardHeader className="p-5 pb-2">
                      <div className="flex justify-between items-start">
                        <FileText size={32} className="text-primary/60" />
                        <StatusIndicator status={doc.status} />
                      </div>
                      <CardTitle className="text-lg font-serif italic mt-4 truncate">{doc.name}</CardTitle>
                      <CardDescription className="flex justify-between text-[10px] uppercase font-bold tracking-widest pt-2">
                        <span>{doc.size}</span>
                        <span>{doc.updated}</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-5 pt-4">
                      {doc.status !== 'completed' && (
                        <div className="space-y-2 mb-4">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span>正在处理...</span>
                            <span>{doc.progress}%</span>
                          </div>
                          <Progress value={doc.progress} className="h-1 bg-muted" />
                        </div>
                      )}
                      <div className="flex justify-end gap-2 pt-2 border-t border-border mt-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8"><ChevronRight size={14} /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical size={14} /></Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="paper-border">
                <CardContent className="p-0">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-muted text-muted-foreground uppercase text-[10px] font-bold tracking-widest border-b border-border">
                      <tr>
                        <th className="px-6 py-4 font-bold">文件名</th>
                        <th className="px-6 py-4 font-bold">状态</th>
                        <th className="px-6 py-4 font-bold">大小</th>
                        <th className="px-6 py-4 font-bold">最后修改</th>
                        <th className="px-6 py-4 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {documents.map(doc => (
                        <tr 
                          key={doc.id} 
                          className={cn(
                            "hover:bg-muted/30 cursor-pointer transition-colors",
                            activeDoc === doc.id ? "bg-muted/50" : ""
                          )}
                          onClick={() => setActiveDoc(doc.id)}
                        >
                          <td className="px-6 py-4 flex items-center gap-3">
                            <FileText size={16} className="text-muted-foreground" />
                            <span className="font-serif italic font-medium">{doc.name}</span>
                          </td>
                          <td className="px-6 py-4">
                             <StatusIndicator status={doc.status} inline />
                          </td>
                          <td className="px-6 py-4 text-muted-foreground">{doc.size}</td>
                          <td className="px-6 py-4 text-muted-foreground">{doc.updated}</td>
                          <td className="px-6 py-4 text-right">
                             <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical size={16} /></Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>

          {/* 右侧：文档结构预览树 (Drawer Simulation) */}
          <div className="w-80 shrink-0">
            <div className="sticky top-8 space-y-6">
              <Card className="paper-border border-primary/20 bg-primary/5 min-h-[500px]">
                <CardHeader>
                  <CardTitle className="text-lg font-serif italic flex items-center gap-2">
                    <ListTree size={18} className="text-primary" />
                    文档结构预览
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {activeDoc ? `解析自: ${documents.find(d => d.id === activeDoc)?.name}` : "请从左侧选择一个文档"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {activeDoc ? (
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-1 font-sans text-sm">
                        <OutlineItem level={0} label="1. 项目背景" />
                        <OutlineItem level={1} label="1.1 系统目标" />
                        <OutlineItem level={1} label="1.2 适用范围" />
                        <OutlineItem level={0} label="2. 技术架构" />
                        <OutlineItem level={1} label="2.1 后端服务" active />
                        <OutlineItem level={2} label="2.1.1 Celery 异步队列" />
                        <OutlineItem level={2} label="2.1.2 Redis 缓存" />
                        <OutlineItem level={1} label="2.2 前端展现" />
                        <OutlineItem level={0} label="3. 安全合规" />
                        <OutlineItem level={1} label="3.1 MD5 防篡改" />
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground opacity-50 space-y-4">
                      <FileText size={48} />
                      <p className="text-sm italic font-serif">选择文档后自动调用 mcp/get_outline</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 拖拽上传区域提示 */}
              <div className="border-2 border-dashed border-border rounded-sm p-8 flex flex-col items-center justify-center text-center space-y-4 hover:border-primary/50 transition-colors group cursor-pointer bg-white">
                <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Upload size={20} className="text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-bold italic font-serif">点击或拖拽文件上传</p>
                  <p className="text-[10px] text-muted-foreground uppercase mt-1 tracking-wider font-sans">
                    支持 PDF, Word, Markdown, Excel, PPT (Max 100MB)
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function StatusIndicator({ status, inline = false }: { status: string, inline?: boolean }) {
  const configs = {
    completed: { color: "text-green-600 bg-green-50 border-green-200", icon: <CheckCircle2 size={12} />, label: "已完成" },
    processing: { color: "text-blue-600 bg-blue-50 border-blue-200", icon: <Loader2 size={12} className="animate-spin" />, label: "正在解析" },
    pending: { color: "text-muted-foreground bg-muted border-border", icon: <Clock size={12} />, label: "排队中" },
  };
  const config = configs[status as keyof typeof configs];

  if (inline) {
    return (
      <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold", config.color)}>
        {config.icon}
        {config.label}
      </div>
    );
  }

  return (
    <Badge variant="outline" className={cn("text-[10px] font-bold border-none", config.color)}>
      {config.label}
    </Badge>
  );
}

function OutlineItem({ level, label, active = false }: { level: number, label: string, active?: boolean }) {
  return (
    <div 
      className={cn(
        "flex items-center gap-2 py-1.5 px-3 rounded-sm cursor-pointer transition-colors",
        level === 0 ? "font-bold text-foreground" : "text-muted-foreground hover:text-foreground",
        active ? "bg-primary text-primary-foreground font-bold shadow-sm" : "hover:bg-muted/50"
      )}
      style={{ paddingLeft: `${(level + 1) * 12}px` }}
    >
      {level > 0 && <div className="w-1 h-1 rounded-full bg-current opacity-30" />}
      <span className="truncate">{label}</span>
      {active && <ChevronRight size={12} className="ml-auto" />}
    </div>
  );
}

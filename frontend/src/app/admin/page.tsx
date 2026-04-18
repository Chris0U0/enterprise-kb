"use client";

import { cn } from "@/lib/utils";
import React from 'react';
import Link from 'next/link';
import { AppPage, PageHeader } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Settings, 
  ShieldCheck, 
  History, 
  BarChart3, 
  Users, 
  Key, 
  Search, 
  FileSearch, 
  Activity,
  AlertTriangle,
  ChevronRight,
  Database,
  ArrowUpRight,
  Zap,
  Lock,
  Terminal,
  ArrowRight
} from "lucide-react";

export default function AdminConsolePage() {
  const auditLogs = [
    { id: 1, user: "admin@example.com", action: "文档上传", resource: "需求文档V2.pdf", status: "success", time: "2026-04-16 14:30:22", ip: "192.168.1.1" },
    { id: 2, user: "editor@example.com", action: "生成报告", resource: "周报-第15周", status: "success", time: "2026-04-16 14:15:10", ip: "10.0.0.45" },
    { id: 3, user: "viewer@example.com", action: "查询图谱", resource: "Entity: MD5", status: "warning", time: "2026-04-16 14:02:45", ip: "172.16.2.12" },
    { id: 4, user: "system", action: "RAGAS 评估", resource: "Batch #412", status: "success", time: "2026-04-16 13:45:00", ip: "localhost" },
  ];

  const ragasMetrics = [
    { name: "Faithfulness (忠实度)", value: 0.92, status: "excellent" },
    { name: "Answer Relevancy (答案相关性)", value: 0.88, status: "good" },
    { name: "Context Recall (上下文召回率)", value: 0.74, status: "average" },
  ];

  return (
    <AppPage surface="canvas">
      <PageHeader
        title="系统设置与审计"
        description="管理员控制台：监控系统健康度、评估 AI 质量并追踪审计流水。"
        breadcrumbs={breadcrumbsFromPathname("/admin")}
        actions={
          <Badge
            variant="outline"
            className="border-primary/20 bg-primary/5 py-1 font-serif text-sm italic text-primary"
          >
            Admin Privilege Enabled
          </Badge>
        }
      />

        <Tabs defaultValue="audit" className="w-full">
          <TabsList className="bg-transparent border-b border-border w-full justify-start rounded-none h-auto p-0 gap-10">
            <TabsTrigger value="audit" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3 font-serif italic text-lg px-0 flex gap-2 items-center">
              <FileSearch size={18} /> 审计追踪
            </TabsTrigger>
            <TabsTrigger value="ragas" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3 font-serif italic text-lg px-0 flex gap-2 items-center">
              <BarChart3 size={18} /> RAGAS 评估大盘
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3 font-serif italic text-lg px-0 flex gap-2 items-center">
              <Settings size={18} /> 全局配置
            </TabsTrigger>
          </TabsList>

          {/* 1. 审计追踪查询 */}
          <TabsContent value="audit" className="mt-8 space-y-6">
            <Card className="paper-border">
              <CardHeader className="pb-0">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <CardTitle className="text-base font-serif italic">审计流水 (audit_logs)</CardTitle>
                    <CardDescription>记录全量用户操作，支持 MD5 哈希校验追溯。</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-9 gap-2"><Search size={14} /> 搜索</Button>
                    <Button variant="outline" size="sm" className="h-9">导出 CSV</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold tracking-widest border-y border-border">
                    <tr>
                      <th className="px-6 py-4">操作员</th>
                      <th className="px-6 py-4">动作 / 资源</th>
                      <th className="px-6 py-4">状态</th>
                      <th className="px-6 py-4">时间</th>
                      <th className="px-6 py-4">IP 地址</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-sans">
                    {auditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4 font-medium">{log.user}</td>
                        <td className="px-6 py-4 flex flex-col gap-0.5">
                           <span className="font-bold text-xs">{log.action}</span>
                           <span className="text-[10px] text-muted-foreground italic font-serif truncate w-40">{log.resource}</span>
                        </td>
                        <td className="px-6 py-4">
                           <Badge variant={log.status === 'success' ? 'secondary' : 'outline'} className={cn(
                             "text-[9px] font-bold px-1.5 h-4 border-none",
                             log.status === 'success' ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                           )}>
                             {log.status.toUpperCase()}
                           </Badge>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground text-[10px] font-bold uppercase tracking-tighter">{log.time}</td>
                        <td className="px-6 py-4 text-muted-foreground font-mono text-xs opacity-60">{log.ip}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 2. RAGAS 评估大盘 */}
          <TabsContent value="ragas" className="mt-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {ragasMetrics.map(metric => (
                <Card key={metric.name} className="paper-border">
                   <CardHeader className="p-6 pb-2">
                      <div className="flex justify-between items-start mb-4">
                        <Badge variant="outline" className={cn(
                          "text-[9px] font-bold uppercase border-none",
                          metric.status === 'excellent' ? "bg-green-100 text-green-700" : 
                          metric.status === 'good' ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"
                        )}>
                          {metric.status}
                        </Badge>
                        <Zap size={16} className="text-primary/20" />
                      </div>
                      <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold font-sans">{metric.name}</p>
                   </CardHeader>
                   <CardContent className="p-6 pt-0">
                      <div className="flex items-baseline gap-2 mb-4">
                        <span className="text-4xl font-bold font-serif italic tracking-tighter">{(metric.value * 100).toFixed(0)}</span>
                        <span className="text-sm font-bold opacity-30">%</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full transition-all duration-700",
                            metric.status === 'excellent' ? "bg-green-500" : 
                            metric.status === 'good' ? "bg-blue-500" : "bg-yellow-500"
                          )}
                          style={{ width: `${metric.value * 100}%` }}
                        />
                      </div>
                   </CardContent>
                </Card>
              ))}
            </div>

            <Card className="paper-border h-[400px] flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4 bg-muted/20">
                <div className="space-y-1">
                  <CardTitle className="text-base font-serif italic">评估质量趋势图 (Evaluation Timeline)</CardTitle>
                  <CardDescription>近 30 天 AI 回答质量的波动变化。</CardDescription>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-tighter opacity-60">
                  <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /> Faithfulness</span>
                  <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Relevancy</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col items-center justify-center space-y-4 opacity-30 grayscale">
                <Activity size={48} className="animate-pulse" />
                <p className="text-sm italic font-serif">趋势图表集成中 (建议集成 Chart.js / Recharts)</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 3. 全局配置 */}
          <TabsContent value="settings" className="mt-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <AdminLinkCard 
                title="页面 A：入库审批" 
                desc="核心文档人工核验流水" 
                href="/admin/approval" 
                icon={<ShieldCheck size={24} />} 
              />
              <AdminLinkCard 
                title="页面 B：指令编排" 
                desc="Agent 提示词与工具管理" 
                href="/admin/agent" 
                icon={<Terminal size={24} />} 
              />
              <AdminLinkCard 
                title="页面 C：资源配额" 
                desc="部门存储与 Token 计费" 
                href="/admin/resource" 
                icon={<Database size={24} />} 
              />
              <AdminLinkCard 
                title="页面 D：合规脱敏" 
                desc="PII 识别与异常行为审计" 
                href="/admin/security" 
                icon={<Lock size={24} />} 
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
              <Card className="paper-border">
                <CardHeader>
                  <CardTitle className="text-base font-serif italic">安全与合规配置</CardTitle>
                  <CardDescription>配置审计日志保留期限与不可变哈希策略。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* ... (existing content) */}
                </CardContent>
              </Card>
              {/* ... (existing content) */}
            </div>
          </TabsContent>

        </Tabs>
    </AppPage>
  );
}

function AdminLinkCard({ title, desc, href, icon }: { title: string, desc: string, href: string, icon: React.ReactNode }) {
  return (
    <Link href={href}>
      <Card className="paper-border hover:border-primary/40 hover:shadow-md transition-all cursor-pointer h-full group">
        <CardHeader className="p-6">
          <div className="w-12 h-12 bg-primary/5 rounded-sm flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform">
            {icon}
          </div>
          <CardTitle className="text-base font-serif italic mb-2">{title}</CardTitle>
          <CardDescription className="text-xs leading-relaxed">{desc}</CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-0 flex justify-end">
           <ArrowUpRight size={16} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </CardContent>
      </Card>
    </Link>
  );
}

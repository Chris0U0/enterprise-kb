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
  Database,
  ArrowUpRight,
  Zap,
  Lock,
  Terminal,
  RefreshCcw,
  CheckCircle2,
  Clock
} from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────────
// 演示专用：高质量硬编码数据 (Demo Only)
// ──────────────────────────────────────────────────────────────────────────────

const DEMO_AUDIT_LOGS = [
  { id: "1", user: "admin@enterprise.ai", action: "文档上传", resource: "2024Q3财报分析.pdf", status: "success", time: "2026-04-22 14:30", ip: "192.168.1.102" },
  { id: "2", user: "system", action: "RAGAS 评估", resource: "Batch #1029 (Daily)", status: "success", time: "2026-04-22 12:00", ip: "internal" },
  { id: "3", user: "zhang-san@dev", action: "API Key 创建", resource: "Production-Key-01", status: "success", time: "2026-04-22 11:15", ip: "10.0.4.22" },
  { id: "4", user: "li-si@hr", action: "问答检索", resource: "“公司带薪年假政策”", status: "success", time: "2026-04-22 10:45", ip: "172.16.8.9" },
  { id: "5", user: "system", action: "图谱抽取", resource: "Doc: 员工手册.md", status: "success", time: "2026-04-22 09:30", ip: "internal" },
  { id: "6", user: "admin@enterprise.ai", action: "配置变更", resource: "GRAPHRAG_ENABLED -> true", status: "success", time: "2026-04-21 18:20", ip: "192.168.1.102" },
  { id: "7", user: "wang-wu@mkt", action: "问答检索", resource: "“竞品分析报告对比”", status: "warning", time: "2026-04-21 16:40", ip: "192.168.1.55" },
];

const DEMO_EVAL_RUNS = [
  { id: "run_8f2a1b", size: 50, faith: 0.942, rel: 0.885, recall: 0.821, time: "04-22 12:00" },
  { id: "run_7c3d9e", size: 45, faith: 0.915, rel: 0.872, recall: 0.795, time: "04-21 12:00" },
  { id: "run_6b2f4a", size: 50, faith: 0.882, rel: 0.854, recall: 0.812, time: "04-20 12:00" },
  { id: "run_5a1e3d", size: 48, faith: 0.895, rel: 0.841, recall: 0.788, time: "04-19 12:00" },
  { id: "run_4d9c2b", size: 50, faith: 0.921, rel: 0.892, recall: 0.834, time: "04-18 12:00" },
  { id: "run_3b8f1a", size: 42, faith: 0.864, rel: 0.822, recall: 0.756, time: "04-17 12:00" },
  { id: "run_2e7d0c", size: 50, faith: 0.875, rel: 0.835, recall: 0.772, time: "04-16 12:00" },
];

// ──────────────────────────────────────────────────────────────────────────────

export default function AdminConsolePage() {
  const latest = DEMO_EVAL_RUNS[0];

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

      <Tabs defaultValue="ragas" className="w-full">
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
                  {DEMO_AUDIT_LOGS.map(log => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-medium">{log.user}</td>
                      <td className="px-6 py-4 flex flex-col gap-0.5">
                         <span className="font-bold text-xs">{log.action}</span>
                         <span className="text-[10px] text-muted-foreground italic font-serif truncate w-60">{log.resource}</span>
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
            <MetricCard name="Faithfulness (忠实度)" value={latest.faith} status="excellent" />
            <MetricCard name="Answer Relevancy (答案相关度)" value={latest.rel} status="excellent" />
            <MetricCard name="Context Recall (上下文召回)" value={latest.recall} status="good" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="paper-border col-span-2">
              <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4 bg-muted/20">
                <div className="space-y-1">
                  <CardTitle className="text-base font-serif italic">评估质量趋势图 (Evaluation Timeline)</CardTitle>
                  <CardDescription>近 7 天 RAGAS 核心指标波动变化。</CardDescription>
                </div>
                <div className="flex gap-4">
                  <TrendLegend color="bg-green-500" label="Faithfulness" />
                  <TrendLegend color="bg-blue-500" label="Relevancy" />
                </div>
              </CardHeader>
              <CardContent className="p-8 h-[280px] flex items-end justify-between gap-2">
                {/* 简易手绘感趋势图占位 */}
                {DEMO_EVAL_RUNS.slice().reverse().map((run, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                    <div className="w-full flex justify-center gap-1 h-40 items-end">
                      <div className="w-2 bg-green-500/80 rounded-t-sm transition-all group-hover:bg-green-500" style={{ height: `${run.faith * 100}%` }} />
                      <div className="w-2 bg-blue-500/80 rounded-t-sm transition-all group-hover:bg-blue-500" style={{ height: `${run.rel * 100}%` }} />
                    </div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">{run.time.split(' ')[0]}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="paper-border">
              <CardHeader>
                <CardTitle className="text-base font-serif italic">健康度诊断</CardTitle>
                <CardDescription>当前系统运行风险评估</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-green-50 rounded-lg border border-green-100 flex gap-3">
                  <CheckCircle2 className="text-green-600" size={18} />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-green-800">忠实度表现极佳</p>
                    <p className="text-[10px] text-green-700/80">当前系统回答完全基于上下文，未发现明显的幻觉风险。</p>
                  </div>
                </div>
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-100 flex gap-3">
                  <AlertTriangle className="text-yellow-600" size={18} />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-yellow-800">召回率仍有优化空间</p>
                    <p className="text-[10px] text-yellow-700/80">部分复杂查询未能完全覆盖所有知识点，建议增加 Chunk 重叠度。</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="paper-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-serif italic">评估运行历史 (Evaluation History)</CardTitle>
              <CardDescription>最近 7 次 RAGAS 自动/手动评估详细得分。</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold tracking-widest border-y border-border">
                  <tr>
                    <th className="px-6 py-4">评估 ID</th>
                    <th className="px-6 py-4">样本规模</th>
                    <th className="px-6 py-4">Faithfulness</th>
                    <th className="px-6 py-4">Relevancy</th>
                    <th className="px-6 py-4">Recall</th>
                    <th className="px-6 py-4">执行时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-sans">
                  {DEMO_EVAL_RUNS.map(run => (
                    <tr key={run.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-primary">{run.id}</td>
                      <td className="px-6 py-4 font-bold">{run.size} samples</td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{(run.faith * 100).toFixed(1)}%</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{(run.rel * 100).toFixed(1)}%</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">{(run.recall * 100).toFixed(1)}%</Badge>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-[10px] font-bold uppercase tracking-tighter">{run.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. 全局配置 */}
        <TabsContent value="settings" className="mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <AdminLinkCard title="入库审批" desc="核心文档人工核验流水" href="#" icon={<ShieldCheck size={24} />} />
            <AdminLinkCard title="指令编排" desc="Agent 提示词与工具管理" href="#" icon={<Terminal size={24} />} />
            <AdminLinkCard title="资源配额" desc="部门存储与 Token 计费" href="#" icon={<Database size={24} />} />
            <AdminLinkCard title="合规脱敏" desc="PII 识别与异常行为审计" href="#" icon={<Lock size={24} />} />
          </div>
        </TabsContent>
      </Tabs>
    </AppPage>
  );
}

function MetricCard({ name, value, status }: { name: string, value: number, status: string }) {
  return (
    <Card className="paper-border">
      <CardHeader className="p-6 pb-2">
        <div className="flex justify-between items-start mb-4">
          <Badge variant="outline" className={cn(
            "text-[9px] font-bold uppercase border-none",
            status === 'excellent' ? "bg-green-100 text-green-700" : 
            status === 'good' ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"
          )}>
            {status}
          </Badge>
          <Zap size={16} className="text-primary/20" />
        </div>
        <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold font-sans">{name}</p>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-4xl font-bold font-serif italic tracking-tighter">{(value * 100).toFixed(0)}</span>
          <span className="text-sm font-bold opacity-30">%</span>
        </div>
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full transition-all duration-700",
              status === 'excellent' ? "bg-green-500" : 
              status === 'good' ? "bg-blue-500" : "bg-yellow-500"
            )}
            style={{ width: `${value * 100}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function TrendLegend({ color, label }: { color: string, label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tighter opacity-60">
      <div className={cn("w-2 h-2 rounded-full", color)} />
      {label}
    </div>
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

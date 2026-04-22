"use client";

import { cn } from "@/lib/utils";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppPage, PageHeader } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetchJson } from "@/lib/api-client";
import { format } from "date-fns";
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
  ChevronDown,
  Database,
  ArrowUpRight,
  Zap,
  Lock,
  Terminal,
  ArrowRight,
  RefreshCcw,
  Loader2
} from "lucide-react";

interface AuditLog {
  id: string;
  event_type: string;
  user_id: string;
  project_id?: string;
  payload: any;
  created_at: string;
  ip_address?: string;
}

interface EvaluationRun {
  run_id: string;
  run_type: string;
  dataset_size: number;
  faithfulness: number;
  relevancy: number;
  recall: number;
  created_at: string;
}

export default function AdminConsolePage() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [evaluationRuns, setEvaluationRuns] = useState<EvaluationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    setRefreshing(true);
    try {
      const [logs, evalHistory] = await Promise.all([
        apiFetchJson<AuditLog[]>("/evaluation/logs?limit=20"),
        apiFetchJson<{ total: number, runs: EvaluationRun[] }>("/evaluation/history?limit=10")
      ]);
      setAuditLogs(logs);
      setEvaluationRuns(evalHistory.runs);
    } catch (err) {
      console.error("Failed to fetch admin data", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const latestRun = evaluationRuns[0];
  
  const ragasMetrics = [
    { 
      name: "Faithfulness (忠实度)", 
      value: latestRun?.faithfulness ?? 0, 
      status: (latestRun?.faithfulness ?? 0) > 0.8 ? "excellent" : (latestRun?.faithfulness ?? 0) > 0.6 ? "good" : "average" 
    },
    { 
      name: "Answer Relevancy (答案相关度)", 
      value: latestRun?.relevancy ?? 0, 
      status: (latestRun?.relevancy ?? 0) > 0.8 ? "excellent" : (latestRun?.relevancy ?? 0) > 0.6 ? "good" : "average" 
    },
    { 
      name: "Context Recall (上下文召回率)", 
      value: latestRun?.recall ?? 0, 
      status: (latestRun?.recall ?? 0) > 0.8 ? "excellent" : (latestRun?.recall ?? 0) > 0.6 ? "good" : "average" 
    },
  ];

  const getActionLabel = (eventType: string, payload: any) => {
    switch (eventType) {
      case "document_uploaded": return "文档上传";
      case "qa_query": return "问答检索";
      case "evaluation_run": return "RAGAS 评估";
      case "project_created": return "创建项目";
      default: return eventType;
    }
  };

  const getResourceLabel = (eventType: string, payload: any) => {
    if (!payload) return "-";
    if (payload.filename) return payload.filename;
    if (payload.query) return payload.query;
    if (payload.run_id) return `Run: ${payload.run_id.slice(0, 8)}`;
    return JSON.stringify(payload).slice(0, 30);
  };

  if (loading) {
    return (
      <AppPage surface="canvas">
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage surface="canvas">
      <PageHeader
        title="系统设置与审计"
        description="管理员控制台：监控系统健康度、评估 AI 质量并追踪审计流水。"
        breadcrumbs={breadcrumbsFromPathname("/admin")}
        actions={
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchData} 
              disabled={refreshing}
              className="font-serif italic gap-2 h-8"
            >
              {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
              刷新数据
            </Button>
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/5 py-1 font-serif text-sm italic text-primary"
            >
              Admin Privilege Enabled
            </Badge>
          </div>
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
                <ScrollArea className="max-h-[600px]">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold tracking-widest border-y border-border sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-4">操作员</th>
                        <th className="px-6 py-4">动作 / 资源</th>
                        <th className="px-6 py-4">状态</th>
                        <th className="px-6 py-4">时间</th>
                        <th className="px-6 py-4">IP 地址</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-sans">
                      {auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-20 text-center text-muted-foreground italic font-serif">
                            暂无审计记录
                          </td>
                        </tr>
                      ) : (
                        auditLogs.map(log => (
                          <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-6 py-4 font-medium max-w-[150px] truncate">{log.user_id}</td>
                            <td className="px-6 py-4 flex flex-col gap-0.5">
                               <span className="font-bold text-xs">{getActionLabel(log.event_type, log.payload)}</span>
                               <span className="text-[10px] text-muted-foreground italic font-serif truncate w-60">{getResourceLabel(log.event_type, log.payload)}</span>
                            </td>
                            <td className="px-6 py-4">
                               <Badge variant="secondary" className="bg-green-100 text-green-700 text-[9px] font-bold px-1.5 h-4 border-none">
                                 SUCCESS
                               </Badge>
                            </td>
                            <td className="px-6 py-4 text-muted-foreground text-[10px] font-bold uppercase tracking-tighter">
                              {log.created_at ? format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss") : "-"}
                            </td>
                            <td className="px-6 py-4 text-muted-foreground font-mono text-xs opacity-60">
                              {log.ip_address || "internal"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </ScrollArea>
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
                        <Zap size={16} className={cn(
                          "transition-colors",
                          metric.status === 'excellent' ? "text-green-500/40" : 
                          metric.status === 'good' ? "text-blue-500/40" : "text-yellow-500/40"
                        )} />
                      </div>
                      <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold font-sans">{metric.name}</p>
                   </CardHeader>
                   <CardContent className="p-6 pt-0">
                      <div className="flex items-baseline gap-2 mb-4">
                        <span className="text-4xl font-bold font-serif italic tracking-tighter">
                          {evaluationRuns.length > 0 ? (metric.value * 100).toFixed(0) : "--"}
                        </span>
                        <span className="text-sm font-bold opacity-30">%</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full transition-all duration-700",
                            metric.status === 'excellent' ? "bg-green-500" : 
                            metric.status === 'good' ? "bg-blue-500" : "bg-yellow-500"
                          )}
                          style={{ width: `${evaluationRuns.length > 0 ? metric.value * 100 : 0}%` }}
                        />
                      </div>
                   </CardContent>
                </Card>
              ))}
            </div>

            <Card className="paper-border min-h-[400px] flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4 bg-muted/20">
                <div className="space-y-1">
                  <CardTitle className="text-base font-serif italic">评估运行历史 (Evaluation History)</CardTitle>
                  <CardDescription>最近 10 次 RAGAS 评估的详细得分情况。</CardDescription>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-tighter opacity-60">
                  <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /> Faithfulness</span>
                  <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Relevancy</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {evaluationRuns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 space-y-4 opacity-40">
                    <Activity size={48} className="animate-pulse" />
                    <p className="text-sm italic font-serif">暂无评估数据，请触发检索后自动生成采样</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold tracking-widest border-y border-border">
                      <tr>
                        <th className="px-6 py-3">Run ID</th>
                        <th className="px-6 py-3">样本数</th>
                        <th className="px-6 py-3">Faithfulness</th>
                        <th className="px-6 py-3">Relevancy</th>
                        <th className="px-6 py-3">Recall</th>
                        <th className="px-6 py-3">时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-sans">
                      {evaluationRuns.map(run => (
                        <tr key={run.run_id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-3 font-mono text-xs text-primary">{run.run_id.slice(0, 8)}</td>
                          <td className="px-6 py-3 font-bold">{run.dataset_size}</td>
                          <td className="px-6 py-3">
                            <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50 font-bold">
                              {(run.faithfulness * 100).toFixed(1)}%
                            </Badge>
                          </td>
                          <td className="px-6 py-3">
                            <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 font-bold">
                              {(run.relevancy * 100).toFixed(1)}%
                            </Badge>
                          </td>
                          <td className="px-6 py-3">
                            <Badge variant="outline" className="border-yellow-200 text-yellow-700 bg-yellow-50 font-bold">
                              {(run.recall * 100).toFixed(1)}%
                            </Badge>
                          </td>
                          <td className="px-6 py-3 text-muted-foreground text-[10px] font-bold uppercase tracking-tighter">
                            {format(new Date(run.created_at), "MM-dd HH:mm")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
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
                   <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
                      <div className="space-y-0.5">
                        <p className="text-sm font-bold">不可变日志策略</p>
                        <p className="text-[10px] text-muted-foreground">启用后日志将通过内容寻址哈希锁定，禁止任何形式的物理删除。</p>
                      </div>
                      <Badge className="bg-green-100 text-green-700 border-none uppercase text-[9px]">Active</Badge>
                   </div>
                   <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
                      <div className="space-y-0.5">
                        <p className="text-sm font-bold">Retention Period</p>
                        <p className="text-[10px] text-muted-foreground">审计日志在系统中保留的最长期限。</p>
                      </div>
                      <span className="font-serif italic font-bold">365 Days</span>
                   </div>
                </CardContent>
              </Card>

              <Card className="paper-border">
                <CardHeader>
                  <CardTitle className="text-base font-serif italic">系统健康度概览</CardTitle>
                  <CardDescription>核心依赖服务的实时运行状态。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                   <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-sm font-bold flex-1">PostgreSQL Database</span>
                      <span className="text-[10px] font-mono opacity-40">Connected</span>
                   </div>
                   <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-sm font-bold flex-1">Qdrant Vector DB</span>
                      <span className="text-[10px] font-mono opacity-40">Cluster Healthy</span>
                   </div>
                   <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-sm font-bold flex-1">MinIO Object Storage</span>
                      <span className="text-[10px] font-mono opacity-40">99.9% Uptime</span>
                   </div>
                   <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                      <span className="text-sm font-bold flex-1">RAGAS Evaluator</span>
                      <span className="text-[10px] font-mono opacity-40">Processing Samples...</span>
                   </div>
                </CardContent>
              </Card>
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

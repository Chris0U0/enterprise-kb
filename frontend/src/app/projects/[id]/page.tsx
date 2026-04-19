"use client";

import { cn } from "@/lib/utils";
import React from 'react';
import Link from 'next/link';
import { useParams, usePathname } from "next/navigation";
import { AppPage, PageHeader } from "@/components/shared/page-layout";
import { ReadOnlyBanner } from "@/components/shared/page-gate";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { canEditInProject } from "@/lib/project-permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Activity, 
  Users, 
  FileText, 
  History, 
  Sparkles, 
  ArrowRight,
  ShieldAlert,
  Settings,
  UserPlus,
  Upload,
  Calendar,
  CheckCircle2,
  Clock,
  MoreVertical,
  Trash2,
  Library,
  MessageSquareText,
  PackageOpen,
  UsersRound
} from "lucide-react";
import { useProject } from "@/hooks/use-project";
import { useProjectMembers } from "@/hooks/use-project-members";
import { useProjectDocuments } from "@/hooks/use-project-documents";
import { ProjectOnboarding } from "@/components/project/project-onboarding";
import { ProactiveSummaryCard } from "@/components/project/proactive-summary-card";

export default function ProjectDashboardPage() {
  const params = useParams();
  const pathname = usePathname();
  const id = params.id as string;
  const { project: meta, isLoading: projectLoading } = useProject(id);
  const { members: memberRows, loading: membersLoading } = useProjectMembers(id);
  const { docs: docRows, loading: docsLoading } = useProjectDocuments(id);

  const canManage = canEditInProject(meta?.myRole);
  const projectViewer = meta?.myRole === "Viewer";

  if (projectLoading || !meta) {
    return (
      <AppPage surface="canvas">
        <div className="flex justify-center py-24 text-sm text-muted-foreground">加载项目信息…</div>
      </AppPage>
    );
  }

  const record = meta;
  const healthMetrics = record.health ?? { progress: 0, risk: 0, quality: 0 };

  const project = {
    id,
    name: record.name,
    health: { progress: healthMetrics.progress, risk: healthMetrics.risk, quality: healthMetrics.quality },
    members: memberRows.map((m) => ({
      id: m.user_id,
      name: m.name,
      role: m.role,
      email: m.email,
    })),
    timeline: [
      { date: "2026-03-01", event: "项目启动", status: "completed" },
      { date: "2026-03-15", event: "需求文档 V1 归档", status: "completed" },
      { date: "2026-04-01", event: "架构设计评审", status: "completed" },
      { date: "2026-04-15", event: "后端核心接口联调", status: "in_progress" },
      { date: "2026-05-01", event: "首轮灰度测试", status: "pending" },
    ],
    lastReport: "本周系统核心架构已完成 MD5 校验模块，整体进度超前 5%。但单元测试覆盖率在 `services/auth` 目录下偏低，需引起关注。"
  };

  const breadcrumbs = breadcrumbsFromPathname(pathname, {
    segmentLabels: { [`/projects/${id}`]: project.name },
  });

  const activeMilestone = project.timeline.find((t) => t.status === "in_progress");
  const nextPending = project.timeline.find((t) => t.status === "pending");
  const milestoneHeadline = activeMilestone ?? nextPending;

  return (
    <AppPage surface="canvas">
      {projectViewer ? (
        <ReadOnlyBanner className="mb-6" />
      ) : null}

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {project.name}
            <Badge variant="secondary" className="font-sans text-xs">
              {projectViewer ? "只读模式" : "管理模式"}
            </Badge>
          </span>
        }
        breadcrumbs={breadcrumbs}
        actions={
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <Button variant="outline" className="gap-2">
                <Settings size={16} />
                项目设置
              </Button>
            )}
            <Button
              className="gap-2 bg-primary"
              disabled={!canManage}
              title={
                !canManage
                  ? "只读角色无法生成报表，如需权限请联系项目管理员"
                  : undefined
              }
            >
              <Sparkles size={16} />
              生成本周报表
            </Button>
          </div>
        }
      />

        {milestoneHeadline ? (
          <Card className="paper-border border-primary/25 bg-gradient-to-r from-primary/5 to-transparent">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  本周推进 · 里程碑
                </p>
                <p className="font-serif text-lg italic leading-snug">
                  {milestoneHeadline.event}
                </p>
                <p className="text-xs text-muted-foreground">
                  {activeMilestone
                    ? "当前阶段进行中，请关注联调与测试节点"
                    : `下一节点计划 ${milestoneHeadline.date} 启动`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge
                  variant={activeMilestone ? "default" : "secondary"}
                  className="font-sans text-xs"
                >
                  {activeMilestone ? "进行中" : "待开始"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {activeMilestone ? "剩余约 12 个工作日（示例）" : ""}
                </span>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="paper-border border-primary/15 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <p className="text-sm font-medium">在本项目中继续</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/projects/${id}/knowledge`} className="gap-1.5">
                  <Library size={14} /> 知识库
                </Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/projects/${id}/qa`} className="gap-1.5">
                  <MessageSquareText size={14} /> 问答记录
                </Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/projects/${id}/artifacts`} className="gap-1.5">
                  <PackageOpen size={14} /> 产出物
                </Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/projects/${id}/collab`} className="gap-1.5">
                  <UsersRound size={14} /> 协作空间
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <ProjectOnboarding projectId={id} flags={record.onboarding} className="mb-6" />
        {membersLoading || docsLoading ? (
          <p className="mb-4 text-xs text-muted-foreground">同步成员与文档列表…</p>
        ) : null}

        {/* 核心仪表盘网格 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* 1. 项目健康度与进度表 */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="paper-border">
              <CardHeader>
                <CardTitle className="text-lg font-serif italic flex items-center gap-2">
                  <Activity size={18} className="text-primary" />
                  项目状态
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <HealthIndicator label="进度情况" value={project.health.progress} color="bg-green-500" />
                <HealthIndicator label="代码质量" value={project.health.quality} color="bg-blue-500" />
                
                <div className="pt-4 border-t border-border mt-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">
                    <Calendar size={14} className="text-primary" />
                    项目进度时间轴
                  </div>
                  <div className="space-y-4">
                    {project.timeline.map((item, index) => (
                      <div key={index} className="flex gap-3 items-start relative">
                        {index !== project.timeline.length - 1 && (
                          <div className="absolute left-[9px] top-5 bottom-0 w-px bg-border" />
                        )}
                        <div className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center shrink-0 z-10",
                          item.status === 'completed' ? "bg-green-100 text-green-600" : 
                          item.status === 'in_progress' ? "bg-blue-100 text-blue-600 animate-pulse" : 
                          "bg-muted text-muted-foreground"
                        )}>
                          {item.status === 'completed' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                        </div>
                        <div className="space-y-0.5">
                          <p className={cn(
                            "text-sm font-medium",
                            item.status === 'pending' ? "text-muted-foreground" : "text-foreground"
                          )}>
                            {item.event}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-mono">{item.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 2. AI 项目简报：可刷新摘要 */}
          <div className="lg:col-span-2 space-y-6">
            <ProactiveSummaryCard body={project.lastReport} />
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" className="gap-1 text-xs" asChild>
                <Link href="/report">
                  查看历史报告 <ArrowRight size={14} />
                </Link>
              </Button>
            </div>

            {/* 潜在风险预警 */}
            <Card className="paper-border border-yellow-200 bg-yellow-50/50">
               <CardContent className="pt-6 flex gap-4">
                  <ShieldAlert size={24} className="text-yellow-600 shrink-0" />
                  <div>
                    <p className="text-sm font-bold italic font-serif text-yellow-800">当前潜在风险点</p>
                    <p className="text-xs text-yellow-700/80 mt-1 leading-relaxed">
                      检测到 `services/auth` 模块代码变更频繁但测试覆盖率未同步提升。建议在下周联调前补充 3 个核心场景的单元测试。
                    </p>
                  </div>
               </CardContent>
            </Card>
          </div>

        </div>

        {/* 底部详细内容页签 */}
        <Tabs defaultValue="documents" className="w-full">
          <TabsList className="bg-transparent border-b border-border w-full justify-start rounded-none h-auto p-0 gap-8">
            <TabsTrigger value="documents" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3 font-serif italic text-lg px-0">项目文档管理</TabsTrigger>
            <TabsTrigger value="members" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3 font-serif italic text-lg px-0">项目成员 (ReBAC)</TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3 font-serif italic text-lg px-0">操作日志</TabsTrigger>
          </TabsList>
          
          <TabsContent value="documents" className="mt-6 space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground font-serif italic">本项目的专属向量库分区文档</p>
              {canManage && (
                <Button size="sm" className="gap-2">
                  <Upload size={14} />
                  上传到本项目
                </Button>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {docRows.length === 0 && !docsLoading ? (
                 <p className="text-sm text-muted-foreground col-span-full">暂无文档，上传后将显示解析状态。</p>
               ) : null}
               {docRows.map((doc) => (
                 <Card key={doc.id} className="paper-border group hover:border-primary/30 transition-all">
                    <CardContent className="p-4 flex gap-4 items-center">
                       <div className="w-10 h-10 bg-muted flex items-center justify-center rounded-sm shrink-0">
                          <FileText size={20} className="text-muted-foreground" />
                       </div>
                       <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate font-serif italic">{doc.original_filename}</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold font-sans">
                            {doc.file_size_bytes != null ? `${(doc.file_size_bytes / 1024 / 1024).toFixed(2)} MB` : "—"} · {doc.conversion_status}
                          </p>
                       </div>
                       <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical size={14} /></Button>
                          {canManage && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 size={14} /></Button>}
                       </div>
                    </CardContent>
                 </Card>
               ))}
            </div>
          </TabsContent>

          <TabsContent value="members" className="mt-6">
            <Card className="paper-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-serif italic">成员管理</CardTitle>
                  <CardDescription>基于角色的访问控制 (Admin / Editor / Viewer)</CardDescription>
                </div>
                {canManage && (
                  <Button size="sm" className="gap-2">
                    <UserPlus size={16} />
                    邀请成员
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {project.members.map((member) => (
                    <div key={String(member.id)} className="flex items-center justify-between p-3 border border-border rounded-sm hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center font-bold text-xs">{member.name[0]}</div>
                        <div>
                          <p className="text-sm font-medium">{member.name}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                      <Badge variant={member.role === 'Admin' ? 'default' : 'secondary'} className="font-sans text-[10px]">
                        {member.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="activity" className="mt-6">
            <Card className="paper-border">
              <CardContent className="p-0">
                <ScrollArea className="h-[300px] w-full">
                  <div className="divide-y divide-border">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="p-4 flex gap-3 text-sm">
                        <History size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-foreground/80">张三 更新了本项目文档</p>
                          <p className="text-xs text-muted-foreground">2026-04-16 10:30:4{i}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
    </AppPage>
  );
}

function HealthIndicator({ label, value, color, reverse = false }: { label: string, value: number, color: string, reverse?: boolean }) {
  const percentage = value;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm font-sans">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-bold">{value}%</span>
      </div>
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div 
          className={cn("h-full transition-all duration-500", color)} 
          style={{ width: `${percentage}%` }} 
        />
      </div>
    </div>
  );
}

"use client";

import { cn } from "@/lib/utils";
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { AppPage, PageHeader, PageSection } from "@/components/shared/page-layout";
import { TodayFocus, type FocusItem } from "@/components/shared/today-focus";
import { TaskAssignDialog } from "@/components/shared/task-assign-dialog";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  FolderKanban, 
  AlertTriangle, 
  Clock, 
  ArrowRight, 
  Activity, 
  FileText, 
  ShieldCheck,
  Plus
} from "lucide-react";

const INITIAL_FOCUS: FocusItem[] = [
    {
      id: "f1",
      type: "approval",
      source: "ai",
      title: "「核心代码逻辑V3_说明.pdf」等待您审批入库",
      projectName: "智能排班系统",
      projectHref: "/projects/1",
      actionHref: "/admin/approval",
      actionLabel: "去审批",
    },
    {
      id: "f2",
      type: "risk",
      source: "ai",
      title: "单元测试覆盖率低于阈值，需排期整改",
      projectName: "自动化运维平台",
      projectHref: "/projects/3",
      actionHref: "/projects/3",
      actionLabel: "查看项目",
    },
    {
      id: "f-mgr-demo",
      type: "task",
      source: "manager",
      title: "周五评审会前请同步接口 Mock 数据方案",
      projectName: "智能排班系统",
      projectHref: "/projects/1",
      actionHref: "/projects/1",
      actionLabel: "去处理",
      assignee: "李四",
      dueHint: "截止：2026-04-18",
    },
    {
      id: "f3",
      type: "deadline",
      source: "system",
      title: "里程碑「首轮灰度测试」将在 14 天后到期",
      projectName: "智能排班系统",
      projectHref: "/projects/1",
      actionHref: "/projects/1",
      actionLabel: "打开里程碑",
    },
  ];

export default function WorkspacePage() {
  const { user } = useAuth();
  const canAssign =
    user?.role === "Admin" || user?.role === "Editor";

  const [focusItems, setFocusItems] = useState<FocusItem[]>(INITIAL_FOCUS);

  // Mock 数据
  const projects = [
    { id: 1, name: "智能排班系统", phase: "开发联调", docs: 42, health: "good", lastUpdate: "2小时前", pendingSummary: "2 待办 · 1 审批中" },
    { id: 2, name: "企业知识库 RAG", phase: "需求设计", docs: 15, health: "warning", lastUpdate: "1天前", pendingSummary: "1 风险待确认" },
    { id: 3, name: "自动化运维平台", phase: "灰度发布", docs: 89, health: "critical", lastUpdate: "30分钟前", pendingSummary: "3 待办 · 解析中 1 篇" },
  ];

  const projectOptions = useMemo(
    () => projects.map((p) => ({ id: p.id, name: p.name })),
    [projects]
  );

  const risks = [
    { id: 1, project: "自动化运维平台", type: "质量风险", desc: "单元测试覆盖率低于 60%", level: "high" },
    { id: 2, project: "企业知识库 RAG", type: "进度预警", desc: "后端接口联调延迟 2 天", level: "medium" },
  ];

  return (
    <AppPage surface="canvas">
      <PageHeader
        title="全局工作台"
        description="欢迎回来，这是您参与的所有项目聚合看板。"
        actions={
          <Button className="font-sans gap-2">
            <Plus size={18} />
            新建项目
          </Button>
        }
      />

      <TodayFocus
        items={focusItems}
        headerExtra={
          canAssign ? (
            <TaskAssignDialog
              projects={projectOptions}
              onAssign={(item) =>
                setFocusItems((prev) => [item, ...prev])
              }
            />
          ) : null
        }
      />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* 左侧：项目聚合看板 */}
          <div className="lg:col-span-2">
            <PageSection
              title={
                <span className="flex items-center gap-2 text-lg">
                  <FolderKanban size={20} className="text-primary" />
                  项目聚合看板
                </span>
              }
            >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map(project => (
                <Card key={project.id} className="paper-border hover:shadow-md transition-shadow cursor-pointer group">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-xl font-serif italic group-hover:text-primary transition-colors">
                        {project.name}
                      </CardTitle>
                      <HealthBadge status={project.health} />
                    </div>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Clock size={12} />
                      最后更新: {project.lastUpdate}
                    </CardDescription>
                    <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {project.pendingSummary}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center mt-4">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">当前阶段</p>
                        <Badge variant="secondary" className="font-medium">{project.phase}</Badge>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">文档总数</p>
                        <div className="flex items-center justify-end gap-1 font-serif italic">
                          <FileText size={14} />
                          {project.docs}
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 flex justify-end">
                      <Link href={`/projects/${project.id}`}>
                        <Button variant="ghost" size="sm" className="gap-1 text-xs hover:bg-primary/5 hover:text-primary">
                          进入项目 <ArrowRight size={14} />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            </PageSection>
          </div>

          {/* 右侧：全局待办与预警 */}
          <div>
            <PageSection
              title={
                <span className="flex items-center gap-2 text-lg">
                  <AlertTriangle size={20} className="text-destructive" />
                  全局待办与预警
                </span>
              }
            >
            <div className="space-y-6">
            <Card className="paper-border bg-destructive/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-destructive flex items-center gap-2">
                  <Activity size={16} />
                  风险汇总 (ProjectHealthSkill)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-border">
                    {risks.map(risk => (
                      <div key={risk.id} className="p-4 hover:bg-white/50 transition-colors">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-bold text-muted-foreground">{risk.project}</span>
                          <Badge variant={risk.level === 'high' ? 'destructive' : 'outline'} className="text-[10px] px-1.5 py-0">
                            {risk.level.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium mb-1">{risk.type}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{risk.desc}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* 审计合规提示 */}
            <Card className="paper-border border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex gap-3">
                  <ShieldCheck size={24} className="text-primary shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold italic font-serif">合规性检查已启用</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      当前所有项目文档均已通过 MD5 校验，满足企业审计合规要求。
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
            </PageSection>
          </div>

        </div>
    </AppPage>
  );
}

function HealthBadge({ status }: { status: string }) {
  const colors = {
    good: "bg-green-500",
    warning: "bg-yellow-500",
    critical: "bg-red-500",
  };
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("w-2 h-2 rounded-full", colors[status as keyof typeof colors])} />
      <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">{status}</span>
    </div>
  );
}

"use client";

import { cn } from "@/lib/utils";
import React, { useState } from 'react';
import Link from 'next/link';
import { AppPage, PageHeader, PageToolbar } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  FolderKanban, 
  Search, 
  Plus, 
  ArrowRight, 
  Clock, 
  Users, 
  FileText, 
  Activity,
  LayoutGrid,
  List
} from "lucide-react";

export default function ProjectsListPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState("");

  const projects = [
    { id: 1, name: "智能排班系统", description: "基于遗传算法的自动排班引擎，支持多维度约束。", phase: "开发联调", members: 8, docs: 42, health: "good", lastUpdate: "2小时前" },
    { id: 2, name: "企业知识库 RAG", description: "面向企业文档的检索增强生成系统，支持私有化部署。", phase: "需求设计", members: 5, docs: 15, health: "warning", lastUpdate: "1天前" },
    { id: 3, name: "自动化运维平台", description: "集成监控、告警、自动修复的一站式运维管控中心。", phase: "灰度发布", members: 12, docs: 89, health: "critical", lastUpdate: "30分钟前" },
    { id: 4, name: "客户画像分析", description: "基于大数据平台的 360 度客户画像构建与精准营销。", phase: "初期准备", members: 3, docs: 4, health: "good", lastUpdate: "3天前" },
  ];

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AppPage>
      <PageHeader
        title="所有项目看板"
        icon={<FolderKanban className="h-9 w-9 text-primary/60" />}
        breadcrumbs={breadcrumbsFromPathname("/projects")}
        actions={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full min-w-0 sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索项目名称或描述..."
                className="h-11 border-border bg-white pl-10 font-sans shadow-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="搜索项目"
              />
            </div>
            <Button className="h-11 gap-2 bg-primary px-6 text-xs font-bold uppercase tracking-widest text-primary-foreground shadow-lg">
              <Plus size={18} />
              新建项目
            </Button>
          </div>
        }
      />

      <PageToolbar
        end={
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            当前共有 {filteredProjects.length} 个活跃项目
          </p>
        }
      >
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-10 w-10 border border-border bg-white"
            onClick={() => setViewMode("grid")}
            aria-label="网格视图"
          >
            <LayoutGrid size={18} />
          </Button>
          <Button
            type="button"
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            className="h-10 w-10 border border-border bg-white"
            onClick={() => setViewMode("list")}
            aria-label="列表视图"
          >
            <List size={18} />
          </Button>
        </div>
      </PageToolbar>

        {/* 项目展示区 */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProjects.map(project => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <Card className="paper-border overflow-hidden">
            <CardContent className="p-0">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-muted text-muted-foreground uppercase text-[10px] font-bold tracking-widest border-b border-border">
                  <tr>
                    <th className="px-6 py-4">项目名称</th>
                    <th className="px-6 py-4">阶段</th>
                    <th className="px-6 py-4">健康度</th>
                    <th className="px-6 py-4">成员 / 文档</th>
                    <th className="px-6 py-4">最后更新</th>
                    <th className="px-6 py-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-sans">
                  {filteredProjects.map(project => (
                    <tr key={project.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-6 py-5">
                        <Link href={`/projects/${project.id}`} className="group-hover:text-primary transition-colors">
                          <p className="font-serif italic font-bold text-base leading-tight">{project.name}</p>
                          <p className="text-[10px] text-muted-foreground line-clamp-1 mt-1 font-normal italic">{project.description}</p>
                        </Link>
                      </td>
                      <td className="px-6 py-5">
                        <Badge variant="secondary" className="font-bold text-[10px] uppercase">{project.phase}</Badge>
                      </td>
                      <td className="px-6 py-5">
                        <HealthBadge status={project.health} />
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3 text-xs opacity-60">
                           <span className="flex items-center gap-1"><Users size={12} /> {project.members}</span>
                           <span className="flex items-center gap-1"><FileText size={12} /> {project.docs}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-muted-foreground text-xs">{project.lastUpdate}</td>
                      <td className="px-6 py-5 text-right">
                        <Link href={`/projects/${project.id}`}>
                          <Button variant="ghost" size="sm" className="h-8 gap-2 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                             进入 <ArrowRight size={14} />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
    </AppPage>
  );
}

function ProjectCard({ project }: { project: any }) {
  return (
    <Card className="paper-border hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 flex flex-col group relative overflow-hidden bg-white">
      <div className="absolute top-0 left-0 w-full h-1 bg-primary/10" />
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start mb-4">
           <HealthBadge status={project.health} />
           <div className="w-10 h-10 bg-primary/5 rounded-sm flex items-center justify-center text-primary/40 group-hover:scale-110 transition-transform">
              <FolderKanban size={20} />
           </div>
        </div>
        <CardTitle className="text-2xl font-serif italic font-bold tracking-tight group-hover:text-primary transition-colors">
          {project.name}
        </CardTitle>
        <CardDescription className="text-sm font-sans italic line-clamp-2 mt-2 leading-relaxed">
          {project.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 mt-4">
        <div className="flex items-center justify-between py-3 border-y border-border/50">
           <div className="space-y-1">
             <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">当前阶段</p>
             <Badge className="bg-secondary text-foreground border-none font-bold text-xs">{project.phase}</Badge>
           </div>
           <div className="text-right space-y-1">
             <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">项目热度</p>
             <div className="flex items-center gap-3 text-xs font-bold opacity-60">
                <span className="flex items-center gap-1"><Users size={12} /> {project.members}</span>
                <span className="flex items-center gap-1"><FileText size={12} /> {project.docs}</span>
             </div>
           </div>
        </div>
        <div className="mt-4 flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
           <span className="flex items-center gap-1.5"><Clock size={12} /> 最后更新: {project.lastUpdate}</span>
        </div>
      </CardContent>
      <div className="p-4 bg-muted/20 border-t border-border mt-auto group-hover:bg-primary transition-colors duration-300">
        <Link href={`/projects/${project.id}`} className="flex items-center justify-between text-xs font-bold uppercase tracking-widest group-hover:text-primary-foreground transition-colors">
          <span>进入项目详情</span>
          <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>
    </Card>
  );
}

function HealthBadge({ status }: { status: string }) {
  const colors = {
    good: "bg-green-500",
    warning: "bg-yellow-500",
    critical: "bg-red-500",
  };
  const labels = {
    good: "健康",
    warning: "预警",
    critical: "异常",
  };
  return (
    <div className="flex items-center gap-2">
      <div className={cn("w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)]", colors[status as keyof typeof colors])} />
      <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">{labels[status as keyof typeof labels]}</span>
    </div>
  );
}

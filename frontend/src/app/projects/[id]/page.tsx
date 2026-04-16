"use client";

import { cn } from "@/lib/utils";
import React from 'react';
import { useParams } from 'next/navigation';
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
  UserPlus
} from "lucide-react";

export default function ProjectDashboardPage() {
  const params = useParams();
  const id = params.id as string;

  // Mock 项目数据
  const project = {
    id,
    name: id === '1' ? "智能排班系统" : "企业知识库 RAG",
    health: { progress: 85, risk: 12, quality: 92 },
    members: [
      { id: 1, name: "张三", role: "Admin", email: "zhangsan@example.com" },
      { id: 2, name: "李四", role: "Editor", email: "lisi@example.com" },
      { id: 3, name: "王五", role: "Viewer", email: "wangwu@example.com" },
    ],
    lastReport: "本周系统核心架构已完成 MD5 校验模块，整体进度超前 5%。但单元测试覆盖率在 `services/auth` 目录下偏低，需引起关注。"
  };

  return (
    <div className="min-h-screen bg-background p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* 顶部导航与项目标题 */}
        <div className="flex justify-between items-end border-b border-border pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <span className="hover:text-primary cursor-pointer">工作台</span>
              <span>/</span>
              <span className="text-foreground font-medium">{project.name}</span>
            </div>
            <h1 className="text-4xl font-bold italic tracking-tight font-serif">{project.name}</h1>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="gap-2">
              <Settings size={16} />
              项目设置
            </Button>
            <Button className="gap-2 bg-primary">
              <Sparkles size={16} />
              生成本周报表
            </Button>
          </div>
        </div>

        {/* 核心仪表盘网格 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* 1. 项目健康度指示器 */}
          <Card className="lg:col-span-1 paper-border">
            <CardHeader>
              <CardTitle className="text-lg font-serif italic flex items-center gap-2">
                <Activity size={18} className="text-primary" />
                项目健康度
              </CardTitle>
              <CardDescription>实时监控进度、风险与质量</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <HealthIndicator label="进度情况" value={project.health.progress} color="bg-green-500" />
              <HealthIndicator label="潜在风险" value={project.health.risk} color="bg-yellow-500" reverse />
              <HealthIndicator label="代码质量" value={project.health.quality} color="bg-blue-500" />
              
              <div className="pt-4 border-t border-border mt-6">
                <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
                  <ShieldAlert size={14} className="text-destructive" />
                  风险预警提示
                </div>
                <p className="text-sm leading-relaxed italic font-serif">
                  “检测到 2 个待处理的安全漏洞引用，建议在 Copilot 中对比最新安全指南进行修复。”
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 2. AI 项目简报 (ReportGenerationSkill) */}
          <Card className="lg:col-span-2 paper-border bg-primary/5 border-primary/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4">
              <Sparkles size={24} className="text-primary/20" />
            </div>
            <CardHeader>
              <CardTitle className="text-lg font-serif italic flex items-center gap-2">
                <FileText size={18} className="text-primary" />
                AI 项目简报 (本周总结)
              </CardTitle>
              <CardDescription>由 ReportGenerationSkill 自动分析生成</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-white/80 p-6 border border-primary/10 rounded-sm font-sans leading-[1.8] text-sm shadow-sm min-h-[160px]">
                {project.lastReport}
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant="ghost" size="sm" className="gap-1 text-xs">
                  查看历史报告 <ArrowRight size={14} />
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* 底部详细内容页签 */}
        <Tabs defaultValue="members" className="w-full">
          <TabsList className="bg-transparent border-b border-border w-full justify-start rounded-none h-auto p-0 gap-8">
            <TabsTrigger value="members" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3 font-serif italic text-lg px-0">项目成员 (ReBAC)</TabsTrigger>
            <TabsTrigger value="documents" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3 font-serif italic text-lg px-0">最新文档</TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3 font-serif italic text-lg px-0">操作日志</TabsTrigger>
          </TabsList>
          
          <TabsContent value="members" className="mt-6">
            <Card className="paper-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-serif italic">成员管理</CardTitle>
                  <CardDescription>基于角色的访问控制 (Admin / Editor / Viewer)</CardDescription>
                </div>
                <Button size="sm" className="gap-2">
                  <UserPlus size={16} />
                  邀请成员
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {project.members.map(member => (
                    <div key={member.id} className="flex items-center justify-between p-3 border border-border rounded-sm hover:bg-muted/30 transition-colors">
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

          <TabsContent value="documents" className="mt-6">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               {[1, 2, 3].map(i => (
                 <Card key={i} className="paper-border p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <FileText size={24} className="text-muted-foreground" />
                      <Badge variant="outline" className="text-[10px]">已校验</Badge>
                    </div>
                    <p className="font-medium text-sm">文档_{i}.pdf</p>
                    <p className="text-xs text-muted-foreground">上传于 2026-04-1{i}</p>
                 </Card>
               ))}
             </div>
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
                          <p className="font-medium text-foreground/80">张三 更新了《架构设计说明书》</p>
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
      </div>
    </div>
  );
}

function HealthIndicator({ label, value, color, reverse = false }: { label: string, value: number, color: string, reverse?: boolean }) {
  // 越接近 100 越好的指标
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

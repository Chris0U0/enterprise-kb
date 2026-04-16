"use client";

import { cn } from "@/lib/utils";
import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from "@/lib/auth-context";
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
  Trash2
} from "lucide-react";

export default function ProjectDashboardPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();

  // 权限检查辅助函数
  const canManage = user?.role === 'Admin' || user?.role === 'Editor';

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
    timeline: [
      { date: "2026-03-01", event: "项目启动", status: "completed" },
      { date: "2026-03-15", event: "需求文档 V1 归档", status: "completed" },
      { date: "2026-04-01", event: "架构设计评审", status: "completed" },
      { date: "2026-04-15", event: "后端核心接口联调", status: "in_progress" },
      { date: "2026-05-01", event: "首轮灰度测试", status: "pending" },
    ],
    lastReport: "本周系统核心架构已完成 MD5 校验模块，整体进度超前 5%。但单元测试覆盖率在 `services/auth` 目录下偏低，需引起关注。"
  };

  return (
    <div className="min-h-screen bg-background p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* 顶部导航与项目标题 */}
        <div className="flex justify-between items-end border-b border-border pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2 italic">
              <Link href="/" className="hover:text-primary transition-colors">工作台</Link>
              <span>/</span>
              <Link href="/projects" className="hover:text-primary transition-colors">项目管理</Link>
              <span>/</span>
              <span className="text-foreground font-medium">{project.name}</span>
            </div>
            <div className="flex items-center gap-4">
              <h1 className="text-4xl font-bold italic tracking-tight font-serif">{project.name}</h1>
              <Badge variant="secondary" className="font-sans text-xs">
                {user?.role === 'Viewer' ? '只读模式' : '管理模式'}
              </Badge>
            </div>
          </div>
          <div className="flex gap-3">
            {canManage && (
              <Button variant="outline" className="gap-2">
                <Settings size={16} />
                项目设置
              </Button>
            )}
            <Button className="gap-2 bg-primary">
              <Sparkles size={16} />
              生成本周报表
            </Button>
          </div>
        </div>

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

          {/* 2. AI 项目简报 (ReportGenerationSkill) */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="paper-border bg-primary/5 border-primary/20 relative overflow-hidden">
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
               {[
                 { name: "需求文档_V1.pdf", size: "2.4MB", date: "2026-03-15" },
                 { name: "架构设计说明书.pdf", size: "4.1MB", date: "2026-04-01" },
                 { name: "接口协议定义.md", size: "120KB", date: "2026-04-10" }
               ].map((doc, i) => (
                 <Card key={i} className="paper-border group hover:border-primary/30 transition-all">
                    <CardContent className="p-4 flex gap-4 items-center">
                       <div className="w-10 h-10 bg-muted flex items-center justify-center rounded-sm shrink-0">
                          <FileText size={20} className="text-muted-foreground" />
                       </div>
                       <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate font-serif italic">{doc.name}</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold font-sans">
                            {doc.size} · {doc.date}
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
      </div>
    </div>
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

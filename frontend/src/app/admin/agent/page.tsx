"use client";

import React, { useState } from 'react';
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Terminal, 
  Settings2, 
  Wrench, 
  Cpu, 
  Play, 
  History, 
  Save, 
  RefreshCcw,
  Sparkles,
  Command,
  LayoutGrid
} from "lucide-react";

export default function AgentOrchestrationPage() {
  const [activeTab, setActiveTab] = useState('prompt');
  
  const [prompt, setPrompt] = useState(
    "你是一个专门为企业内部研发人员提供支持的 AI Copilot。你的回答必须严格基于上下文中的知识库文档。如果遇到不确定的内容，请明确告知用户并引用相关的原文路径。你的语气应当专业且严谨，优先展示代码片段和架构图关联。"
  );

  const [skills, setSkills] = useState([
    { id: 'health', name: 'ProjectHealthSkill', desc: '基于 Jira/Git 数据计算项目健康度', enabled: true },
    { id: 'report', name: 'ReportGenerationSkill', desc: '自动生成本周进展总结与风险点', enabled: true },
    { id: 'audit', name: 'AuditLogSkill', desc: '查询不可变审计日志表的变更历史', enabled: false },
    { id: 'mcp', name: 'MCP_OutlineTool', desc: '提取文档多级树状目录结构', enabled: true },
  ]);

  return (
    <div className="min-h-screen bg-background p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* 顶部 */}
        <div className="border-b border-border pb-6 flex justify-between items-end">
          <div className="space-y-1">
            <h1 className="text-3xl font-serif italic font-bold tracking-tight">页面 B：Agent 指令与工具编排</h1>
            <p className="text-muted-foreground italic text-sm">
              定义 Agent 的核心“人格”与能力边界：动态启用 Skill 并调整 System Prompt。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2 h-9 border-primary/20 bg-primary/5 text-primary">
              <History size={14} /> 恢复默认配置
            </Button>
            <Button size="sm" className="gap-2 h-9 bg-primary shadow-lg hover:shadow-primary/20">
              <Save size={14} /> 保存所有更改
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* 左侧：Prompt 编辑器 */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center gap-2 text-lg font-bold italic font-serif">
              <Terminal size={20} className="text-primary" />
              系统指令 (System Prompt)
            </div>
            
            <Card className="paper-border overflow-hidden">
               <CardHeader className="p-4 bg-muted/50 border-b border-border flex flex-row items-center justify-between">
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[10px] h-5 bg-white border-border">Markdown 支持</Badge>
                    <Badge variant="outline" className="text-[10px] h-5 bg-white border-border">版本: v2.4.1</Badge>
                  </div>
                  <div className="flex gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground items-center">
                    <LayoutGrid size={12} />
                    配置同步状态: <span className="text-green-600">已生效</span>
                  </div>
               </CardHeader>
               <CardContent className="p-0">
                  <textarea 
                    className="w-full min-h-[300px] p-8 font-serif italic leading-loose text-lg focus:outline-none bg-white text-foreground/80 resize-none"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                  <div className="bg-muted/30 p-4 border-t border-border flex justify-between items-center text-xs">
                     <div className="flex items-center gap-2 text-muted-foreground italic font-sans">
                        <Sparkles size={14} className="text-primary" />
                        AI 正在应用此指令对 Copilot 模块生效。
                     </div>
                     <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold gap-1 underline underline-offset-2">
                        查看实时效果预览 <Play size={10} />
                     </Button>
                  </div>
               </CardContent>
            </Card>
          </div>

          {/* 右侧：Skill 工具栏 */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-lg font-bold italic font-serif">
              <Wrench size={20} className="text-primary" />
              技能扩展 (Skills)
            </div>

            <ScrollArea className="h-[400px] w-full">
              <div className="space-y-4">
                {skills.map(skill => (
                  <Card key={skill.id} className={cn(
                    "paper-border transition-all cursor-pointer group hover:shadow-md",
                    !skill.enabled ? "opacity-50 grayscale" : "border-primary/10 shadow-sm"
                  )}>
                    <CardHeader className="p-4 flex flex-row items-start justify-between pb-2">
                       <div className="space-y-1">
                          <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <Cpu size={14} className={skill.enabled ? "text-primary" : "text-muted-foreground"} />
                            {skill.name}
                          </CardTitle>
                          <CardDescription className="text-[11px] font-sans italic leading-relaxed">
                            {skill.desc}
                          </CardDescription>
                       </div>
                       <div className="relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary">
                         <div className={cn(
                           "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform",
                           skill.enabled ? "translate-x-5" : "translate-x-0"
                         )} />
                       </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                       <div className="flex justify-end gap-2 pt-2 border-t border-border mt-2">
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] font-bold uppercase tracking-widest gap-1 hover:bg-primary/5">
                             测试调用 <Command size={10} />
                          </Button>
                       </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            {/* 提示：底层驱动说明 */}
            <Card className="paper-border bg-secondary/30">
               <CardContent className="p-4 flex items-start gap-3">
                  <Settings2 size={18} className="text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed italic font-serif">
                    “当前系统集成了 LangGraph 工作流。您对指令和工具的任何更改，都会在下次会话请求时实时挂载到后端 Agent 环境中。”
                  </p>
               </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from 'react';
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ShieldCheck, 
  EyeOff, 
  Lock, 
  AlertTriangle, 
  Search, 
  History, 
  FileSearch, 
  Activity,
  CheckCircle2,
  ChevronRight,
  ShieldAlert,
  UserCheck,
  Zap
} from "lucide-react";

export default function SecurityCenterPage() {
  const securityEvents = [
    { id: 1, type: "PII Detected", desc: "检出疑似身份证号", file: "HR_Export.csv", time: "2小时前", action: "Masked" },
    { id: 2, type: "Unauthorized Access", desc: "试图跨权限访问图谱节点", user: "viewer@example.com", time: "4小时前", action: "Blocked" },
    { id: 3, type: "Anomalous Query", desc: "短时间内大量请求核心密钥字段", user: "bot_service", time: "1天前", action: "Flagged" },
  ];

  return (
    <div className="min-h-screen bg-background p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* 顶部 */}
        <div className="border-b border-border pb-6 flex justify-between items-end">
          <div className="space-y-1">
            <h1 className="text-3xl font-serif italic font-bold tracking-tight">页面 D：安全合规与脱敏中心</h1>
            <p className="text-muted-foreground italic text-sm">
              企业级数据安全审计：自动识别 PII 敏感信息（脱敏）、监控异常行为并确保满足合规性标准。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2 h-9 border-primary/20 bg-primary/5 text-primary">
              <History size={14} /> 审计追踪流水
            </Button>
            <Button size="sm" className="gap-2 h-9 bg-primary shadow-lg hover:shadow-primary/20">
               <ShieldCheck size={14} /> 启动全库扫描
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* 左侧统计 */}
          <div className="lg:col-span-1 space-y-6">
            <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">合规看板 (Compliance)</div>
            
            <Card className="paper-border border-primary/20 bg-primary/5 p-6 space-y-4 shadow-sm">
               <div className="flex flex-col items-center justify-center text-center space-y-2">
                  <ShieldCheck size={48} className="text-primary opacity-60" />
                  <p className="text-2xl font-serif italic font-bold tracking-tighter">100%</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-sans">数据合规健康度</p>
               </div>
               <div className="pt-4 border-t border-border space-y-3">
                  <div className="flex justify-between items-center text-xs">
                     <span className="text-muted-foreground italic">PII 识别状态</span>
                     <Badge className="bg-green-500 text-[9px] px-1 h-4">Enabled</Badge>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                     <span className="text-muted-foreground italic">异常查询监控</span>
                     <Badge className="bg-green-500 text-[9px] px-1 h-4">Active</Badge>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                     <span className="text-muted-foreground italic">不当指令过滤 (Prompt Injection)</span>
                     <Badge className="bg-primary text-[9px] px-1 h-4">V3 Engaged</Badge>
                  </div>
               </div>
            </Card>

            <Card className="paper-border p-6 bg-white/50 relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-4">
                  <Zap size={24} className="text-primary opacity-10 group-hover:scale-125 transition-transform duration-500" />
               </div>
               <CardTitle className="text-sm font-bold italic font-serif flex items-center gap-2 mb-4">
                  <Lock size={14} className="text-primary" />
                  自动脱敏策略
               </CardTitle>
               <div className="space-y-2 text-[10px] font-bold uppercase tracking-tighter text-muted-foreground font-sans">
                  <div className="flex items-center gap-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-primary" /> 手机号/邮箱 (正则替换)
                  </div>
                  <div className="flex items-center gap-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-primary" /> 身份号码 (掩码映射)
                  </div>
                  <div className="flex items-center gap-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-primary" /> 内部测试 Token (实时截断)
                  </div>
               </div>
               <Button variant="link" className="p-0 h-auto text-xs mt-4 font-bold gap-1 underline underline-offset-2">
                  修改全局黑名单 <ChevronRight size={12} />
               </Button>
            </Card>
          </div>

          {/* 右侧事件流水 */}
          <div className="lg:col-span-3 space-y-6">
            <div className="flex items-center justify-between text-lg font-bold italic font-serif">
              <div className="flex items-center gap-2">
                <ShieldAlert size={20} className="text-destructive" />
                近期安全事件流水
              </div>
              <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-widest border-border text-muted-foreground">
                每 5 秒自动更新
              </Badge>
            </div>

            <Card className="paper-border">
               <CardContent className="p-0">
                  <ScrollArea className="h-[500px]">
                     <div className="divide-y divide-border">
                        {securityEvents.map(event => (
                           <div key={event.id} className="p-6 hover:bg-muted/30 transition-colors flex items-start justify-between group">
                              <div className="flex gap-4 items-start">
                                 <div className={cn(
                                   "w-10 h-10 rounded-sm flex items-center justify-center shrink-0 border border-border bg-white shadow-sm",
                                   event.type.includes('PII') ? "text-yellow-600" : "text-red-600"
                                 )}>
                                    {event.type.includes('PII') ? <EyeOff size={20} /> : <ShieldAlert size={20} />}
                                 </div>
                                 <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                       <span className="font-bold text-sm">{event.type}</span>
                                       <span className="text-[10px] text-muted-foreground opacity-50 uppercase tracking-widest font-bold font-sans">{event.time}</span>
                                    </div>
                                    <p className="text-sm italic font-serif font-bold text-foreground/80">{event.desc}</p>
                                    <div className="flex items-center gap-3 pt-2 text-xs font-sans">
                                       {event.file && <span className="flex items-center gap-1.5 text-muted-foreground border border-border px-2 py-0.5 rounded-sm"><FileSearch size={12} /> {event.file}</span>}
                                       {event.user && <span className="flex items-center gap-1.5 text-muted-foreground border border-border px-2 py-0.5 rounded-sm"><UserCheck size={12} /> {event.user}</span>}
                                    </div>
                                 </div>
                              </div>
                              <div className="flex flex-col items-end gap-3">
                                 <Badge variant="outline" className={cn(
                                   "text-[9px] font-bold px-2 h-5 border-none",
                                   event.action === 'Masked' ? "bg-green-100 text-green-700" : 
                                   event.action === 'Blocked' ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                                 )}>
                                    ACTION: {event.action.toUpperCase()}
                                 </Badge>
                                 <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold gap-1 underline underline-offset-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    查看取证详情 <ArrowRight size={10} />
                                 </Button>
                              </div>
                           </div>
                        ))}
                     </div>
                  </ScrollArea>
                  
                  {/* 底部合规声明 */}
                  <div className="bg-muted/20 p-6 border-t border-border">
                     <div className="flex items-center gap-4 text-xs font-serif italic text-muted-foreground">
                        <CheckCircle2 size={16} className="text-primary opacity-60" />
                        “所有 PII 识别算法均在企业本地化计算，不会将原始文本传输至外部 API 服务，符合 GDPR 与 CCPA 审计要求。”
                     </div>
                  </div>
               </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}

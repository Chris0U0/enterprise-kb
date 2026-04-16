"use client";

import React, { useState } from 'react';
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  BarChart3, 
  Database, 
  Cpu, 
  Zap, 
  ChevronRight, 
  MoreVertical, 
  Building2, 
  Coins,
  ArrowUpRight,
  TrendingDown,
  TrendingUp
} from "lucide-react";

export default function ResourceQuotaPage() {
  const departments = [
    { id: 1, name: "研发中心 (R&D)", storage: 45, tokens: 68, cost: "¥1,240.50", trend: 'up' },
    { id: 2, name: "财务部 (Finance)", storage: 12, tokens: 24, cost: "¥320.20", trend: 'down' },
    { id: 3, name: "人事部 (HR)", storage: 85, tokens: 42, cost: "¥890.00", trend: 'up' },
  ];

  return (
    <div className="min-h-screen bg-background p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* 顶部 */}
        <div className="border-b border-border pb-6 flex justify-between items-end">
          <div className="space-y-1">
            <h1 className="text-3xl font-serif italic font-bold tracking-tight">页面 C：数据隔离与资源配额</h1>
            <p className="text-muted-foreground italic text-sm">
              针对企业多部门租户（Multi-tenancy）的资源监控：管理存储上限与 LLM Token 计费。
            </p>
          </div>
          <div className="flex gap-3 items-center">
            <div className="text-right space-y-1 mr-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">总预算余额</p>
              <p className="text-2xl font-serif italic font-bold tracking-tighter">¥12,450.00</p>
            </div>
            <Button size="sm" className="gap-2 h-9 bg-primary">
              <Coins size={14} /> 充值额度
            </Button>
          </div>
        </div>

        {/* 概览统计 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="paper-border">
            <CardHeader className="p-6 pb-2">
               <div className="flex justify-between items-start mb-4">
                 <Badge variant="outline" className="bg-green-100 text-green-700 border-none">Healthy</Badge>
                 <Database size={16} className="text-primary/20" />
               </div>
               <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">总向量存储 (Milvus)</p>
            </CardHeader>
            <CardContent className="p-6 pt-0">
               <div className="flex items-baseline gap-2 mb-4">
                 <span className="text-4xl font-bold font-serif italic tracking-tighter">1.2</span>
                 <span className="text-sm font-bold opacity-30">M Vectors</span>
               </div>
               <Progress value={45} className="h-1.5 bg-muted" />
            </CardContent>
          </Card>

          <Card className="paper-border">
            <CardHeader className="p-6 pb-2">
               <div className="flex justify-between items-start mb-4">
                 <Badge variant="outline" className="bg-blue-100 text-blue-700 border-none">Average</Badge>
                 <Zap size={16} className="text-primary/20" />
               </div>
               <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">本月 LLM Token 消耗</p>
            </CardHeader>
            <CardContent className="p-6 pt-0">
               <div className="flex items-baseline gap-2 mb-4">
                 <span className="text-4xl font-bold font-serif italic tracking-tighter">85.4</span>
                 <span className="text-sm font-bold opacity-30">M Tokens</span>
               </div>
               <Progress value={68} className="h-1.5 bg-muted" />
            </CardContent>
          </Card>

          <Card className="paper-border border-primary/20 bg-primary/5">
             <CardHeader className="p-6">
                <div className="flex justify-between items-start mb-2">
                   <CardTitle className="text-lg font-serif italic flex items-center gap-2">
                      <BarChart3 size={18} className="text-primary" />
                      部门分摊看板
                   </CardTitle>
                </div>
                <CardDescription className="text-xs italic leading-relaxed font-serif">
                  “研发中心消耗了本月 60% 的向量库写入配额，主要源于核心代码库的深度索引。”
                </CardDescription>
             </CardHeader>
          </Card>
        </div>

        {/* 部门列表 */}
        <Card className="paper-border">
          <CardHeader>
             <CardTitle className="text-xl font-serif italic">各部门资源配额状态</CardTitle>
             <CardDescription className="text-xs">支持隔离每个部门的向量库租户空间 (Collection Namespace)。</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
             <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-muted text-muted-foreground uppercase text-[10px] font-bold tracking-widest border-b border-border">
                   <tr>
                      <th className="px-6 py-4 font-bold">部门名称</th>
                      <th className="px-6 py-4 font-bold">存储空间 (%)</th>
                      <th className="px-6 py-4 font-bold">Token 消耗 (%)</th>
                      <th className="px-6 py-4 font-bold">产生费用</th>
                      <th className="px-6 py-4 text-right">操作</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-border">
                   {departments.map(dept => (
                      <tr key={dept.id} className="hover:bg-muted/30 transition-colors cursor-pointer group">
                         <td className="px-6 py-4 flex items-center gap-3">
                            <Building2 size={16} className="text-muted-foreground" />
                            <span className="font-serif italic font-bold">{dept.name}</span>
                         </td>
                         <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                               <Progress value={dept.storage} className="h-1 w-24 bg-muted" />
                               <span className="text-[10px] font-bold font-mono opacity-50">{dept.storage}%</span>
                            </div>
                         </td>
                         <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                               <Progress value={dept.tokens} className="h-1 w-24 bg-muted" />
                               <span className="text-[10px] font-bold font-mono opacity-50">{dept.tokens}%</span>
                            </div>
                         </td>
                         <td className="px-6 py-4">
                            <div className="flex flex-col gap-0.5">
                               <span className="font-serif italic font-bold">{dept.cost}</span>
                               <span className={cn(
                                 "flex items-center gap-1 text-[9px] font-bold uppercase",
                                 dept.trend === 'up' ? "text-red-600" : "text-green-600"
                               )}>
                                 {dept.trend === 'up' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                 较上周 {dept.trend === 'up' ? '增长' : '下降'} 4.2%
                               </span>
                            </div>
                         </td>
                         <td className="px-6 py-4 text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                               <ArrowUpRight size={16} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                               <MoreVertical size={16} />
                            </Button>
                         </td>
                      </tr>
                   ))}
                </tbody>
             </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

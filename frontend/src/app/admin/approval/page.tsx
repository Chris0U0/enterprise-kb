"use client";

import React, { useState } from 'react';
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { AppPage, PageHeader } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  CheckCircle2, 
  XCircle, 
  Eye, 
  FileText, 
  User, 
  Clock, 
  AlertCircle,
  ArrowRight,
  Filter
} from "lucide-react";

export default function IngestionApprovalPage() {
  const pathname = usePathname();
  const [items, setItems] = useState([
    { id: 1, name: "2026年Q1财务预算.xlsx", uploader: "张财务", size: "2.4MB", time: "2026-04-16 10:00", status: "pending", risk: "low" },
    { id: 2, name: "核心代码逻辑V3_说明.pdf", uploader: "李开发", size: "890KB", time: "2026-04-16 11:30", status: "pending", risk: "high" },
    { id: 3, name: "员工手册2026版.docx", uploader: "王人事", size: "5.1MB", time: "2026-04-15 16:20", status: "approved", risk: "none" },
  ]);

  return (
    <AppPage maxWidth="6xl" surface="canvas">
      <PageHeader
        title="知识入库审批"
        description='针对企业核心敏感文档的「人机协同」验证：只有经过审批的文档才会被向量化并加入 RAG 检索。'
        breadcrumbs={breadcrumbsFromPathname(pathname)}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2" type="button">
              <Filter size={14} /> 筛选状态
            </Button>
            <Badge className="h-7 border-primary/20 bg-primary/10 px-3 text-primary">
              2 个待处理
            </Badge>
          </div>
        }
      />

        {/* 审批列表 */}
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={item.id} className={cn(
              "paper-border transition-all group overflow-hidden",
              item.status === 'pending' ? "border-l-4 border-l-primary" : ""
            )}>
              <CardContent className="p-0">
                <div className="flex items-center p-6 gap-6">
                  {/* 文件图标 */}
                  <div className="w-12 h-12 bg-muted flex items-center justify-center rounded-sm shrink-0">
                    <FileText className="text-muted-foreground" size={24} />
                  </div>

                  {/* 核心信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-lg font-serif italic font-bold truncate">{item.name}</h3>
                      <Badge variant="outline" className={cn(
                        "text-[10px] px-1.5 h-4 border-none",
                        item.risk === 'high' ? "bg-red-100 text-red-700" : 
                        item.risk === 'low' ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
                      )}>
                        风险级别: {item.risk.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground uppercase tracking-widest font-bold">
                      <span className="flex items-center gap-1"><User size={12} /> {item.uploader}</span>
                      <span className="flex items-center gap-1"><Clock size={12} /> {item.time}</span>
                      <span>{item.size}</span>
                    </div>
                  </div>

                  {/* 操作区 */}
                  <div className="flex gap-2">
                    {item.status === 'pending' ? (
                      <>
                        <Button variant="outline" size="sm" className="gap-2 h-9 border-destructive text-destructive hover:bg-destructive/5">
                          <XCircle size={14} /> 拒绝
                        </Button>
                        <Button size="sm" className="gap-2 h-9 bg-primary">
                          <CheckCircle2 size={14} /> 准许入库
                        </Button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-green-600 text-sm font-bold italic font-serif">
                        <CheckCircle2 size={18} /> 已生效
                      </div>
                    )}
                    <Button variant="ghost" size="icon" className="h-9 w-9 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Eye size={18} />
                    </Button>
                  </div>
                </div>

                {/* 风险详情提示 (如果是高风险) */}
                {item.risk === 'high' && item.status === 'pending' && (
                  <div className="bg-red-50/50 p-4 border-t border-red-100 flex items-start gap-3">
                    <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-red-800 uppercase tracking-tighter">AI 预警建议：敏感信息检出</p>
                      <p className="text-xs text-red-700/80 leading-relaxed font-sans">
                        文档中包含多个“系统密钥”和“数据库连接串”的疑似片段。建议在入库前进入“脱敏中心”进行处理，否则可能导致安全隐患。
                      </p>
                      <Button variant="link" className="p-0 h-auto text-xs text-red-800 font-bold gap-1 underline underline-offset-2">
                        前往脱敏处理 <ArrowRight size={10} />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 底部空状态或更多 */}
        <div className="text-center pt-8 opacity-40 italic font-serif text-sm">
          -- 所有审批记录均已同步至不可变审计日志 --
        </div>
    </AppPage>
  );
}

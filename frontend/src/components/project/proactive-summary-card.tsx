"use client";

import { useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

type Props = {
  /** 周摘要 / 里程碑摘要正文 */
  body: string;
  title?: string;
  subtitle?: string;
};

/**
 * 主动摘要：进展 + 风险 + 待办建议（与报告/健康度对齐；此处为交互占位）
 */
export function ProactiveSummaryCard({
  body,
  title = "AI 项目简报（本周）",
  subtitle = "由 ReportGenerationSkill / 调度任务生成，可对接后端刷新",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState(body);

  const refresh = () => {
    setLoading(true);
    setTimeout(() => {
      setText(
        `${body}\n\n【刷新后追加】已根据最新文档变更重新汇总风险与建议（Mock）。`
      );
      setLoading(false);
    }, 1200);
  };

  return (
    <Card className="paper-border bg-primary/5 border-primary/20 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-30">
        <Sparkles size={24} className="text-primary" />
      </div>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-lg font-serif italic flex items-center gap-2">
            <FileText size={18} className="text-primary" />
            {title}
          </CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          type="button"
          disabled={loading}
          onClick={refresh}
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {loading ? "生成中…" : "刷新摘要"}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="bg-white/80 p-6 border border-primary/10 rounded-sm font-sans leading-[1.8] text-sm shadow-sm min-h-[120px] whitespace-pre-wrap">
          {text}
        </div>
      </CardContent>
    </Card>
  );
}

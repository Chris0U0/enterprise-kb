"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { AppPage, PageHeader, PageToolbar } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { getProjectDisplayName } from "@/lib/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquareText, Search, ChevronRight } from "lucide-react";

const MOCK_SESSIONS = [
  {
    id: "sess-001",
    question: "MD5 校验模块与审计日志如何关联？",
    preview: "根据《需求文档V2》第 4 节，系统应在写入审计表时同步记录文件哈希…",
    user: "张三",
    time: "2026-04-16 14:22",
    citations: 3,
  },
  {
    id: "sess-002",
    question: "灰度发布阶段有哪些风险点？",
    preview: "ReportGenerationSkill 识别到 2 条中级风险，涉及测试覆盖率与老旧文档签名…",
    user: "李四",
    time: "2026-04-16 11:05",
    citations: 5,
  },
];

export default function ProjectQaListPage() {
  const params = useParams();
  const pathname = usePathname();
  const id = params.id as string;
  const name = getProjectDisplayName(id);

  const breadcrumbs = breadcrumbsFromPathname(pathname, {
    segmentLabels: { [`/projects/${id}`]: name },
  });

  return (
    <AppPage surface="canvas">
      <PageHeader
        title="问答记录"
        description="本项目内的检索问答与 Copilot 会话留痕，支持审计与追溯（数据待对接 audit_logs / 专用会话表）。"
        breadcrumbs={breadcrumbs}
      />

      <PageToolbar>
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="按问题、操作人搜索…"
            className="pl-9"
            aria-label="搜索问答记录"
          />
        </div>
        <Button variant="outline" size="sm" type="button">
          导出 CSV
        </Button>
      </PageToolbar>

      <div className="space-y-3">
        {MOCK_SESSIONS.map((row) => (
          <Link key={row.id} href={`/projects/${id}/qa/${row.id}`}>
            <Card className="paper-border transition-colors hover:border-primary/40">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <MessageSquareText className="h-4 w-4 shrink-0 text-primary" />
                    <span className="font-medium">{row.question}</span>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {row.preview}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{row.user}</span>
                    <span>·</span>
                    <span>{row.time}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      引用 {row.citations} 条
                    </Badge>
                  </div>
                </div>
                <ChevronRight className="hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </AppPage>
  );
}

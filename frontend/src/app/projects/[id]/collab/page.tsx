"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { AppPage, PageHeader, PageToolbar } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { getProjectDisplayName } from "@/lib/project";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { UsersRound, Plus, Sheet, FileEdit, ChevronRight } from "lucide-react";

const MOCK = [
  {
    id: "doc-spec-01",
    kind: "doc" as const,
    title: "联调清单（协作文档）",
    editor: "张三",
    updated: "2026-04-16 09:12",
    status: "编辑中",
  },
  {
    id: "sheet-risk-02",
    kind: "sheet" as const,
    title: "风险登记协作表",
    editor: "李四",
    updated: "2026-04-15 16:40",
    status: "已发布",
  },
];

export default function ProjectCollabListPage() {
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
        title="协作空间"
        description="项目内协作文档与表格；MVP 可先实现版本保存与最后编辑人，实时协同后续再接 Yjs / WebSocket。"
        breadcrumbs={breadcrumbs}
        actions={
          <Button className="gap-2" type="button">
            <Plus size={16} />
            新建
          </Button>
        }
      />

      <PageToolbar end={<span className="text-xs text-muted-foreground">文档与表格统一入口</span>} />

      <div className="space-y-3">
        {MOCK.map((row) => (
          <Link key={row.id} href={`/projects/${id}/collab/${row.id}`}>
            <Card className="paper-border transition-colors hover:border-primary/40">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 rounded-sm bg-primary/10 p-2 text-primary">
                    {row.kind === "doc" ? (
                      <FileEdit className="h-5 w-5" />
                    ) : (
                      <Sheet className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{row.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.kind === "doc" ? "协作文档" : "协作表格"} · 最近编辑{" "}
                      {row.editor} · {row.updated}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {row.status}
                  </Badge>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="paper-border border-dashed bg-muted/20">
        <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm text-muted-foreground">
          <UsersRound className="h-5 w-5 shrink-0 text-primary" />
          <span>
            并发展示「在线成员」与冲突提示需后端协同通道；当前为布局与路由占位。
          </span>
        </CardContent>
      </Card>
    </AppPage>
  );
}

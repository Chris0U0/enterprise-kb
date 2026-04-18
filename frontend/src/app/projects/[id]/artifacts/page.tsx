"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { AppPage, PageHeader, PageToolbar } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { getProjectDisplayName } from "@/lib/project";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table2, GitBranch, FileJson, Plus } from "lucide-react";

const MOCK = [
  {
    id: "art-arch-01",
    title: "服务划分与部署架构表",
    type: "table" as const,
    version: "v3",
    updated: "2026-04-14",
  },
  {
    id: "art-flow-02",
    title: "文档入库审批流程图",
    type: "diagram" as const,
    version: "v1",
    updated: "2026-04-12",
  },
  {
    id: "art-api-03",
    title: "对外 API 契约快照",
    type: "export" as const,
    version: "v2",
    updated: "2026-04-10",
  },
];

function TypeIcon({ type }: { type: (typeof MOCK)[0]["type"] }) {
  if (type === "table") return <Table2 className="h-5 w-5" />;
  if (type === "diagram") return <GitBranch className="h-5 w-5" />;
  return <FileJson className="h-5 w-5" />;
}

function typeLabel(type: (typeof MOCK)[0]["type"]) {
  if (type === "table") return "架构表";
  if (type === "diagram") return "流程图";
  return "导出/快照";
}

export default function ProjectArtifactsPage() {
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
        title="产出物"
        description="架构表、流程图、自动导出物等统一归档；后续对接 Artifact 存储与版本号。"
        breadcrumbs={breadcrumbs}
        actions={
          <Button className="gap-2" type="button">
            <Plus size={16} />
            新建产出物
          </Button>
        }
      />

      <PageToolbar end={<span className="text-xs text-muted-foreground">共 {MOCK.length} 项</span>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MOCK.map((item) => (
          <Link key={item.id} href={`/projects/${id}/artifacts/${item.id}`}>
            <Card className="paper-border h-full transition-all hover:border-primary/40 hover:shadow-md">
              <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-primary">
                    <TypeIcon type={item.type} />
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {typeLabel(item.type)}
                  </Badge>
                </div>
                <CardTitle className="font-serif text-base italic leading-snug">
                  {item.title}
                </CardTitle>
                <CardDescription className="text-xs">
                  {item.version} · 更新 {item.updated}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                点击进入详情预览与版本历史（占位）
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </AppPage>
  );
}

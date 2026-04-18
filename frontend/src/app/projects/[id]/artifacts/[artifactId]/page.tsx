"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { AppPage, PageHeader } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { getProjectDisplayName } from "@/lib/project";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, History } from "lucide-react";

export default function ProjectArtifactDetailPage() {
  const params = useParams();
  const pathname = usePathname();
  const id = params.id as string;
  const artifactId = params.artifactId as string;
  const name = getProjectDisplayName(id);

  const breadcrumbs = breadcrumbsFromPathname(pathname, {
    segmentLabels: {
      [`/projects/${id}`]: name,
      [`/projects/${id}/artifacts/${artifactId}`]: "产出物详情",
    },
  });

  return (
    <AppPage surface="canvas">
      <PageHeader
        title="产出物详情"
        description={`ID：${artifactId}`}
        breadcrumbs={breadcrumbs}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" type="button">
              <History size={14} />
              版本历史
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/projects/${id}/artifacts`}>
                <ArrowLeft size={14} />
                返回列表
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="paper-border lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="font-serif text-lg italic">预览区</CardTitle>
            <Badge>架构表 / 流程图 JSON / 富文本 渲染占位</Badge>
          </CardHeader>
          <CardContent>
            <div className="flex min-h-[280px] items-center justify-center rounded-sm border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
              接入后在此渲染表格、React Flow 只读图或导出预览
            </div>
          </CardContent>
        </Card>

        <Card className="paper-border">
          <CardHeader>
            <CardTitle className="text-base font-serif italic">元数据</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <span className="text-foreground">project_id</span> · {id}
            </p>
            <p>
              <span className="text-foreground">artifact_id</span> · {artifactId}
            </p>
            <p className="pt-2 text-xs leading-relaxed">
              与后端 <code className="rounded bg-muted px-1">Artifact</code>{" "}
              模型对齐后可展示版本、创建人、存储路径（MinIO）等。
            </p>
          </CardContent>
        </Card>
      </div>
    </AppPage>
  );
}

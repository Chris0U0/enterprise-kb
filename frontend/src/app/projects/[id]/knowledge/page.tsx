"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { AppPage, PageHeader } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { getProjectDisplayName } from "@/lib/project";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Library, ArrowRight, FolderOpen } from "lucide-react";

export default function ProjectKnowledgePage() {
  const params = useParams();
  const pathname = usePathname();
  const id = params.id as string;
  const name = getProjectDisplayName(id);

  const breadcrumbs = breadcrumbsFromPathname(pathname, {
    segmentLabels: {
      [`/projects/${id}`]: name,
      [`/projects/${id}/knowledge`]: "本项目知识库",
    },
  });

  return (
    <AppPage surface="canvas">
      <PageHeader
        title="本项目知识库"
        description="查看与管理归属当前项目的文档与向量分区；与全局「知识库管理」联动。"
        breadcrumbs={breadcrumbs}
        actions={
          <Button asChild className="gap-2">
            <Link href={`/knowledge?projectId=${encodeURIComponent(id)}`}>
              <FolderOpen size={16} />
              打开全局知识库
              <ArrowRight size={14} />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="paper-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-lg italic">
              <Library className="h-5 w-5 text-primary" />
              接入说明
            </CardTitle>
            <CardDescription>
              后续接入后端后，此处可展示仅当前项目的文档列表、解析状态与检索分区；也可嵌入全局知识库的筛选视图。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-relaxed">
            推荐接口：`GET /api/v1/documents?project_id=…`；上传时携带项目上下文，与 `Document` 模型对齐。
          </CardContent>
        </Card>

        <Card className="paper-border border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base font-serif italic">快捷跳转</CardTitle>
            <CardDescription>在全局知识库中按项目筛选（查询参数占位）。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild className="w-full sm:w-auto">
              <Link href={`/knowledge?projectId=${encodeURIComponent(id)}`}>
                前往知识库管理（projectId={id}）
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppPage>
  );
}

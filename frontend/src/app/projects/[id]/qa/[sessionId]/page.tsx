"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { AppPage, PageHeader } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { getProjectDisplayName } from "@/lib/project";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText } from "lucide-react";

export default function ProjectQaSessionPage() {
  const params = useParams();
  const pathname = usePathname();
  const id = params.id as string;
  const sessionId = params.sessionId as string;
  const name = getProjectDisplayName(id);

  const breadcrumbs = breadcrumbsFromPathname(pathname, {
    segmentLabels: {
      [`/projects/${id}`]: name,
      [`/projects/${id}/qa/${sessionId}`]: "会话详情",
    },
  });

  return (
    <AppPage surface="canvas">
      <PageHeader
        title="问答详情"
        description={`会话 ID：${sessionId}`}
        breadcrumbs={breadcrumbs}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${id}/qa`}>
              <ArrowLeft size={14} />
              返回列表
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="paper-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-serif text-lg italic">问题</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed">
            <p className="font-medium">
              MD5 校验模块与审计日志如何关联？
            </p>
            <div className="rounded-sm border border-border bg-muted/30 p-4">
              <p className="text-muted-foreground">
                （此处对接流式检索与最终答案正文；可展示引用片段与 Agent 轨迹。）
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="paper-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-serif italic">
              <FileText size={18} />
              引用来源
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>· 《需求文档V2.pdf》 第 4 节</p>
            <p>· 《安全合规指南.md》 2.1</p>
            <p>· DocSection 溯源字段占位</p>
          </CardContent>
        </Card>
      </div>
    </AppPage>
  );
}

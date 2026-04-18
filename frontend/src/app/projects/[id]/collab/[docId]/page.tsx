"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { AppPage, PageHeader } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { getProjectDisplayName } from "@/lib/project";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Save } from "lucide-react";

export default function ProjectCollabDocPage() {
  const params = useParams();
  const pathname = usePathname();
  const id = params.id as string;
  const docId = params.docId as string;
  const name = getProjectDisplayName(id);

  const breadcrumbs = breadcrumbsFromPathname(pathname, {
    segmentLabels: {
      [`/projects/${id}`]: name,
      [`/projects/${id}/collab/${docId}`]: "协作文档",
    },
  });

  return (
    <AppPage surface="canvas">
      <PageHeader
        title="协作文档 / 表格"
        description={`资源 ID：${docId}`}
        breadcrumbs={breadcrumbs}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-2" type="button">
              <Save size={14} />
              保存草稿
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/projects/${id}/collab`}>
                <ArrowLeft size={14} />
                返回
              </Link>
            </Button>
          </div>
        }
      />

      <Card className="paper-border">
        <CardContent className="min-h-[360px] p-6">
          <div className="flex h-full min-h-[300px] flex-col rounded-sm border border-dashed border-border bg-background">
            <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
              编辑器占位：可集成 Tiptap / Handsontable，配合乐观锁与版本号
            </div>
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
              正文编辑区域
            </div>
          </div>
        </CardContent>
      </Card>
    </AppPage>
  );
}

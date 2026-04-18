"use client";

import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectOnboardingFlags } from "@/data/project-registry";
import { cn } from "@/lib/utils";
import { withProjectQuery } from "@/lib/project-links";

const STEPS: {
  key: keyof ProjectOnboardingFlags;
  label: string;
  desc: string;
  href: (projectId: string) => string;
}[] = [
  {
    key: "hasUploadedDoc",
    label: "上传文档",
    desc: "将需求与设计资料入库",
    href: (id) => `/projects/${id}/knowledge`,
  },
  {
    key: "hasIndexedKnowledge",
    label: "知识库就绪",
    desc: "完成解析与向量索引",
    href: (id) => withProjectQuery("/knowledge", id),
  },
  {
    key: "hasTriedQa",
    label: "试问答",
    desc: "在研读室验证检索效果",
    href: (id) => withProjectQuery("/copilot", id),
  },
  {
    key: "hasViewedRiskOrReport",
    label: "看风险 / 报告",
    desc: "跟进健康度与周报",
    href: (id) => `/projects/${id}`,
  },
];

export function ProjectOnboarding({
  projectId,
  flags,
  className,
}: {
  projectId: string;
  flags: ProjectOnboardingFlags;
  className?: string;
}) {
  const doneCount = STEPS.filter((s) => flags[s.key]).length;

  return (
    <Card className={cn("paper-border border-dashed border-primary/25 bg-muted/20", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-serif italic">
          建议步骤 · 新成员上手
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          完成度 {doneCount}/{STEPS.length}（示例数据，接入 API 后按真实状态更新）
        </p>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 sm:grid-cols-2">
          {STEPS.map((step, i) => {
            const ok = flags[step.key];
            return (
              <li key={step.key}>
                <Link
                  href={step.href(projectId)}
                  className={cn(
                    "flex gap-3 rounded-sm border border-border/80 bg-background p-3 transition-colors hover:border-primary/40 hover:bg-primary/5",
                    ok && "border-primary/20 bg-primary/5"
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {ok ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {i + 1}. {step.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{step.desc}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

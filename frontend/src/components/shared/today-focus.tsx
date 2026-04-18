"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bot,
  CheckSquare,
  FileWarning,
  Inbox,
  ListTodo,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "./empty-state";

/** 事项来源：AI 与管理者下派并存 */
export type FocusOrigin = "ai" | "manager" | "system";

export type FocusItem = {
  id: string;
  type: "task" | "approval" | "risk" | "deadline";
  /** 未标注时列表里按 AI 展示，兼容旧数据 */
  source?: FocusOrigin;
  title: string;
  projectName: string;
  projectHref: string;
  actionHref: string;
  actionLabel: string;
  assignee?: string;
  dueHint?: string;
};

const typeIcon = {
  task: ListTodo,
  approval: FileWarning,
  risk: AlertCircle,
  deadline: CheckSquare,
} as const;

function SourceBadge({ source }: { source?: FocusOrigin }) {
  const s = source ?? "ai";
  if (s === "manager") {
    return (
      <Badge
        variant="outline"
        className="border-primary/40 bg-primary/10 text-[10px] font-bold uppercase tracking-wide text-primary"
      >
        <UserCog className="mr-1 h-3 w-3" aria-hidden />
        管理者下派
      </Badge>
    );
  }
  if (s === "system") {
    return (
      <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wide">
        系统
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-border text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
      <Bot className="mr-1 h-3 w-3" aria-hidden />
      AI 洞察
    </Badge>
  );
}

export function TodayFocus({
  items,
  className,
  headerExtra,
}: {
  items: FocusItem[];
  className?: string;
  /** 例如「下派任务」按钮，仅管理者可见 */
  headerExtra?: ReactNode;
}) {
  return (
    <Card className={cn("paper-border border-primary/20 bg-primary/5", className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="font-serif text-lg italic">今日聚焦</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              AI 自动汇总与管理者下派任务统一展示，点击可进入项目或处理页
            </p>
          </div>
          {headerExtra ? (
            <div className="flex shrink-0 flex-wrap gap-2">{headerExtra}</div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="暂无待办"
            description="管理者可下派任务；也可从项目与知识库产生 AI 摘要事项。"
            actionLabel="前往项目管理"
            actionHref="/projects"
          />
        ) : (
          items.map((item) => {
            const Icon = typeIcon[item.type];
            return (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-sm border border-border/80 bg-background/80 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 gap-3">
                  <div className="mt-0.5 shrink-0 text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <SourceBadge source={item.source} />
                    </div>
                    <p className="text-sm font-medium leading-snug">{item.title}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        项目{" "}
                        <Link
                          href={item.projectHref}
                          className="font-medium text-primary hover:underline"
                        >
                          {item.projectName}
                        </Link>
                      </span>
                      {item.assignee ? (
                        <span>负责人：{item.assignee}</span>
                      ) : null}
                      {item.dueHint ? <span>{item.dueHint}</span> : null}
                    </div>
                  </div>
                </div>
                <Button size="sm" className="shrink-0 self-start sm:self-center" asChild>
                  <Link href={item.actionHref}>{item.actionLabel}</Link>
                </Button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import * as Dialog from "@radix-ui/react-dialog";
import { ListTodo, PackageOpen, Link2, X } from "lucide-react";
import { TaskAssignDialog } from "@/components/shared/task-assign-dialog";
import type { FocusItem } from "@/components/shared/today-focus";
import { projectPath } from "@/lib/project-links";

type ProjectOption = { id: string; name: string };

export function AnswerActions({
  projectId,
  projects,
  defaultSnippet,
  onAssignTask,
}: {
  projectId: string;
  projects: ProjectOption[];
  /** 从回答摘要预填任务标题 */
  defaultSnippet: string;
  onAssignTask?: (item: FocusItem) => void;
}) {
  const [taskOpen, setTaskOpen] = useState(false);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [collabOpen, setCollabOpen] = useState(false);

  const taskTitle =
    defaultSnippet.length > 60
      ? `${defaultSnippet.slice(0, 57)}…`
      : defaultSnippet;

  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={() => setTaskOpen(true)}
      >
        <ListTodo size={14} />
        转为任务
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={() => setArtifactOpen(true)}
      >
        <PackageOpen size={14} />
        插入产出物
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={() => setCollabOpen(true)}
      >
        <Link2 size={14} />
        引用到协作文档
      </Button>

      <TaskAssignDialog
        projects={projects}
        onAssign={(item) => {
          onAssignTask?.(item);
          setTaskOpen(false);
        }}
        open={taskOpen}
        onOpenChange={setTaskOpen}
        hideTrigger
        initialTitle={taskTitle}
        defaultProjectId={projectId}
      />

      <Dialog.Root open={artifactOpen} onOpenChange={setArtifactOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(calc(100vw-2rem),24rem)] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-background p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <Dialog.Title className="font-serif text-base font-semibold italic">
                插入产出物
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" type="button" aria-label="关闭">
                  <X size={16} />
                </Button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              将当前回答摘要保存为「架构表 / 流程图 / 导出快照」类产出物（对接{" "}
              <code className="rounded bg-muted px-1 text-xs">POST /artifacts</code>）。
            </Dialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" type="button" className="text-xs" asChild>
                <a href={projectPath(projectId, "artifacts")}>打开产出物列表</a>
              </Button>
              <Button type="button" className="text-xs" onClick={() => setArtifactOpen(false)}>
                知道了
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={collabOpen} onOpenChange={setCollabOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(calc(100vw-2rem),24rem)] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-background p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <Dialog.Title className="font-serif text-base font-semibold italic">
                引用到协作文档
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" type="button" aria-label="关闭">
                  <X size={16} />
                </Button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              演示：将引用块写入 Markdown 引用格式并复制到剪贴板；接入后可调用协作文档 API 插入块。
            </Dialog.Description>
            <Button
              type="button"
              className="mt-4 w-full text-xs"
              onClick={() => {
                const md = `> 引用自 Copilot\n> ${defaultSnippet.slice(0, 200)}…\n`;
                void navigator.clipboard?.writeText(md);
                setCollabOpen(false);
              }}
            >
              复制 Markdown 引用
            </Button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

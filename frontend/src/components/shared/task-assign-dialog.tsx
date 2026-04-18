"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FocusItem } from "./today-focus";

type ProjectOption = { id: number; name: string };

export function TaskAssignDialog({
  projects,
  onAssign,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger,
  initialTitle,
  defaultProjectId,
}: {
  projects: ProjectOption[];
  onAssign: (item: FocusItem) => void;
  /** 受控模式（如从问答「转为任务」打开） */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  initialTitle?: string;
  defaultProjectId?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [projectId, setProjectId] = useState(String(projects[0]?.id ?? 1));
  const [dueHint, setDueHint] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initialTitle) setTitle(initialTitle);
    if (defaultProjectId) setProjectId(defaultProjectId);
  }, [open, initialTitle, defaultProjectId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const pid = Number(projectId);
    const proj = projects.find((p) => p.id === pid) ?? projects[0];
    if (!proj) return;

    const item: FocusItem = {
      id: `mgr-${Date.now()}`,
      type: "task",
      source: "manager",
      title: t,
      projectName: proj.name,
      projectHref: `/projects/${proj.id}`,
      actionHref: `/projects/${proj.id}`,
      actionLabel: "去处理",
      assignee: assignee.trim() || undefined,
      dueHint: dueHint.trim() || undefined,
    };
    onAssign(item);
    setOpen(false);
    setTitle("");
    setAssignee("");
    setDueHint("");
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {!hideTrigger ? (
        <Dialog.Trigger asChild>
          <Button variant="outline" size="sm" className="gap-2 font-sans" type="button">
            <Send size={14} />
            下派任务
          </Button>
        </Dialog.Trigger>
      ) : null}
      <Dialog.Portal>
        <Dialog.Overlay
          className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40"
        />
        <Dialog.Content
          className={cn(
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "fixed left-[50%] top-[50%] z-50 w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-background p-0 shadow-lg"
          )}
        >
          <form onSubmit={handleSubmit}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <Dialog.Title className="font-serif text-lg font-semibold italic">
                下派任务
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" type="button" aria-label="关闭">
                  <X size={16} />
                </Button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              填写任务标题、负责人与归属项目，将发布到今日聚焦与项目待办（演示为前端状态）。
            </Dialog.Description>

            <div className="space-y-4 px-4 py-4">
              <div className="space-y-1.5">
                <label htmlFor="task-title" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  任务标题 <span className="text-destructive">*</span>
                </label>
                <Input
                  id="task-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：本周五前补齐接口联调清单"
                  className="font-sans"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="task-assignee" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  负责人（可选）
                </label>
                <Input
                  id="task-assignee"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="姓名或 @邮箱"
                  className="font-sans"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="task-project" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  归属项目
                </label>
                <select
                  id="task-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="flex h-10 w-full rounded-sm border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="task-due" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  时间要求（可选）
                </label>
                <Input
                  id="task-due"
                  value={dueHint}
                  onChange={(e) => setDueHint(e.target.value)}
                  placeholder="例如：2026-04-20 前"
                  className="font-sans"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <Dialog.Close asChild>
                <Button variant="outline" type="button">
                  取消
                </Button>
              </Dialog.Close>
              <Button type="submit" className="gap-2">
                <Send size={14} />
                发布到聚焦区
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

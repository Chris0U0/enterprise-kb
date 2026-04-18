"use client";

import { cn } from "@/lib/utils";
import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { AppPage, PageHeader, PageToolbar } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FolderKanban,
  Search,
  Plus,
  ArrowRight,
  Clock,
  Users,
  FileText,
  LayoutGrid,
  List,
  Loader2,
  X,
} from "lucide-react";
import { useProjectList, type ProjectListItemApi } from "@/hooks/use-project-list";
import { apiFetchJson } from "@/lib/api-client";

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}

export default function ProjectsListPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { items, total, loading, error, refetch } = useProjectList(debouncedQ);

  const filteredForDisplay = useMemo(() => items, [items]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setCreateError("请输入项目名称");
      return;
    }
    setCreateError("");
    setCreating(true);
    try {
      const created = await apiFetchJson<{ id: string }>("/projects", {
        method: "POST",
        json: { name, description: "" },
      });
      setCreateOpen(false);
      setNewName("");
      await refetch();
      router.push(`/projects/${created.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppPage>
      <PageHeader
        title="所有项目看板"
        icon={<FolderKanban className="h-9 w-9 text-primary/60" />}
        breadcrumbs={breadcrumbsFromPathname("/projects")}
        actions={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full min-w-0 sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索项目名称或描述..."
                className="h-11 border-border bg-white pl-10 font-sans shadow-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="搜索项目"
              />
            </div>
            <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
              <Dialog.Trigger asChild>
                <Button className="h-11 gap-2 bg-primary px-6 text-xs font-bold uppercase tracking-widest text-primary-foreground shadow-lg">
                  <Plus size={18} />
                  新建项目
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(calc(100vw-2rem),24rem)] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-background p-4 shadow-lg">
                  <div className="flex items-start justify-between gap-2">
                    <Dialog.Title className="font-serif text-base font-semibold italic">新建项目</Dialog.Title>
                    <Dialog.Close asChild>
                      <button type="button" className="rounded-sm p-1 hover:bg-muted" aria-label="关闭">
                        <X size={16} />
                      </button>
                    </Dialog.Close>
                  </div>
                  <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                    将调用后端 <code className="text-[10px]">POST /api/v1/projects</code>
                  </Dialog.Description>
                  <div className="mt-4 space-y-3">
                    <Input
                      placeholder="项目名称"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="h-10"
                    />
                    {createError ? <p className="text-xs text-destructive">{createError}</p> : null}
                    <div className="flex justify-end gap-2">
                      <Dialog.Close asChild>
                        <Button type="button" variant="outline" size="sm">
                          取消
                        </Button>
                      </Dialog.Close>
                      <Button type="button" size="sm" disabled={creating} onClick={() => void handleCreate()}>
                        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "创建"}
                      </Button>
                    </div>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        }
      />

      <PageToolbar
        end={
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {loading ? "加载中…" : `共 ${total} 个项目`} {error ? `（${error}）` : ""}
          </p>
        }
      >
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-10 w-10 border border-border bg-white"
            onClick={() => setViewMode("grid")}
            aria-label="网格视图"
          >
            <LayoutGrid size={18} />
          </Button>
          <Button
            type="button"
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            className="h-10 w-10 border border-border bg-white"
            onClick={() => setViewMode("list")}
            aria-label="列表视图"
          >
            <List size={18} />
          </Button>
        </div>
      </PageToolbar>

      {loading && filteredForDisplay.length === 0 ? (
        <div className="flex justify-center py-20 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {filteredForDisplay.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <Card className="paper-border overflow-hidden">
          <CardContent className="p-0">
            <table className="w-full border-collapse border-b border-border text-left text-sm">
              <thead className="border-b border-border bg-muted text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-6 py-4">项目名称</th>
                  <th className="px-6 py-4">阶段</th>
                  <th className="px-6 py-4">健康度</th>
                  <th className="px-6 py-4">成员 / 文档</th>
                  <th className="px-6 py-4">最后更新</th>
                  <th className="px-6 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-sans">
                {filteredForDisplay.map((project) => (
                  <tr key={project.id} className="group hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-5">
                      <Link href={`/projects/${project.id}`} className="group-hover:text-primary transition-colors">
                        <p className="font-serif text-base font-bold italic leading-tight">{project.name}</p>
                        <p className="mt-1 line-clamp-1 font-sans text-[10px] font-normal italic text-muted-foreground">
                          {project.description || "—"}
                        </p>
                        <p className="mt-1 text-[10px] font-medium text-muted-foreground/90">{project.pending_summary}</p>
                      </Link>
                    </td>
                    <td className="px-6 py-5">
                      <Badge variant="secondary" className="text-[10px] font-bold uppercase">
                        {project.phase}
                      </Badge>
                    </td>
                    <td className="px-6 py-5">
                      <HealthBadge status={project.health} />
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3 text-xs opacity-60">
                        <span className="flex items-center gap-1">
                          <Users size={12} /> {project.member_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText size={12} /> {project.document_count}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-xs text-muted-foreground">{formatRelative(project.last_update_at)}</td>
                    <td className="px-6 py-5 text-right">
                      <Link href={`/projects/${project.id}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-2 transition-all group-hover:bg-primary group-hover:text-primary-foreground"
                        >
                          进入 <ArrowRight size={14} />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </AppPage>
  );
}

function ProjectCard({ project }: { project: ProjectListItemApi }) {
  return (
    <Card className="paper-border group relative flex flex-col overflow-hidden bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
      <div className="absolute left-0 top-0 h-1 w-full bg-primary/10" />
      <CardHeader className="pb-2">
        <div className="mb-4 flex items-start justify-between">
          <HealthBadge status={project.health} />
          <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-primary/5 text-primary/40 transition-transform group-hover:scale-110">
            <FolderKanban size={20} />
          </div>
        </div>
        <CardTitle className="font-serif text-2xl font-bold italic tracking-tight transition-colors group-hover:text-primary">
          {project.name}
        </CardTitle>
        <CardDescription className="mt-2 line-clamp-2 font-sans text-sm italic leading-relaxed">
          {project.description || "—"}
        </CardDescription>
        <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{project.pending_summary}</p>
      </CardHeader>
      <CardContent className="mt-4 flex-1">
        <div className="flex items-center justify-between border-y border-border/50 py-3">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">当前阶段</p>
            <Badge className="border-none bg-secondary font-bold text-xs text-foreground">{project.phase}</Badge>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">成员 / 文档</p>
            <div className="flex items-center gap-3 text-xs font-bold opacity-60">
              <span className="flex items-center gap-1">
                <Users size={12} /> {project.member_count}
              </span>
              <span className="flex items-center gap-1">
                <FileText size={12} /> {project.document_count}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock size={12} /> 更新: {formatRelative(project.last_update_at)}
          </span>
        </div>
      </CardContent>
      <div className="mt-auto border-t border-border bg-muted/20 p-4 transition-colors duration-300 group-hover:bg-primary">
        <Link
          href={`/projects/${project.id}`}
          className="flex items-center justify-between text-xs font-bold uppercase tracking-widest transition-colors group-hover:text-primary-foreground"
        >
          <span>进入项目详情</span>
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </Card>
  );
}

function HealthBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    good: "bg-green-500",
    warning: "bg-yellow-500",
    critical: "bg-red-500",
  };
  const labels: Record<string, string> = {
    good: "健康",
    warning: "预警",
    critical: "异常",
  };
  const c = colors[status] ?? "bg-muted-foreground";
  const l = labels[status] ?? status;
  return (
    <div className="flex items-center gap-2">
      <div className={cn("h-2.5 w-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)]", c)} />
      <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">{l}</span>
    </div>
  );
}

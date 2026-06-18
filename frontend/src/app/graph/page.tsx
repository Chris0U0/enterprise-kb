"use client";

import React, { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useProject } from "@/hooks/use-project";
import { useProjectList } from "@/hooks/use-project-list";
import { fallbackProjectRecord } from "@/data/project-registry";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "reactflow";
import "reactflow/dist/style.css";
import { AppPage, Breadcrumbs } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetchJson } from "@/lib/api-client";
import {
  Network,
  Terminal,
  Info,
  ChevronRight,
  Sparkles,
  Command,
  LayoutGrid,
  Loader2,
  RefreshCcw,
} from "lucide-react";

type GraphApiNode = {
  id: string;
  label: string;
  type: string;
  position: { x: number; y: number };
  style?: Record<string, string | number>;
  data?: {
    label: string;
    entityName: string;
    entityType: string;
    docId?: string;
    sectionPath?: string;
  };
};

type GraphApiEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

type ProjectGraphResponse = {
  project_id: string;
  nodes: GraphApiNode[];
  edges: GraphApiEdge[];
  stats: { entity_count: number; relation_count: number };
};

function toFlowNodes(apiNodes: GraphApiNode[]): Node[] {
  return apiNodes.map((n) => ({
    id: n.id,
    position: n.position,
    data: { label: n.data?.label ?? n.label },
    style: n.style,
  }));
}

function toFlowEdges(apiEdges: GraphApiEdge[]): Edge[] {
  return apiEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: e.label === "affects" || e.label === "has_risk",
  }));
}

export default function GraphExplorerPage() {
  const searchParams = useSearchParams();
  const paramProjectId = searchParams.get("projectId");
  const { items: projects } = useProjectList();
  const resolvedProjectId = paramProjectId || projects[0]?.id || "";
  const { project: projectCtx } = useProject(resolvedProjectId || undefined);
  const graphProject = projectCtx ?? fallbackProjectRecord(resolvedProjectId || "unknown");

  const [apiNodes, setApiNodes] = useState<GraphApiNode[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [stats, setStats] = useState({ entity_count: 0, relation_count: 0 });
  const [loading, setLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [queryResult, setQueryResult] = useState<string | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [selected, setSelected] = useState<GraphApiNode | null>(null);
  const [backendReady, setBackendReady] = useState(true);

  const loadGraph = useCallback(async () => {
    if (!resolvedProjectId) return;
    setLoading(true);
    setGraphError(null);
    try {
      const data = await apiFetchJson<ProjectGraphResponse>(
        `/graph/projects/${resolvedProjectId}/graph?limit=200`
      );
      setNodes(toFlowNodes(data.nodes));
      setEdges(toFlowEdges(data.edges));
      setApiNodes(data.nodes);
      setStats(data.stats);
      setBackendReady(true);
      if (data.nodes.length > 0) {
        const first = data.nodes[0];
        setSelected(first);
      } else {
        setSelected(null);
      }
    } catch (e) {
      setGraphError(e instanceof Error ? e.message : "加载图谱失败");
      setNodes([]);
      setEdges([]);
      setApiNodes([]);
      setStats({ entity_count: 0, relation_count: 0 });
      setBackendReady(false);
    } finally {
      setLoading(false);
    }
  }, [resolvedProjectId, setNodes, setEdges]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  const runGraphQuery = useCallback(async () => {
    if (!resolvedProjectId || !query.trim()) return;
    setQueryLoading(true);
    setQueryResult(null);
    try {
      const data = await apiFetchJson<{ result: string }>(
        `/graph/projects/${resolvedProjectId}/query`,
        { method: "POST", json: { query: query.trim(), mode: "text2cypher" } }
      );
      setQueryResult(data.result);
    } catch (e) {
      setQueryResult(e instanceof Error ? e.message : "查询失败");
    } finally {
      setQueryLoading(false);
    }
  }, [resolvedProjectId, query]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const hit = apiNodes.find((n) => n.id === node.id);
    setSelected(hit ?? null);
  }, [apiNodes]);

  const miniMapNodeColor = useCallback(
    (n: Node) => (n.style?.background as string) || "#eee",
    []
  );

  const neighborCount = selected
    ? edges.filter((e) => e.source === selected.id || e.target === selected.id).length
    : 0;

  return (
    <AppPage fullWidth noPadding className="min-h-0 p-0" innerClassName="space-y-0">
      <div className="flex flex-col bg-background font-sans">
        <div className="border-b border-border bg-white/50 px-4 py-2 backdrop-blur-sm sm:px-6 lg:px-8">
          <Breadcrumbs items={breadcrumbsFromPathname("/graph")} />
        </div>

        <div className="z-10 flex h-16 shrink-0 flex-wrap items-center justify-between gap-4 border-b border-border bg-white/50 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Network size={20} className="text-primary" />
            <h1 className="font-serif text-xl font-bold italic tracking-tight">GraphRAG 图谱探索</h1>
            <div className="mx-2 h-4 w-px bg-border" />
            {resolvedProjectId ? (
              <Link href={`/projects/${resolvedProjectId}`} className="inline-flex">
                <Badge
                  variant="outline"
                  className="border-primary/20 bg-primary/5 font-serif italic text-primary"
                >
                  {graphProject.name}
                </Badge>
              </Link>
            ) : (
              <Badge variant="outline">请先创建项目</Badge>
            )}
          </div>

          <div className="group relative order-3 flex-1 basis-full sm:order-none sm:basis-auto lg:mx-8 lg:max-w-2xl">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-primary">
              <Command size={16} />
            </div>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void runGraphQuery()}
              placeholder="查询实体关系，如：谁负责 MD5 校验模块，它依赖什么？"
              className="h-10 w-full border-border bg-white pl-10 pr-24 shadow-sm focus-visible:ring-primary"
              disabled={!resolvedProjectId}
            />
            <div className="absolute right-2 top-1.5 flex gap-1">
              <Button
                size="sm"
                className="h-7 gap-1 bg-primary px-2 text-[10px] font-bold uppercase"
                onClick={() => void runGraphQuery()}
                disabled={!resolvedProjectId || queryLoading}
              >
                {queryLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Text2Cypher
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <LayoutGrid size={18} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 font-serif font-bold italic"
              onClick={() => void loadGraph()}
              disabled={loading || !resolvedProjectId}
            >
              {loading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RefreshCcw size={14} className="mr-1" />}
              同步图谱数据
            </Button>
          </div>
        </div>

        {!resolvedProjectId && (
          <div className="px-8 py-6 text-sm text-muted-foreground">
            请从项目页进入图谱，或先创建项目并在知识库中上传文档以触发 GraphRAG 抽取。
          </div>
        )}

        {graphError && (
          <div className="border-b border-destructive/20 bg-destructive/5 px-8 py-2 text-sm text-destructive">
            {graphError}
          </div>
        )}

        <div
          className="relative h-[calc(100dvh-11rem)] min-h-[420px] max-h-[900px] w-full"
          aria-label="知识图谱画布"
        >
          {loading && nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="animate-spin" size={20} />
              正在从 Kuzu 加载图谱…
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              fitView
              className="h-full w-full bg-[#F9F7F2]"
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#E5E1D8" gap={20} size={1} />
              <Controls className="border-border bg-white shadow-md" />
              <MiniMap className="border border-border bg-white shadow-md" nodeColor={miniMapNodeColor} />

              <Panel position="top-right" className="flex max-w-[320px] flex-col gap-4">
                <Card className="paper-border bg-white/90 shadow-lg backdrop-blur">
                  <CardHeader className="mb-4 border-b border-border bg-primary/5 p-4 pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-primary">
                      <Info size={14} />
                      实体详情
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 p-4">
                    {selected ? (
                      <>
                        <div className="space-y-1">
                          <p className="font-sans text-xs text-muted-foreground">当前选中实体</p>
                          <p className="font-serif text-lg font-bold italic">{selected.data?.entityName ?? selected.label}</p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="font-bold uppercase tracking-tighter text-muted-foreground">关联边</span>
                            <span className="font-bold">{neighborCount} 条</span>
                          </div>
                          {selected.data?.entityType && (
                            <div className="flex justify-between text-xs">
                              <span className="font-bold uppercase tracking-tighter text-muted-foreground">类型</span>
                              <Badge variant="outline" className="h-4 text-[9px]">
                                {selected.data.entityType}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm italic text-muted-foreground">点击节点查看详情，或上传文档后同步图谱。</p>
                    )}
                    {queryResult && (
                      <div className="border-t border-border pt-2">
                        <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">查询结果</p>
                        <p className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-muted-foreground">
                          {queryResult}
                        </p>
                      </div>
                    )}
                    {selected && resolvedProjectId && (
                      <Button size="sm" className="h-8 w-full gap-1 font-sans text-xs" asChild>
                        <Link href={`/copilot?projectId=${resolvedProjectId}`}>
                          在 Copilot 中分析该节点 <ChevronRight size={14} />
                        </Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>

                <Card className="paper-border bg-white/90 shadow-md backdrop-blur">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Terminal size={16} className="text-muted-foreground" />
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Kuzu 图谱引擎
                      </p>
                      <div className="flex items-center gap-1.5">
                        <div className={`h-1.5 w-1.5 rounded-full ${backendReady ? "bg-green-500" : "bg-amber-500"}`} />
                        <p className="text-[10px] font-medium">
                          {backendReady ? "Cypher Engine Ready" : "未就绪或暂无数据"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Panel>
            </ReactFlow>
          )}
        </div>

        <div className="flex h-auto min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-white px-4 py-2 font-sans text-[10px] uppercase tracking-widest text-muted-foreground sm:px-8">
          <div className="flex gap-6">
            <span className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-sm bg-primary" /> 项目/根节点
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-sm border border-border bg-white" /> 实体
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-sm bg-destructive" /> 风险节点
            </span>
          </div>
          <div className="text-left sm:text-right">
            Graph Metadata: {stats.entity_count} Entities · {stats.relation_count} Relations · Kuzu
          </div>
        </div>
      </div>
    </AppPage>
  );
}

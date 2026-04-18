"use client";

import { cn } from "@/lib/utils";
import React, { useState, useCallback } from 'react';
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useProject } from "@/hooks/use-project";
import { fallbackProjectRecord } from "@/data/project-registry";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  MarkerType,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { AppPage, Breadcrumbs } from "@/components/shared/page-layout";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Network,
  Terminal,
  Info,
  ChevronRight,
  Sparkles,
  Command,
  LayoutGrid,
} from "lucide-react";

// 自定义节点样式建议在 globals.css 中，这里先使用 inline style
const initialNodes: Node[] = [
  { 
    id: '1', 
    position: { x: 400, y: 100 }, 
    data: { label: '智能排班系统 (Project)' },
    style: { background: '#2C2C2C', color: '#F9F7F2', border: '1px solid #D1CDC2', padding: '10px', borderRadius: '2px', fontWeight: 'bold' }
  },
  { 
    id: '2', 
    position: { x: 200, y: 250 }, 
    data: { label: '张三 (Developer)' },
    style: { background: '#FFFFFF', color: '#2C2C2C', border: '1px solid #D1CDC2', padding: '10px', borderRadius: '2px' }
  },
  { 
    id: '3', 
    position: { x: 600, y: 250 }, 
    data: { label: 'MD5 校验模块 (Module)' },
    style: { background: '#FFFFFF', color: '#2C2C2C', border: '1px solid #D1CDC2', padding: '10px', borderRadius: '2px' }
  },
  { 
    id: '4', 
    position: { x: 100, y: 400 }, 
    data: { label: '负责模块: Auth' },
    style: { background: '#F1EDE4', color: '#2C2C2C', border: '1px dotted #D1CDC2', padding: '5px', fontSize: '12px' }
  },
  { 
    id: '5', 
    position: { x: 700, y: 400 }, 
    data: { label: '依赖系统: Redis' },
    style: { background: '#F1EDE4', color: '#2C2C2C', border: '1px dotted #D1CDC2', padding: '5px', fontSize: '12px' }
  },
  { 
    id: '6', 
    position: { x: 500, y: 400 }, 
    data: { label: '合规性风险 (Risk)' },
    style: { background: '#7F1D1D', color: '#F9F7F2', border: '1px solid #7F1D1D', padding: '10px', borderRadius: '2px' }
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', label: 'member', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e1-3', source: '1', target: '3', label: 'contains', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e2-4', source: '2', target: '4', label: 'responsible_for', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3-5', source: '3', target: '5', label: 'depends_on', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3-6', source: '3', target: '6', label: 'has_risk', markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { stroke: '#7F1D1D' } },
];

export default function GraphExplorerPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "1";
  const { project: projectCtx } = useProject(projectId);
  const graphProject = projectCtx ?? fallbackProjectRecord(projectId);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [query, setQuery] = useState("");

  const onConnect = useCallback(
    (params: Parameters<typeof addEdge>[0]) =>
      setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  /** React Flow 要求父级有明确宽高；在可滚动主布局中勿仅依赖 flex-1 */
  const miniMapNodeColor = useCallback(
    (n: Node) => (n.style?.background as string) || "#eee",
    []
  );

  return (
    <AppPage fullWidth noPadding className="min-h-0 p-0" innerClassName="space-y-0">
    <div className="flex flex-col bg-background font-sans">
      <div className="border-b border-border bg-white/50 px-4 py-2 backdrop-blur-sm sm:px-6 lg:px-8">
        <Breadcrumbs items={breadcrumbsFromPathname("/graph")} />
      </div>
      {/* 顶部工具栏 */}
      <div className="flex h-16 shrink-0 flex-wrap items-center justify-between gap-4 border-b border-border bg-white/50 px-4 backdrop-blur-sm sm:px-6 lg:px-8 z-10">
        <div className="flex items-center gap-4">
          <Network size={20} className="text-primary" />
          <h1 className="text-xl font-bold italic tracking-tight font-serif">GraphRAG 图谱探索</h1>
          <div className="h-4 w-px bg-border mx-2" />
          <Link href={`/projects/${projectId}`} className="inline-flex">
            <Badge variant="outline" className="border-primary/20 bg-primary/5 font-serif italic text-primary">
              {graphProject.name}
            </Badge>
          </Link>
        </div>
        
        {/* 图谱 NLU 查询框 */}
        <div className="relative order-3 flex-1 basis-full group sm:order-none sm:basis-auto lg:mx-8 lg:max-w-2xl">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-primary">
            <Command size={16} />
          </div>
          <Input 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="查询实体关系，如：谁负责 MD5 校验模块，它依赖什么？" 
            className="pl-10 pr-24 h-10 border-border bg-white focus-visible:ring-primary shadow-sm w-full" 
          />
          <div className="absolute right-2 top-1.5 flex gap-1">
             <Button size="sm" className="h-7 gap-1 text-[10px] font-bold px-2 uppercase bg-primary">
               <Sparkles size={12} />
               Text2Cypher
             </Button>
          </div>
        </div>

        <div className="flex gap-2">
           <Button variant="ghost" size="icon" className="h-9 w-9"><LayoutGrid size={18} /></Button>
           <Button variant="outline" size="sm" className="h-9 font-serif italic font-bold">同步图谱数据</Button>
        </div>
      </div>

      <div
        className="relative w-full min-h-[420px] h-[calc(100dvh-11rem)] max-h-[900px]"
        aria-label="知识图谱画布"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          className="h-full w-full bg-[#F9F7F2]"
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#E5E1D8" gap={20} size={1} />
          <Controls className="bg-white border-border shadow-md" />
          <MiniMap
            className="border border-border bg-white shadow-md"
            nodeColor={miniMapNodeColor}
          />
          
          <Panel position="top-right" className="flex flex-col gap-4 max-w-[320px]">
            {/* 实体详情面板 (模拟) */}
            <Card className="paper-border bg-white/90 backdrop-blur shadow-lg">
              <CardHeader className="p-4 pb-2 border-b border-border mb-4 bg-primary/5">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                  <Info size={14} />
                  实体详情预览
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-sans">当前选中实体</p>
                  <p className="text-lg font-bold italic font-serif">MD5 校验模块</p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground uppercase font-bold tracking-tighter">关联节点</span>
                    <span className="font-bold">3 个</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground uppercase font-bold tracking-tighter">风险级别</span>
                    <Badge variant="destructive" className="text-[9px] px-1 h-4">HIGH</Badge>
                  </div>
                </div>
                <div className="pt-2 border-t border-border mt-4">
                  <p className="text-[11px] leading-relaxed italic text-muted-foreground font-sans">
                    “该模块负责文档上传的防篡改校验，在外部审计中具有最高优先级。”
                  </p>
                </div>
                <Button size="sm" className="w-full h-8 text-xs gap-1 font-sans">
                  在 Copilot 中分析该节点 <ChevronRight size={14} />
                </Button>
              </CardContent>
            </Card>

            {/* 系统状态面板 */}
            <Card className="paper-border bg-white/90 backdrop-blur shadow-md">
              <CardContent className="p-4 flex items-center gap-3">
                 <Terminal size={16} className="text-muted-foreground" />
                 <div className="space-y-0.5">
                   <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">图谱后端状态</p>
                   <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      <p className="text-[10px] font-medium">Cypher Engine Ready</p>
                   </div>
                 </div>
              </CardContent>
            </Card>
          </Panel>
        </ReactFlow>
      </div>

      {/* 底部属性查看器提示 (模拟) */}
      <div className="flex h-auto min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-white px-4 py-2 text-[10px] font-sans uppercase tracking-widest text-muted-foreground sm:px-8">
        <div className="flex gap-6">
           <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-primary" /> 项目/根节点</span>
           <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-white border border-border" /> 实体 (Person/Object)</span>
           <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-destructive" /> 风险节点</span>
        </div>
        <div className="text-left sm:text-right">
          Graph Metadata: 124 Entities · 312 Relations · 14.2 MB Index
        </div>
      </div>
    </div>
    </AppPage>
  );
}

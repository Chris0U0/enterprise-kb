"use client";

import { cn } from "@/lib/utils";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppPage, PageHeader, PageToolbar } from "@/components/shared/page-layout";
import { PdfViewer } from "@/components/shared/pdf-viewer";
import { useProject } from "@/hooks/use-project";

// 引入 react-pdf 样式
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useProjectDocuments } from "@/hooks/use-project-documents";
import { breadcrumbsFromPathname } from "@/lib/route-meta";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { apiFetchJson } from "@/lib/api-client";
import { 
  FileText, 
  Upload, 
  Search, 
  ChevronRight, 
  ListTree, 
  MoreVertical,
  CheckCircle2,
  Clock,
  Loader2,
  Filter,
  Grid,
  List,
  Maximize2,
  X
} from "lucide-react";

type UploadResp = {
  doc_id: string;
};
type MarkdownResp = {
  doc_id: string;
  markdown: string;
};
type SourceResp = {
  doc_id: string;
  preview_url?: string;
  source_url: string;
  sourceUrl?: string;
  original_filename: string;
  source_format: string;
  mode?: "inline" | "download";
  reason?: string | null;
  preview_content_type?: string | null;
};

export default function KnowledgeBasePage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const docIdFromQuery = searchParams.get("docId");
  const { project: projectCtx } = useProject(projectId ?? undefined);
  const { docs, loading, refetch } = useProjectDocuments(projectId ?? undefined);

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewMarkdown, setPreviewMarkdown] = useState<string>("");
  const [previewSourceUrl, setPreviewSourceUrl] = useState<string>("");
  const [previewSourceDownloadUrl, setPreviewSourceDownloadUrl] = useState<string>("");
  const [previewSourceMode, setPreviewSourceMode] = useState<"inline" | "download">("inline");
  const [previewSourceReason, setPreviewSourceReason] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"markdown" | "source">("markdown");
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const lastPreviewKeyRef = useRef<string>("");
  const unchangedRoundsRef = useRef(0);
  const lastStatusesRef = useRef<string>("");

  const documents = useMemo(
    () =>
      docs.map((d) => ({
        id: d.id,
        name: d.original_filename,
        size: d.file_size_bytes ? `${(d.file_size_bytes / 1024 / 1024).toFixed(2)} MB` : "—",
        status: d.conversion_status,
        progress: d.conversion_status === "completed" ? 100 : d.conversion_status === "processing" ? 60 : d.conversion_status === "failed" ? 0 : 10,
        statusText: d.conversion_status === "completed" ? "处理完成" : d.conversion_status === "processing" ? "正在解析..." : d.conversion_status === "failed" ? "解析失败" : "排队中",
        updated: new Date(d.upload_at).toLocaleDateString("zh-CN"),
      })),
    [docs]
  );

  useEffect(() => {
    const hasRunning = docs.some((d) => d.conversion_status === "pending" || d.conversion_status === "processing");
    if (!hasRunning) return;
    const timer = window.setInterval(() => {
      const signature = docs.map((d) => `${d.id}:${d.conversion_status}`).join("|");
      if (signature === lastStatusesRef.current) {
        unchangedRoundsRef.current += 1;
      } else {
        unchangedRoundsRef.current = 0;
        lastStatusesRef.current = signature;
      }
      // 超过 5 轮无变化时降频，避免无效轮询刷日志
      if (unchangedRoundsRef.current >= 5 && unchangedRoundsRef.current % 2 === 1) {
        return;
      }
      refetch();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [docs, refetch]);

  useEffect(() => {
    if (!docIdFromQuery) return;
    const exists = documents.some((d) => d.id === docIdFromQuery);
    if (exists) setActiveDoc(docIdFromQuery);
  }, [docIdFromQuery, documents]);

  useEffect(() => {
    if (!activeDoc && documents.length > 0) {
      setActiveDoc(documents[0].id);
    }
  }, [activeDoc, documents]);

  const selectedDoc = useMemo(
    () => documents.find((d) => d.id === activeDoc) ?? null,
    [documents, activeDoc]
  );

  const [previewContentType, setPreviewContentType] = useState<string>("");
  const previewExt = useMemo(() => {
    if (!previewSourceUrl) return "";
    const noQuery = previewSourceUrl.split("?")[0];
    const idx = noQuery.lastIndexOf(".");
    return idx >= 0 ? noQuery.slice(idx + 1).toLowerCase() : "";
  }, [previewSourceUrl]);
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(previewExt) || previewContentType.startsWith("image/");
  const isPdf = previewExt === "pdf" || previewContentType === "application/pdf";
  const isHtml = previewExt === "html" || previewExt === "htm" || previewContentType.includes("text/html");
  const isText = ["txt", "md", "csv", "json", "log", "yaml", "yml", "xml"].includes(previewExt) || previewContentType.startsWith("text/");

  useEffect(() => {
    if (!activeDoc || !selectedDoc) {
      setPreviewMarkdown("");
      setPreviewSourceUrl("");
      setPreviewSourceDownloadUrl("");
      setPreviewSourceMode("inline");
      setPreviewSourceReason(null);
      setPreviewContentType("");
      lastPreviewKeyRef.current = "";
      setPreviewError(null);
      return;
    }
    if (previewMode === "markdown" && selectedDoc.status !== "completed") {
      setPreviewMarkdown("");
      setPreviewSourceUrl("");
      setPreviewError("文档尚未完成解析，暂时无法预览。");
      lastPreviewKeyRef.current = "";
      return;
    }
    const requestKey = `${activeDoc}:${previewMode}`;
    const shouldRefetch =
      requestKey !== lastPreviewKeyRef.current ||
      (previewMode === "markdown" && !previewMarkdown) ||
      (previewMode === "source" && !previewSourceUrl);
    if (!shouldRefetch) {
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    void (async () => {
      try {
        if (previewMode === "markdown") {
          const data = await apiFetchJson<MarkdownResp>(`/documents/${activeDoc}/markdown`);
          if (!cancelled) {
            setPreviewMarkdown(data.markdown || "");
            setPreviewSourceUrl("");
            setPreviewSourceDownloadUrl("");
            setPreviewSourceMode("inline");
            setPreviewSourceReason(null);
            setPreviewContentType("");
            lastPreviewKeyRef.current = requestKey;
          }
        } else {
          const data = await apiFetchJson<SourceResp>(`/documents/${activeDoc}/preview_url`);
          if (!cancelled) {
            const inlineUrl = data.preview_url || data.source_url || data.sourceUrl || "";
            const sourceUrl = data.source_url || data.sourceUrl || "";
            if (!inlineUrl) {
              throw new Error("后端未返回 preview_url/source_url，请检查 /documents/{doc_id}/preview_url 接口响应。");
            }
            setPreviewSourceUrl(inlineUrl);
            setPreviewSourceDownloadUrl(sourceUrl || inlineUrl);
            setPreviewSourceMode(data.mode ?? "inline");
            setPreviewSourceReason(data.reason ?? null);
            setPreviewContentType(data.preview_content_type ?? "");
            setPreviewMarkdown("");
            lastPreviewKeyRef.current = requestKey;
          }
        }
      } catch (e) {
        if (!cancelled) {
          setPreviewMarkdown("");
          setPreviewSourceUrl("");
          setPreviewSourceDownloadUrl("");
          setPreviewSourceMode("inline");
          setPreviewSourceReason(null);
          setPreviewContentType("");
          lastPreviewKeyRef.current = "";
          setPreviewError(e instanceof Error ? e.message : "加载预览失败");
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeDoc, selectedDoc?.status, previewMode, previewMarkdown, previewSourceUrl]);

  const handleUpload = async (file: File | null) => {
    if (!file || !projectId) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("project_id", projectId);
      await apiFetchJson<UploadResp>("/documents/upload", {
        method: "POST",
        body: form,
      });
      await refetch();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  return (
    <AppPage surface="canvas">
      <PageHeader
        title="知识库管理"
        description="上传多模态文件，AI 正在为您自动解析结构并提取特征。"
        breadcrumbs={breadcrumbsFromPathname("/knowledge")}
        actions={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full min-w-0 sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索文档内容..."
                className="h-10 border-border bg-white pl-10"
                aria-label="搜索文档"
              />
            </div>
            <Button
              className="gap-2 bg-primary"
              onClick={() => uploadInputRef.current?.click()}
              disabled={!projectId || uploading}
            >
              <Upload size={18} />
              {uploading ? "上传中..." : "上传文件"}
            </Button>
            <input
              ref={uploadInputRef}
              type="file"
              className="hidden"
              onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
            />
          </div>
        }
      />
      {uploadError ? <p className="mb-4 text-sm text-destructive">{uploadError}</p> : null}

      {projectId && projectCtx ? (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-sm border border-primary/20 bg-primary/5 px-4 py-2 text-sm">
          <span className="text-muted-foreground">当前项目上下文</span>
          <Badge variant="secondary" className="font-sans">
            {projectCtx.name}
          </Badge>
          <Link
            href={`/projects/${projectId}`}
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            返回项目概览
          </Link>
        </div>
      ) : null}

        <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
          
          {/* 左侧：文档列表 */}
          <div className="min-w-0 flex-1 space-y-6">
            <PageToolbar
              end={
                <p className="font-serif text-xs italic text-muted-foreground">
                  {loading ? "加载中..." : `共 ${documents.length} 篇文档`}
                </p>
              }
            >
              <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                <Button
                  type="button"
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setViewMode("grid")}
                  aria-label="网格视图"
                >
                  <Grid size={16} />
                </Button>
                <Button
                  type="button"
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setViewMode("list")}
                  aria-label="列表视图"
                >
                  <List size={16} />
                </Button>
                <div className="mx-2 hidden h-4 w-px bg-border sm:block" />
                <Button variant="ghost" size="sm" type="button" className="gap-1 text-xs">
                  <Filter size={14} /> 筛选
                </Button>
              </div>
            </PageToolbar>

            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {documents.map((doc) => (
                  <Card 
                    key={doc.id} 
                    className={cn(
                      "paper-border hover:shadow-md transition-all cursor-pointer",
                      activeDoc === doc.id ? "ring-2 ring-primary border-transparent" : ""
                    )}
                    onClick={() => setActiveDoc(doc.id)}
                  >
                    <CardHeader className="p-5 pb-2">
                      <div className="flex justify-between items-start">
                        <FileText size={32} className="text-primary/60" />
                        <StatusIndicator status={doc.status} />
                      </div>
                      <CardTitle className="text-lg font-serif italic mt-4 truncate">{doc.name}</CardTitle>
                      <CardDescription className="flex justify-between text-[10px] uppercase font-bold tracking-widest pt-2">
                        <span>{doc.size}</span>
                        <span>{doc.updated}</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-5 pt-4">
                      {doc.status !== "completed" && doc.status !== "failed" && (
                        <div className="space-y-2 mb-4">
                          <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter">
                            <span className="flex items-center gap-1">
                              <Loader2 size={10} className="animate-spin text-primary" />
                              {doc.statusText}
                            </span>
                            <span>{doc.progress}%</span>
                          </div>
                          <Progress value={doc.progress} className="h-1 bg-muted shrink-0" />
                        </div>
                      )}
                      {doc.status === "failed" && (
                        <div className="space-y-2 mb-4">
                          <div className="flex justify-between text-[10px] font-bold text-destructive">
                            <span>{doc.statusText}</span>
                            <span>ERROR</span>
                          </div>
                          <Progress value={100} className="h-1 bg-destructive/20 [&>div]:bg-destructive" />
                        </div>
                      )}
                      <div className="flex justify-end gap-2 pt-2 border-t border-border mt-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8"><ChevronRight size={14} /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical size={14} /></Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="paper-border">
                <CardContent className="p-0">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-muted text-muted-foreground uppercase text-[10px] font-bold tracking-widest border-b border-border">
                      <tr>
                        <th className="px-6 py-4 font-bold">文件名</th>
                        <th className="px-6 py-4 font-bold">状态</th>
                        <th className="px-6 py-4 font-bold">大小</th>
                        <th className="px-6 py-4 font-bold">最后修改</th>
                        <th className="px-6 py-4 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {documents.map((doc) => (
                        <tr 
                          key={doc.id} 
                          className={cn(
                            "hover:bg-muted/30 cursor-pointer transition-colors",
                            activeDoc === doc.id ? "bg-muted/50" : ""
                          )}
                          onClick={() => setActiveDoc(doc.id)}
                        >
                          <td className="px-6 py-4 flex items-center gap-3">
                            <FileText size={16} className="text-muted-foreground" />
                            <span className="font-serif italic font-medium">{doc.name}</span>
                          </td>
                          <td className="px-6 py-4">
                             <StatusIndicator status={doc.status} inline />
                          </td>
                          <td className="px-6 py-4 text-muted-foreground">{doc.size}</td>
                          <td className="px-6 py-4 text-muted-foreground">{doc.updated}</td>
                          <td className="px-6 py-4 text-right">
                             <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical size={16} /></Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>

          {/* 右侧：文档结构预览树 (窄屏置于下方) */}
          <div className="w-full shrink-0 xl:w-80">
            <div className="space-y-6 xl:sticky xl:top-8">
              <Card className="paper-border border-primary/20 bg-primary/5 min-h-[500px]">
                <CardHeader>
                  <CardTitle className="text-lg font-serif italic flex items-center gap-2">
                    <ListTree size={18} className="text-primary" />
                    文档内容预览
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {activeDoc ? `解析自: ${documents.find((d) => d.id === activeDoc)?.name}` : "请从左侧选择一个文档"}
                  </CardDescription>
                  <Tabs
                    value={previewMode}
                    onValueChange={(v) => setPreviewMode(v as "markdown" | "source")}
                    className="w-fit"
                  >
                    <TabsList className="h-8">
                      <TabsTrigger value="markdown" className="text-xs">
                        Markdown
                      </TabsTrigger>
                      <TabsTrigger value="source" className="text-xs">
                        源文件
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardHeader>
                <CardContent>
                  {activeDoc ? (
                    <ScrollArea className="h-[400px]">
                      {previewLoading ? (
                        <div className="flex h-[340px] items-center justify-center text-sm text-muted-foreground">
                          正在加载文档预览...
                        </div>
                      ) : previewError ? (
                        <div className="rounded-sm border border-border bg-background p-3 text-xs text-muted-foreground">
                          {previewError}
                        </div>
                      ) : previewMode === "source" ? (
                        <div className="space-y-3 rounded-sm border border-border bg-background p-3">
                          <p className="text-xs text-muted-foreground">
                            源文件内嵌预览（预签名链接 1 小时有效）。
                          </p>
                          {!previewSourceUrl ? (
                            <p className="text-xs text-muted-foreground">暂无可用源文件链接。</p>
                          ) : previewSourceMode === "download" ? (
                            <p className="text-xs text-muted-foreground">
                              {previewSourceReason || "该文件暂不支持站内预览，已降级为下载源文件。"}
                            </p>
                          ) : isImage ? (
                            <img
                              src={previewSourceUrl}
                              alt={selectedDoc?.name ?? "源文件"}
                              className="max-h-[320px] w-full rounded-sm border border-border object-contain"
                            />
                          ) : isPdf ? (
                            <PdfViewer 
                              url={previewSourceUrl} 
                              className="h-[320px] w-full"
                            />
                          ) : isHtml ? (
                            <iframe
                              src={previewSourceUrl}
                              title="源文件预览"
                              className="h-[320px] w-full rounded-sm border border-border bg-white"
                            />
                          ) : isText ? (
                            <iframe
                              src={previewSourceUrl}
                              title="源文件文本预览"
                              className="h-[320px] w-full rounded-sm border border-border bg-white"
                            />
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              当前文件类型暂不支持内嵌预览，请使用下方按钮打开源文件。
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {previewSourceUrl ? (
                              <Button size="sm" variant="secondary" className="h-8 gap-1" onClick={() => setPreviewModalOpen(true)}>
                                <Maximize2 size={14} />
                                放大预览
                              </Button>
                            ) : null}
                            {previewSourceDownloadUrl || previewSourceUrl ? (
                              <Button asChild size="sm" variant="outline" className="h-8">
                                <a href={previewSourceDownloadUrl || previewSourceUrl} target="_blank" rel="noreferrer">
                                  在新标签页打开
                                </a>
                              </Button>
                            ) : null}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            站内预览优先使用后端生成的 PDF/HTML 预览副本，不依赖公网 Office 预览服务。
                          </p>
                        </div>
                      ) : (
                        <pre className="whitespace-pre-wrap break-words rounded-sm border border-border bg-background p-3 text-xs leading-relaxed">
                          {previewMarkdown || "该文档暂无可预览内容。"}
                        </pre>
                      )}
                    </ScrollArea>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground opacity-50 space-y-4">
                      <FileText size={48} />
                      <p className="text-sm italic font-serif">选择文档后自动加载 Markdown 预览</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 拖拽上传区域提示 */}
              <div className="border-2 border-dashed border-border rounded-sm p-8 flex flex-col items-center justify-center text-center space-y-4 hover:border-primary/50 transition-colors group cursor-pointer bg-white">
                <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Upload size={20} className="text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-bold italic font-serif">点击或拖拽文件上传</p>
                  <p className="text-[10px] text-muted-foreground uppercase mt-1 tracking-wider font-sans">
                    支持 PDF, Word, Markdown, Excel, PPT (Max 100MB)
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      {previewModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative h-[90vh] w-[92vw] max-w-[1400px] rounded-md border border-border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{selectedDoc?.name ?? "源文件预览"}</p>
                <p className="text-xs text-muted-foreground">居中放大预览</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewModalOpen(false)}>
                <X size={16} />
              </Button>
            </div>
            <div className="h-[calc(90vh-49px)] p-3">
              {!previewSourceUrl ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">暂无可用源文件链接。</div>
              ) : previewSourceMode === "download" ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                  <p>{previewSourceReason || "该文件暂不支持站内预览，已降级为下载源文件。"}</p>
                  <Button asChild size="sm" variant="outline" className="h-8">
                    <a href={previewSourceDownloadUrl || previewSourceUrl} target="_blank" rel="noreferrer">
                      打开源文件
                    </a>
                  </Button>
                </div>
              ) : isImage ? (
                <img
                  src={previewSourceUrl}
                  alt={selectedDoc?.name ?? "源文件"}
                  className="h-full w-full rounded-sm border border-border object-contain"
                />
              ) : isPdf ? (
                <PdfViewer 
                  url={previewSourceUrl} 
                  className="h-full w-full"
                />
              ) : isHtml || isText ? (
                <iframe
                  src={previewSourceUrl}
                  title="放大源文件预览"
                  className="h-full w-full rounded-sm border border-border bg-white"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                  <p>当前格式暂不支持弹窗内嵌预览。</p>
                  <Button asChild size="sm" variant="outline" className="h-8">
                    <a href={previewSourceUrl} target="_blank" rel="noreferrer">
                      在新标签页打开
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </AppPage>
  );
}

function StatusIndicator({ status, inline = false }: { status: string, inline?: boolean }) {
  const configs = {
    completed: { color: "text-green-600 bg-green-50 border-green-200", icon: <CheckCircle2 size={12} />, label: "已完成" },
    processing: { color: "text-blue-600 bg-blue-50 border-blue-200", icon: <Loader2 size={12} className="animate-spin" />, label: "正在解析" },
    pending: { color: "text-muted-foreground bg-muted border-border", icon: <Clock size={12} />, label: "排队中" },
    failed: { color: "text-red-600 bg-red-50 border-red-200", icon: <Clock size={12} />, label: "失败" },
  };
  const config = configs[status as keyof typeof configs] ?? configs.pending;

  if (inline) {
    return (
      <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold", config.color)}>
        {config.icon}
        {config.label}
      </div>
    );
  }

  return (
    <Badge variant="outline" className={cn("text-[10px] font-bold border-none", config.color)}>
      {config.label}
    </Badge>
  );
}


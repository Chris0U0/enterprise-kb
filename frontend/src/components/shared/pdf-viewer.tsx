"use client";

import React, { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  RotateCw,
  Loader2,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// 配置 pdf.js worker
// 注意：在 Next.js 中，通常从 cdn 引入 worker 比较稳定
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url: string;
  className?: string;
}

export function PdfViewer({ url, className }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  }

  function onDocumentLoadError(err: Error) {
    console.error("PDF Load Error:", err);
    setLoading(false);
    setError("无法加载 PDF 文件，请检查链接是否有效。");
  }

  const changePage = (offset: number) => {
    setPageNumber(prevPageNumber => {
      const newPage = prevPageNumber + offset;
      if (numPages && newPage >= 1 && newPage <= numPages) {
        return newPage;
      }
      return prevPageNumber;
    });
  };

  return (
    <div className={cn("flex flex-col h-full bg-muted/30 rounded-md overflow-hidden border border-border", className)}>
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-background border-b border-border z-10">
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8" 
            onClick={() => changePage(-1)}
            disabled={pageNumber <= 1}
          >
            <ChevronLeft size={16} />
          </Button>
          <span className="text-xs font-medium min-w-[60px] text-center">
            第 {pageNumber} / {numPages || "?"} 页
          </span>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8" 
            onClick={() => changePage(1)}
            disabled={numPages ? pageNumber >= numPages : true}
          >
            <ChevronRight size={16} />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8" 
            onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
          >
            <ZoomOut size={16} />
          </Button>
          <span className="text-xs font-medium min-w-[40px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8" 
            onClick={() => setScale(s => Math.min(2.0, s + 0.1))}
          >
            <ZoomIn size={16} />
          </Button>
          <div className="w-px h-4 bg-border mx-1" />
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8" 
            onClick={() => setRotation(r => (r + 90) % 360)}
          >
            <RotateCw size={16} />
          </Button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 relative overflow-auto flex justify-center p-4">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-20">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground font-medium">正在渲染 PDF...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-20 p-6 text-center">
            <div className="flex flex-col items-center gap-3 max-w-xs">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="text-sm font-medium">{error}</p>
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                重试加载
              </Button>
            </div>
          </div>
        )}

        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          className="shadow-lg"
          loading={null}
        >
          <Page 
            pageNumber={pageNumber} 
            scale={scale} 
            rotate={rotation}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            loading={null}
          />
        </Document>
      </div>
      
      {/* 底部信息 */}
      <div className="px-4 py-1 bg-background border-t border-border text-[10px] text-muted-foreground flex justify-between">
        <span>基于 react-pdf (pdf.js) 渲染</span>
        <span>{url.split('?')[0].split('/').pop()}</span>
      </div>
    </div>
  );
}

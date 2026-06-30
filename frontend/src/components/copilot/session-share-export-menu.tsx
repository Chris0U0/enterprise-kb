"use client";

import { useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, Share2, Link2, Check, Loader2, X } from "lucide-react";
import {
  buildShareUrl,
  createSessionShare,
  downloadSessionExport,
} from "@/lib/chat-export-share";

const EXPIRY_OPTIONS = [
  { label: "1 天", days: 1 },
  { label: "7 天（推荐）", days: 7 },
  { label: "30 天", days: 30 },
  { label: "90 天", days: 90 },
  { label: "永久有效", days: 0 },
] as const;

type SessionShareExportMenuProps = {
  sessionId: string | null;
  disabled?: boolean;
};

export function SessionShareExportMenu({ sessionId, disabled }: SessionShareExportMenuProps) {
  const [exporting, setExporting] = useState<"md" | "json" | null>(null);
  const [sharing, setSharing] = useState(false);
  const [configureOpen, setConfigureOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [shareUrl, setShareUrl] = useState("");
  const [shareExpires, setShareExpires] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: "md" | "json") => {
    if (!sessionId) return;
    setExporting(format);
    setError(null);
    try {
      await downloadSessionExport(sessionId, format);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExporting(null);
    }
  };

  const handleCreateShare = async () => {
    if (!sessionId) return;
    setSharing(true);
    setError(null);
    try {
      const res = await createSessionShare(sessionId, expiresInDays);
      const url = buildShareUrl(res.share_path);
      setShareUrl(url);
      setShareExpires(res.expires_at);
      setConfigureOpen(false);
      setResultOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建分享失败");
    } finally {
      setSharing(false);
    }
  };

  const handleCopyShare = async () => {
    if (!shareUrl) return;
    await navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const isDisabled = disabled || !sessionId;
  const selectedExpiryLabel =
    EXPIRY_OPTIONS.find((o) => o.days === expiresInDays)?.label ?? `${expiresInDays} 天`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={isDisabled}>
            <Download size={14} />
            导出 / 分享
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>导出副本</DropdownMenuLabel>
          <DropdownMenuItem disabled={!!exporting} onClick={() => void handleExport("md")}>
            {exporting === "md" ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
            Markdown (.md)
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!!exporting} onClick={() => void handleExport("json")}>
            {exporting === "json" ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
            JSON (.json)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={sharing} onClick={() => setConfigureOpen(true)}>
            <Share2 size={14} className="mr-2" />
            创建分享链接
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {error ? <span className="text-xs text-destructive">{error}</span> : null}

      {/* 配置过期时间 */}
      <Dialog.Root open={configureOpen} onOpenChange={setConfigureOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(calc(100vw-2rem),24rem)] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-background p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <Dialog.Title className="font-serif text-base font-semibold italic">
                创建分享链接
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" type="button" aria-label="关闭">
                  <X size={16} />
                </Button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              生成当前对话的快照链接。过期后链接将自动失效，可随时撤销。
            </Dialog.Description>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-foreground">链接有效期</p>
              <div className="grid grid-cols-2 gap-2">
                {EXPIRY_OPTIONS.map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setExpiresInDays(opt.days)}
                    className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                      expiresInDays === opt.days
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfigureOpen(false)}>
                取消
              </Button>
              <Button type="button" size="sm" disabled={sharing} onClick={() => void handleCreateShare()}>
                {sharing ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
                生成链接
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* 分享结果 */}
      <Dialog.Root open={resultOpen} onOpenChange={setResultOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-background p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <Dialog.Title className="font-serif text-base font-semibold italic">
                分享链接已创建
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" type="button" aria-label="关闭">
                  <X size={16} />
                </Button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              任何人可通过此链接只读查看（无需登录）。
              {shareExpires ? (
                <>
                  {" "}
                  有效期至{" "}
                  {format(new Date(shareExpires), "yyyy-MM-dd HH:mm", { locale: zhCN })}（{selectedExpiryLabel}）。
                </>
              ) : (
                <> 该链接永久有效，请谨慎分享。</>
              )}
            </Dialog.Description>
            <div className="mt-4 flex gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 rounded-md border border-input bg-muted/40 px-3 py-2 text-xs"
              />
              <Button type="button" size="sm" className="shrink-0 gap-1" onClick={() => void handleCopyShare()}>
                {copied ? <Check size={14} /> : <Link2 size={14} />}
                {copied ? "已复制" : "复制"}
              </Button>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              分享内容为创建时的快照；过期或撤销后链接将无法访问。
            </p>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import * as Dialog from "@radix-ui/react-dialog";
import { Link2, Loader2, Trash2, X, Copy, Check, RefreshCw } from "lucide-react";
import {
  buildShareUrl,
  listSessionShares,
  revokeSessionShare,
  type ShareLinkItem,
} from "@/lib/chat-export-share";

type ShareManageDialogProps = {
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ShareManageDialog({ sessionId, open, onOpenChange }: ShareManageDialogProps) {
  const [items, setItems] = useState<ShareLinkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listSessionShares(sessionId);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (open && sessionId) void load();
  }, [open, sessionId, load]);

  const handleRevoke = async (token: string) => {
    try {
      await revokeSessionShare(token);
      setItems((prev) =>
        prev.map((s) =>
          s.share_token === token ? { ...s, revoked_at: new Date().toISOString() } : s
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "撤销失败");
    }
  };

  const handleCopy = async (path: string, token: string) => {
    await navigator.clipboard?.writeText(buildShareUrl(path));
    setCopiedToken(token);
    window.setTimeout(() => setCopiedToken(null), 1500);
  };

  const isExpired = (s: ShareLinkItem) => {
    if (s.revoked_at) return false;
    if (!s.expires_at) return false;
    return new Date(s.expires_at) < new Date();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(80vh,32rem)] w-[min(calc(100vw-2rem),32rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-sm border border-border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <Dialog.Title className="font-serif text-base font-semibold italic">管理分享链接</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" type="button" aria-label="关闭">
                <X size={16} />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                加载中…
              </div>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">暂无分享链接</p>
            ) : (
              <ul className="space-y-3">
                {items.map((s) => {
                  const revoked = !!s.revoked_at;
                  const expired = isExpired(s);
                  const inactive = revoked || expired;
                  return (
                    <li
                      key={s.id}
                      className="rounded-md border border-border bg-muted/20 px-3 py-3 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{s.title}</p>
                          <p className="mt-1 text-muted-foreground">
                            创建于 {format(new Date(s.created_at), "yyyy-MM-dd HH:mm", { locale: zhCN })}
                            {s.expires_at
                              ? ` · 有效至 ${format(new Date(s.expires_at), "yyyy-MM-dd HH:mm", { locale: zhCN })}`
                              : " · 永久有效"}
                          </p>
                          <p className="mt-0.5 text-muted-foreground">浏览 {s.view_count} 次</p>
                          {revoked ? (
                            <span className="mt-1 inline-block text-destructive">已撤销</span>
                          ) : expired ? (
                            <span className="mt-1 inline-block text-destructive">已过期</span>
                          ) : (
                            <span className="mt-1 inline-block text-primary">有效</span>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={inactive}
                            onClick={() => void handleCopy(s.share_path, s.share_token)}
                          >
                            {copiedToken === s.share_token ? (
                              <Check size={14} />
                            ) : (
                              <Link2 size={14} />
                            )}
                          </Button>
                          {!revoked ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:text-destructive"
                              onClick={() => void handleRevoke(s.share_token)}
                            >
                              <Trash2 size={14} />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
          </div>

          <div className="border-t border-border px-5 py-3">
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => void load()}>
              <RefreshCw size={14} />
              刷新列表
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

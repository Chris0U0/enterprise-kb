"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { SharedConversationView } from "@/components/copilot/shared-conversation-view";
import { fetchPublicShare, type PublicShareData } from "@/lib/chat-export-share";

export default function PublicSharePage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<PublicShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetchPublicShare(token);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-[#F9F7F2]">
      <div className="border-b border-border bg-white/80 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <span className="font-serif text-sm font-semibold italic text-foreground">
            Enterprise KB · 对话分享
          </span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] text-muted-foreground">
            只读
          </span>
        </div>
      </div>

      <main className="px-4 py-8 sm:px-6 sm:py-12">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">正在加载分享内容...</p>
          </div>
        ) : error ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
            <AlertCircle className="h-10 w-10 text-destructive/70" />
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-xs text-muted-foreground">链接可能已过期、被撤销或不存在。</p>
          </div>
        ) : data ? (
          <SharedConversationView
            title={data.title}
            projectName={data.project_name}
            sharedAt={data.shared_at}
            expiresAt={data.expires_at}
            viewCount={data.view_count}
            messages={data.messages}
          />
        ) : null}
      </main>
    </div>
  );
}

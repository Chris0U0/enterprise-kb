"use client";

import { useEffect, useState } from "react";
import { apiFetchJson } from "@/lib/api-client";

export type QaSessionItem = {
  session_id: string;
  question: string;
  answer_preview: string;
  created_at: string;
  citation_count: number;
  retrieval_method: string;
  user_id?: string | null;
};

type QaSessionListResponse = {
  items: QaSessionItem[];
  total: number;
  page: number;
  page_size: number;
};

export function useQaSessions(projectId: string | undefined, keyword: string) {
  const [items, setItems] = useState<QaSessionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const params = new URLSearchParams({
          project_id: projectId,
          page: "1",
          page_size: "50",
        });
        if (keyword.trim()) params.set("q", keyword.trim());
        const data = await apiFetchJson<QaSessionListResponse>(`/qa/sessions?${params.toString()}`);
        if (!cancelled) setItems(data.items);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载问答记录失败");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, keyword]);

  return { items, loading, error };
}


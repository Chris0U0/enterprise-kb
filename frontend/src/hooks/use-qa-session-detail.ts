"use client";

import { useEffect, useState } from "react";
import { apiFetchJson } from "@/lib/api-client";

export type QaSessionDetail = {
  session_id: string;
  project_id: string;
  question: string;
  answer: string;
  contexts: string[];
  cited_docs: string[];
  retrieval_method: string;
  latency_ms: number;
  created_at: string;
  user_id?: string | null;
};

export function useQaSessionDetail(sessionId: string | undefined) {
  const [detail, setDetail] = useState<QaSessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await apiFetchJson<QaSessionDetail>(`/qa/sessions/${sessionId}`);
        if (!cancelled) setDetail(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载会话详情失败");
          setDetail(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return { detail, loading, error };
}


"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "@/lib/api-client";

export type DocumentInfoApi = {
  id: string;
  project_id: string;
  original_filename: string;
  conversion_status: string;
  file_size_bytes: number | null;
  upload_at: string;
};

export function useProjectDocuments(projectId: string | undefined) {
  const [docs, setDocs] = useState<DocumentInfoApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!projectId) {
      setDocs([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const list = await apiFetchJson<DocumentInfoApi[]>(`/documents/list/${projectId}`);
        if (!cancelled) setDocs(list);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载文档失败");
          setDocs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, tick]);

  return { docs, loading, error, refetch };
}

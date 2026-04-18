"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "@/lib/api-client";

export type ProjectListItemApi = {
  id: string;
  name: string;
  description: string | null;
  phase: string;
  member_count: number;
  document_count: number;
  health: string;
  last_update_at: string | null;
  pending_summary: string;
};

type ProjectListResponse = {
  items: ProjectListItemApi[];
  total: number;
  page: number;
  page_size: number;
};

export function useProjectList(q?: string) {
  const [items, setItems] = useState<ProjectListItemApi[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: "1", page_size: "100" });
      if (q?.trim()) params.set("q", q.trim());
      const data = await apiFetchJson<ProjectListResponse>(`/projects?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { items, total, loading, error, refetch };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "@/lib/api-client";

export type ProjectMemberApi = {
  user_id: string;
  email: string;
  name: string;
  role: string;
  joined_at: string;
};

export function useProjectMembers(projectId: string | undefined) {
  const [members, setMembers] = useState<ProjectMemberApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!projectId) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const list = await apiFetchJson<ProjectMemberApi[]>(`/projects/${projectId}/members`);
        if (!cancelled) setMembers(list);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载成员失败");
          setMembers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, tick]);

  return { members, loading, error, refetch };
}

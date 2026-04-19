"use client";

import { useEffect, useState } from "react";
import { apiFetchJson } from "@/lib/api-client";
import {
  fallbackProjectRecord,
  mapOnboardingFromApi,
  type ProjectRecord,
} from "@/data/project-registry";
import { normalizeProjectRole } from "@/lib/project-permissions";

type ProjectDetailApi = {
  id: string;
  name: string;
  description?: string | null;
  phase: string;
  health: { progress: number; risk: number; quality: number };
  my_role?: string;
  onboarding: {
    has_uploaded_doc: boolean;
    has_indexed_knowledge: boolean;
    has_tried_qa: boolean;
    has_viewed_risk_or_report: boolean;
  };
};

export function useProject(projectId: string | undefined): {
  project: ProjectRecord | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [isLoading, setIsLoading] = useState(!!projectId);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void (async () => {
      try {
        const d = await apiFetchJson<ProjectDetailApi>(`/projects/${projectId}`);
        if (cancelled) return;
        setProject({
          id: d.id,
          name: d.name,
          phase: d.phase,
          description: d.description,
          health: d.health,
          onboarding: mapOnboardingFromApi(d.onboarding),
          myRole: normalizeProjectRole(d.my_role),
        });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "加载失败");
        setProject(fallbackProjectRecord(projectId));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, tick]);

  return {
    project,
    isLoading,
    error,
    refetch: () => setTick((t) => t + 1),
  };
}

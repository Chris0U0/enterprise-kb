"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { apiV1 } from "@/lib/api";
import { getAccessToken } from "@/lib/api-client";

export type StreamStep = {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
};

type CitationEvent = {
  doc_id?: string;
  doc_name?: string;
  section_path?: string;
  section_title?: string | null;
  page_num?: number | null;
};

const STEP_LABELS: Record<string, string> = {
  starting: "开始分析问题",
  plan_ready: "完成检索计划",
  step_completed: "完成一步检索执行",
  synthesizing: "正在综合答案",
  retrieving: "正在检索相关文档",
  retrieved: "检索完成，开始生成",
};

function upsertStep(prev: StreamStep[], phase: string): StreamStep[] {
  const id = phase;
  const label = STEP_LABELS[phase] ?? phase;
  const existing = prev.find((s) => s.id === id);
  if (!existing) {
    return [
      ...prev.map((s) => (s.status === "active" ? { ...s, status: "done" as const } : s)),
      { id, label, status: "active" },
    ];
  }
  return prev.map((s) => {
    if (s.id === id) return { ...s, status: "active" };
    if (s.status === "active") return { ...s, status: "done" };
    return s;
  });
}

export function useSearchStream() {
  const [running, setRunning] = useState(false);
  const [answer, setAnswer] = useState("");
  const [steps, setSteps] = useState<StreamStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [citations, setCitations] = useState<CitationEvent[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setAnswer("");
    setSteps([]);
    setError(null);
    setCitations([]);
  }, []);

  const start = useCallback(async (query: string, projectId: string, topK = 5) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setAnswer("");
    setSteps([]);
    setError(null);
    setCitations([]);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("未登录或登录已过期");
      const url = new URL(apiV1("/search/stream"));
      url.searchParams.set("query", query);
      url.searchParams.set("project_id", projectId);
      url.searchParams.set("top_k", String(topK));

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error("流式检索请求失败");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const evt of events) {
          let type = "";
          let dataText = "";
          for (const line of evt.split("\n")) {
            if (line.startsWith("event:")) type = line.slice(6).trim();
            if (line.startsWith("data:")) dataText += line.slice(5).trim();
          }
          if (!type || !dataText) continue;

          const data = JSON.parse(dataText) as Record<string, unknown>;
          if (type === "step" && typeof data.phase === "string") {
            setSteps((prev) => upsertStep(prev, data.phase as string));
          } else if (type === "chunk" && typeof data.text === "string") {
            setAnswer((prev) => prev + (data.text as string));
          } else if (type === "citation") {
            setCitations((prev) => [...prev, data as CitationEvent]);
          } else if (type === "error") {
            setError(typeof data.message === "string" ? data.message : "流式检索失败");
          } else if (type === "done") {
            setSteps((prev) => prev.map((s) => ({ ...s, status: "done" })));
          }
        }
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "流式检索失败");
    } finally {
      if (!controller.signal.aborted) {
        setRunning(false);
      }
    }
  }, []);

  const citationLabels = useMemo(
    () =>
      citations.map((c, idx) => {
        const suffix = c.page_num ? ` · 第${c.page_num}页` : "";
        const section = c.section_title ?? c.section_path ?? "";
        return {
          id: `${c.doc_id ?? "doc"}-${idx}`,
          label: `${c.doc_name ?? "未知文档"}${section ? ` · ${section}` : ""}${suffix}`,
          href: "/knowledge",
        };
      }),
    [citations]
  );

  return { running, answer, steps, error, start, reset, citationLabels };
}


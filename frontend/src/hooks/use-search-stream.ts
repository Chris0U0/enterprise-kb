"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type StreamRun = {
  key: string;
  sessionId: string | null;
  running: boolean;
  answer: string;
  steps: StreamStep[];
  error: string | null;
  citations: CitationEvent[];
  pendingQuery: string;
  controller: AbortController;
};

type DisplayState = {
  running: boolean;
  answer: string;
  steps: StreamStep[];
  error: string | null;
  citations: CitationEvent[];
  pendingQuery: string | null;
};

const STEP_LABELS: Record<string, string> = {
  starting: "开始分析问题",
  plan_ready: "完成检索计划",
  step_completed: "完成一步检索执行",
  synthesizing: "正在综合答案",
  retrieving: "正在检索相关文档",
  retrieved: "检索完成，开始生成",
};

const emptyDisplay: DisplayState = {
  running: false,
  answer: "",
  steps: [],
  error: null,
  citations: [],
  pendingQuery: null,
};

let pendingCounter = 0;

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

function streamToDisplay(stream: StreamRun): DisplayState {
  return {
    running: stream.running,
    answer: stream.answer,
    steps: stream.steps,
    error: stream.error,
    citations: stream.citations,
    pendingQuery: stream.pendingQuery,
  };
}

export type UseSearchStreamOptions = {
  /** 当前 UI 正在查看的会话 ID，null 表示新对话空白页 */
  viewSessionId?: string | null;
  /** SSE 返回 session_id 时回调（用于同步 URL） */
  onSessionCreated?: (sessionId: string) => void;
  /** 某会话流式结束后回调（用于 refetch 历史） */
  onStreamComplete?: (sessionId: string) => void;
};

export function useSearchStream(options: UseSearchStreamOptions = {}) {
  const viewSessionId = options.viewSessionId ?? null;
  const onSessionCreatedRef = useRef(options.onSessionCreated);
  const onStreamCompleteRef = useRef(options.onStreamComplete);
  onSessionCreatedRef.current = options.onSessionCreated;
  onStreamCompleteRef.current = options.onStreamComplete;

  const streamsRef = useRef<Map<string, StreamRun>>(new Map());
  /** 新对话页面上尚未获得 session_id 的流 */
  const activePendingKeyRef = useRef<string | null>(null);

  const [display, setDisplay] = useState<DisplayState>(emptyDisplay);
  const [streamingSessionIds, setStreamingSessionIds] = useState<string[]>([]);
  const [, bump] = useState(0);
  const forceUpdate = () => bump((n) => n + 1);

  const refreshStreamingIds = useCallback(() => {
    const ids = [...streamsRef.current.values()]
      .filter((s) => s.running && s.sessionId)
      .map((s) => s.sessionId as string);
    setStreamingSessionIds(ids);
  }, []);

  const getDisplayStream = useCallback((): StreamRun | undefined => {
    if (viewSessionId) {
      return streamsRef.current.get(viewSessionId);
    }
    const pendingKey = activePendingKeyRef.current;
    if (pendingKey) {
      return streamsRef.current.get(pendingKey);
    }
    return undefined;
  }, [viewSessionId]);

  const syncDisplayToView = useCallback(() => {
    const stream = getDisplayStream();
    setDisplay(stream ? streamToDisplay(stream) : emptyDisplay);
  }, [getDisplayStream]);

  useEffect(() => {
    syncDisplayToView();
  }, [viewSessionId, syncDisplayToView]);

  const patchStream = useCallback(
    (key: string, patch: Partial<StreamRun>) => {
      const stream = streamsRef.current.get(key);
      if (!stream) return;
      Object.assign(stream, patch);
      const visible =
        (viewSessionId && stream.sessionId === viewSessionId) ||
        (!viewSessionId && activePendingKeyRef.current === key);
      if (visible) {
        setDisplay(streamToDisplay(stream));
      }
      forceUpdate();
      refreshStreamingIds();
    },
    [viewSessionId, refreshStreamingIds]
  );

  const finishStream = useCallback(
    (key: string, resolvedSessionId: string | null) => {
      const stream = streamsRef.current.get(key);
      if (!stream) return;

      const sid =
        resolvedSessionId ??
        stream.sessionId ??
        (key.startsWith("pending-") ? null : key);

      stream.running = false;

      if (activePendingKeyRef.current === key) {
        activePendingKeyRef.current = null;
      }

      if (sid && key !== sid) {
        streamsRef.current.delete(key);
        stream.key = sid;
        stream.sessionId = sid;
        streamsRef.current.set(sid, stream);
      }

      if (sid) {
        onStreamCompleteRef.current?.(sid);
      }

      if (viewSessionId && sid === viewSessionId) {
        setDisplay(emptyDisplay);
      } else {
        syncDisplayToView();
      }
      forceUpdate();
      refreshStreamingIds();

      if (sid) {
        window.setTimeout(() => {
          const s = streamsRef.current.get(sid);
          if (s && !s.running) {
            streamsRef.current.delete(sid);
            syncDisplayToView();
          }
        }, 500);
      }
    },
    [viewSessionId, syncDisplayToView, refreshStreamingIds]
  );

  const abortStreamByKey = useCallback((key: string) => {
    const stream = streamsRef.current.get(key);
    if (!stream) return;
    stream.controller.abort();
    streamsRef.current.delete(key);
    if (activePendingKeyRef.current === key) {
      activePendingKeyRef.current = null;
    }
    syncDisplayToView();
    forceUpdate();
    refreshStreamingIds();
  }, [syncDisplayToView, refreshStreamingIds]);

  /** 中止所有后台流（切换项目等场景） */
  const abortAllStreams = useCallback(() => {
    for (const stream of streamsRef.current.values()) {
      stream.controller.abort();
    }
    streamsRef.current.clear();
    activePendingKeyRef.current = null;
    setDisplay(emptyDisplay);
    setStreamingSessionIds([]);
    forceUpdate();
  }, []);

  /** 仅清空当前视图展示，不中断后台流 */
  const clearDisplay = useCallback(() => {
    activePendingKeyRef.current = null;
    setDisplay(emptyDisplay);
  }, []);

  /** 停止当前视图正在进行的生成 */
  const stopCurrentStream = useCallback(() => {
    if (viewSessionId) {
      abortStreamByKey(viewSessionId);
      return;
    }
    if (activePendingKeyRef.current) {
      abortStreamByKey(activePendingKeyRef.current);
    }
  }, [viewSessionId, abortStreamByKey]);

  const start = useCallback(
    async (
      query: string,
      projectId: string,
      topK = 5,
      useCurrentSession = true,
      deep = false,
      explicitSessionId?: string | null
    ) => {
      const targetSessionId = useCurrentSession ? (explicitSessionId ?? viewSessionId) : null;

      // 同一会话重复提问：仅中止该会话的旧流
      if (targetSessionId) {
        abortStreamByKey(targetSessionId);
      } else if (activePendingKeyRef.current) {
        abortStreamByKey(activePendingKeyRef.current);
      }

      const streamKey = targetSessionId ?? `pending-${++pendingCounter}`;
      if (!targetSessionId) {
        activePendingKeyRef.current = streamKey;
      }

      const controller = new AbortController();
      const run: StreamRun = {
        key: streamKey,
        sessionId: targetSessionId,
        running: true,
        answer: "",
        steps: [],
        error: null,
        citations: [],
        pendingQuery: query,
        controller,
      };
      streamsRef.current.set(streamKey, run);
      setDisplay(streamToDisplay(run));
      forceUpdate();
      refreshStreamingIds();

      let resolvedSessionId: string | null = targetSessionId;

      try {
        const token = getAccessToken();
        if (!token) throw new Error("未登录或登录已过期");

        const url = new URL(apiV1("/search/stream"));
        url.searchParams.set("query", query);
        url.searchParams.set("project_id", projectId);
        url.searchParams.set("top_k", String(topK));
        if (deep) url.searchParams.set("deep", "true");
        if (targetSessionId) url.searchParams.set("session_id", targetSessionId);

        const res = await fetch(url.toString(), {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
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

            try {
              const data = JSON.parse(dataText) as Record<string, unknown>;
              const currentKey = resolvedSessionId ?? streamKey;

              if (type === "session_id" && typeof data.id === "string") {
                const newId = data.id as string;
                resolvedSessionId = newId;
                const existing = streamsRef.current.get(streamKey);
                if (existing) {
                  streamsRef.current.delete(streamKey);
                  existing.sessionId = newId;
                  existing.key = newId;
                  streamsRef.current.set(newId, existing);
                  if (activePendingKeyRef.current === streamKey) {
                    activePendingKeyRef.current = null;
                  }
                }
                onSessionCreatedRef.current?.(newId);
                refreshStreamingIds();
              } else if (type === "step" && typeof data.phase === "string") {
                const s = streamsRef.current.get(currentKey) ?? streamsRef.current.get(streamKey);
                if (s) patchStream(s.key, { steps: upsertStep(s.steps, data.phase as string) });
              } else if (type === "chunk" && typeof data.text === "string") {
                const s = streamsRef.current.get(currentKey) ?? streamsRef.current.get(streamKey);
                if (s) patchStream(s.key, { answer: s.answer + (data.text as string) });
              } else if (type === "citation") {
                const s = streamsRef.current.get(currentKey) ?? streamsRef.current.get(streamKey);
                if (s) patchStream(s.key, { citations: [...s.citations, data as CitationEvent] });
              } else if (type === "error") {
                const s = streamsRef.current.get(currentKey) ?? streamsRef.current.get(streamKey);
                if (s) {
                  patchStream(s.key, {
                    error: typeof data.message === "string" ? data.message : "流式检索失败",
                  });
                }
              } else if (type === "done") {
                const s = streamsRef.current.get(currentKey) ?? streamsRef.current.get(streamKey);
                if (s) {
                  patchStream(s.key, { steps: s.steps.map((st) => ({ ...st, status: "done" as const })) });
                }
                if (typeof data.session_id === "string") {
                  resolvedSessionId = resolvedSessionId ?? (data.session_id as string);
                }
              }
            } catch (err) {
              console.error("Parse SSE data error:", err, dataText);
            }
          }
        }

        finishStream(streamKey, resolvedSessionId);
      } catch (e) {
        if (controller.signal.aborted) return;
        patchStream(streamKey, {
          error: e instanceof Error ? e.message : "流式检索失败",
        });
        finishStream(streamKey, resolvedSessionId);
      }
    },
    [viewSessionId, abortStreamByKey, patchStream, finishStream, refreshStreamingIds]
  );

  const isSessionStreaming = useCallback(
    (sessionId: string) => streamingSessionIds.includes(sessionId),
    [streamingSessionIds]
  );

  const citationLabels = useMemo(
    () =>
      display.citations.map((c, idx) => {
        const suffix = c.page_num ? ` · 第${c.page_num}页` : "";
        const section = c.section_title ?? c.section_path ?? "";
        const params = new URLSearchParams({
          ...(c.doc_id ? { docId: c.doc_id } : {}),
          ...(c.section_path ? { sectionPath: c.section_path } : {}),
          ...(typeof c.page_num === "number" ? { pageNum: String(c.page_num) } : {}),
        });
        return {
          id: `${c.doc_id ?? "doc"}-${idx}`,
          label: `${c.doc_name ?? "未知文档"}${section ? ` · ${section}` : ""}${suffix}`,
          href: params.toString() ? `/knowledge?${params.toString()}` : "/knowledge",
        };
      }),
    [display.citations]
  );

  return {
    running: display.running,
    answer: display.answer,
    steps: display.steps,
    error: display.error,
    citations: display.citations,
    pendingQuery: display.pendingQuery,
    citationLabels,
    start,
    clearDisplay,
    stopCurrentStream,
    abortAllStreams,
    abortStreamByKey,
    isSessionStreaming,
  };
}

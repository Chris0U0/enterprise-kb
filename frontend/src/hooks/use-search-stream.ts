"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiV1 } from "@/lib/api";
import { getAccessToken } from "@/lib/api-client";

import { toCitationListItem } from "@/lib/citation-target";
import { savePartialAssistant } from "@/hooks/use-chat-sessions";

export type PlanStepItem = {
  id: string | number;
  thought: string;
  action: string;
};

export type StreamStep = {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
  message?: string;
  planSteps?: PlanStepItem[];
  found?: string;
  sourcesCount?: number;
  confidence?: number;
};

export type ThinkingTrace = {
  stepId: string | number;
  thought: string;
  action?: string;
  query?: string;
};

type CitationEvent = {
  doc_id?: string;
  doc_name?: string;
  section_path?: string;
  section_title?: string | null;
  page_num?: number | null;
};

type QueuedQuery = {
  query: string;
  projectId: string;
  topK: number;
  deep: boolean;
  sessionId: string | null;
};

type StreamRun = {
  key: string;
  sessionId: string | null;
  running: boolean;
  answer: string;
  steps: StreamStep[];
  thinkingTraces: ThinkingTrace[];
  error: string | null;
  failedQuery: string | null;
  citations: CitationEvent[];
  pendingQuery: string;
  controller: AbortController;
};

type DisplayState = {
  running: boolean;
  answer: string;
  steps: StreamStep[];
  thinkingTraces: ThinkingTrace[];
  error: string | null;
  failedQuery: string | null;
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
  thinkingTraces: [],
  error: null,
  failedQuery: null,
  citations: [],
  pendingQuery: null,
};

const PENDING_QUEUE_KEY = "__pending__";

let pendingCounter = 0;

function parsePlanSteps(data: Record<string, unknown>): PlanStepItem[] | undefined {
  if (!Array.isArray(data.steps)) return undefined;
  return data.steps
    .map((s) => {
      if (!s || typeof s !== "object") return null;
      const row = s as Record<string, unknown>;
      return {
        id: (row.id ?? row.step_id ?? "") as string | number,
        thought: typeof row.thought === "string" ? row.thought : "",
        action: typeof row.action === "string" ? row.action : "",
      };
    })
    .filter(Boolean) as PlanStepItem[];
}

function applyStepEvent(prev: StreamStep[], data: Record<string, unknown>): StreamStep[] {
  const phase = typeof data.phase === "string" ? data.phase : "";
  if (!phase) return prev;

  const message = typeof data.message === "string" ? data.message : undefined;
  const label = message ?? STEP_LABELS[phase] ?? phase;
  const planSteps = phase === "plan_ready" ? parsePlanSteps(data) : undefined;
  const found = typeof data.found === "string" ? data.found : undefined;
  const sourcesCount = typeof data.sources_count === "number" ? data.sources_count : undefined;
  const confidence = typeof data.confidence === "number" ? data.confidence : undefined;

  const stepId =
    phase === "step_completed" && (typeof data.step_id === "number" || typeof data.step_id === "string")
      ? `step_completed_${data.step_id}`
      : phase;

  const existing = prev.find((s) => s.id === stepId);
  const nextStep: StreamStep = {
    id: stepId,
    label,
    status: "active",
    message,
    planSteps,
    found,
    sourcesCount,
    confidence,
  };

  if (!existing) {
    return [
      ...prev.map((s) => (s.status === "active" ? { ...s, status: "done" as const } : s)),
      nextStep,
    ];
  }

  return prev.map((s) => {
    if (s.id === stepId) return { ...s, ...nextStep, status: "active" as const };
    if (s.status === "active") return { ...s, status: "done" as const };
    return s;
  });
}

function streamToDisplay(stream: StreamRun): DisplayState {
  return {
    running: stream.running,
    answer: stream.answer,
    steps: stream.steps,
    thinkingTraces: stream.thinkingTraces,
    error: stream.error,
    failedQuery: stream.failedQuery,
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
  const queueRef = useRef<Map<string, QueuedQuery[]>>(new Map());
  const startImplRef = useRef<
    (
      query: string,
      projectId: string,
      topK?: number,
      useCurrentSession?: boolean,
      deep?: boolean,
      explicitSessionId?: string | null
    ) => Promise<void>
  >(async () => {});
  /** 新对话页面上尚未获得 session_id 的流 */
  const activePendingKeyRef = useRef<string | null>(null);

  const [display, setDisplay] = useState<DisplayState>(emptyDisplay);
  const [streamingSessionIds, setStreamingSessionIds] = useState<string[]>([]);
  const [queuedCount, setQueuedCount] = useState(0);
  const [, bump] = useState(0);
  const forceUpdate = () => bump((n) => n + 1);

  const refreshStreamingIds = useCallback(() => {
    const ids = [...streamsRef.current.values()]
      .filter((s) => s.running && s.sessionId)
      .map((s) => s.sessionId as string);
    setStreamingSessionIds(ids);
  }, []);

  const queueKeyFor = useCallback(
    (sessionId: string | null) => sessionId ?? PENDING_QUEUE_KEY,
    []
  );

  const refreshQueuedCount = useCallback(() => {
    const key = queueKeyFor(viewSessionId);
    setQueuedCount(queueRef.current.get(key)?.length ?? 0);
  }, [viewSessionId, queueKeyFor]);

  const drainQueue = useCallback(
    (sessionId: string | null) => {
      const key = queueKeyFor(sessionId);
      const queue = queueRef.current.get(key);
      if (!queue?.length) {
        refreshQueuedCount();
        return;
      }
      const next = queue.shift()!;
      if (!queue.length) queueRef.current.delete(key);
      refreshQueuedCount();
      void startImplRef.current(
        next.query,
        next.projectId,
        next.topK,
        true,
        next.deep,
        next.sessionId
      );
    },
    [queueKeyFor, refreshQueuedCount]
  );

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
    (key: string, resolvedSessionId: string | null, opts?: { keepVisible?: boolean }) => {
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

      const hasError = !!stream.error;
      if (hasError && !stream.failedQuery) {
        stream.failedQuery = stream.pendingQuery;
      }

      if (sid && !hasError) {
        onStreamCompleteRef.current?.(sid);
      }

      if (viewSessionId && sid === viewSessionId) {
        if (hasError || opts?.keepVisible) {
          setDisplay(streamToDisplay(stream));
        } else {
          setDisplay(emptyDisplay);
        }
      } else if (!viewSessionId && !sid && hasError) {
        setDisplay(streamToDisplay(stream));
      } else {
        syncDisplayToView();
      }
      forceUpdate();
      refreshStreamingIds();

      if (hasError) {
        return;
      }

      if (sid) {
        window.setTimeout(() => {
          const s = streamsRef.current.get(sid);
          if (s && !s.running) {
            streamsRef.current.delete(sid);
            syncDisplayToView();
          }
        }, 500);
      }

      drainQueue(sid);
    },
    [viewSessionId, syncDisplayToView, refreshStreamingIds, drainQueue]
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
    queueRef.current.clear();
    activePendingKeyRef.current = null;
    setDisplay(emptyDisplay);
    setStreamingSessionIds([]);
    setQueuedCount(0);
    forceUpdate();
  }, []);

  /** 仅清空当前视图展示，不中断后台流 */
  const clearDisplay = useCallback(() => {
    activePendingKeyRef.current = null;
    queueRef.current.delete(queueKeyFor(viewSessionId));
    if (!viewSessionId) {
      queueRef.current.delete(PENDING_QUEUE_KEY);
    }
    setQueuedCount(0);
    setDisplay(emptyDisplay);
  }, [viewSessionId, queueKeyFor]);

  /** 停止当前视图正在进行的生成，并保存已输出内容 */
  const stopCurrentStream = useCallback(async () => {
    const stream = getDisplayStream();
    if (!stream?.running) return;

    const key = stream.key;
    const sid = stream.sessionId;
    stream.controller.abort();

    if (sid && stream.answer.trim()) {
      try {
        await savePartialAssistant(sid, stream.answer.trim(), stream.citations);
        onStreamCompleteRef.current?.(sid);
      } catch (e) {
        console.error("保存部分内容失败:", e);
      }
    }

    streamsRef.current.delete(key);
    if (activePendingKeyRef.current === key) {
      activePendingKeyRef.current = null;
    }

    if (viewSessionId && sid === viewSessionId) {
      setDisplay(emptyDisplay);
    } else {
      syncDisplayToView();
    }
    forceUpdate();
    refreshStreamingIds();
    drainQueue(sid);
  }, [getDisplayStream, viewSessionId, syncDisplayToView, refreshStreamingIds, drainQueue]);

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
      const runningKey = targetSessionId ?? activePendingKeyRef.current ?? null;
      if (runningKey) {
        const existing = streamsRef.current.get(runningKey);
        if (existing?.running) {
          const qKey = queueKeyFor(targetSessionId);
          const queue = queueRef.current.get(qKey) ?? [];
          queue.push({ query, projectId, topK, deep, sessionId: targetSessionId });
          queueRef.current.set(qKey, queue);
          refreshQueuedCount();
          return;
        }
      }

      // 同一会话重复提问（非排队场景）：中止该会话的旧流
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
        thinkingTraces: [],
        error: null,
        failedQuery: null,
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
                const pendingQ = queueRef.current.get(PENDING_QUEUE_KEY);
                if (pendingQ?.length) {
                  const existingQ = queueRef.current.get(newId) ?? [];
                  queueRef.current.set(newId, [...existingQ, ...pendingQ]);
                  queueRef.current.delete(PENDING_QUEUE_KEY);
                  refreshQueuedCount();
                }
                refreshStreamingIds();
              } else if (type === "step" && typeof data.phase === "string") {
                const s = streamsRef.current.get(currentKey) ?? streamsRef.current.get(streamKey);
                if (s) patchStream(s.key, { steps: applyStepEvent(s.steps, data) });
              } else if (type === "thinking") {
                const s = streamsRef.current.get(currentKey) ?? streamsRef.current.get(streamKey);
                if (s) {
                  const trace: ThinkingTrace = {
                    stepId:
                      typeof data.step_id === "number" || typeof data.step_id === "string"
                        ? data.step_id
                        : s.thinkingTraces.length + 1,
                    thought: typeof data.thought === "string" ? data.thought : "",
                    action: typeof data.action === "string" ? data.action : undefined,
                    query: typeof data.query === "string" ? data.query : undefined,
                  };
                  patchStream(s.key, { thinkingTraces: [...s.thinkingTraces, trace] });
                }
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
                    failedQuery: s.pendingQuery,
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
        if (controller.signal.aborted) {
          drainQueue(resolvedSessionId);
          return;
        }
        patchStream(streamKey, {
          error: e instanceof Error ? e.message : "流式检索失败",
          failedQuery: query,
        });
        finishStream(streamKey, resolvedSessionId);
      }
    },
    [
      viewSessionId,
      abortStreamByKey,
      patchStream,
      finishStream,
      refreshStreamingIds,
      queueKeyFor,
      refreshQueuedCount,
      drainQueue,
    ]
  );

  startImplRef.current = start;

  const retryLastQuery = useCallback(
    (projectId: string, topK = 5, deep = false) => {
      const q = display.failedQuery ?? display.pendingQuery;
      if (!q) return;
      const stream = getDisplayStream();
      if (stream) {
        streamsRef.current.delete(stream.key);
      }
      setDisplay(emptyDisplay);
      void start(q, projectId, topK, true, deep, viewSessionId);
    },
    [display.failedQuery, display.pendingQuery, getDisplayStream, start, viewSessionId]
  );

  const isSessionStreaming = useCallback(
    (sessionId: string) => streamingSessionIds.includes(sessionId),
    [streamingSessionIds]
  );

  const citationLabels = useMemo(
    () =>
      display.citations.map((c, idx) =>
        toCitationListItem(c, `${c.doc_id ?? "doc"}-${idx}`)
      ),
    [display.citations]
  );

  return {
    running: display.running,
    answer: display.answer,
    steps: display.steps,
    thinkingTraces: display.thinkingTraces,
    error: display.error,
    failedQuery: display.failedQuery,
    citations: display.citations,
    pendingQuery: display.pendingQuery,
    citationLabels,
    queuedCount,
    start,
    retryLastQuery,
    clearDisplay,
    stopCurrentStream,
    abortAllStreams,
    abortStreamByKey,
    isSessionStreaming,
  };
}

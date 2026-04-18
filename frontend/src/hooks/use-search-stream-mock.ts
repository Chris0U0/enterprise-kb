"use client";

import { useCallback, useRef, useState } from "react";

export type StreamStep = {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
};

const BASE: { id: string; label: string }[] = [
  { id: "route", label: "路由：选择检索策略（向量快路径 / Agent 多步）" },
  { id: "retrieve", label: "检索：召回相关章节与图谱邻居" },
  { id: "synth", label: "生成：整合引用并输出答案" },
];

const COMPLEX_EXTRA = {
  id: "plan",
  label: "Agent：拆解子问题并多步检索",
};

export function useSearchStreamMock() {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StreamStep[]>(() =>
    BASE.map((s, i) => ({
      ...s,
      status: i === 0 ? "active" : "pending",
    }))
  );
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const run = useCallback((complex: boolean) => {
    clearTimers();
    const chain = complex
      ? [BASE[0], COMPLEX_EXTRA, ...BASE.slice(1)]
      : [...BASE];

    setRunning(true);
    setSteps(
      chain.map((s, i) => ({
        ...s,
        status: i === 0 ? "active" : "pending",
      }))
    );

    const delay = complex ? 650 : 380;
    let step = 0;

    const tick = () => {
      step += 1;
      if (step >= chain.length) {
        setSteps(chain.map((s) => ({ ...s, status: "done" as const })));
        setRunning(false);
        return;
      }
      setSteps(
        chain.map((s, i) => {
          if (i < step) return { ...s, status: "done" as const };
          if (i === step) return { ...s, status: "active" as const };
          return { ...s, status: "pending" as const };
        })
      );
      const t = window.setTimeout(tick, delay);
      timers.current.push(t);
    };

    const t0 = window.setTimeout(tick, complex ? 420 : 260);
    timers.current.push(t0);
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setSteps(
      BASE.map((s, i) => ({
        ...s,
        status: i === 0 ? "active" : "pending",
      }))
    );
    setRunning(false);
  }, []);

  return { steps, running, run, reset };
}

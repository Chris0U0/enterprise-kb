"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetchJson } from "@/lib/api-client";

export type ChatSession = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: any[];
  created_at: string;
};

export function useChatSessions(projectId: string | undefined) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!projectId) {
      setSessions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetchJson<ChatSession[]>(`/chat/sessions?project_id=${projectId}`);
      setSessions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载会话列表失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  const deleteSession = async (sessionId: string) => {
    try {
      await apiFetchJson(`/chat/sessions/${sessionId}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (e) {
      console.error("删除会话失败:", e);
    }
  };

  return { sessions, loading, error, refetch: fetchSessions, deleteSession };
}

export function useChatMessages(sessionId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await apiFetchJson<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`);
        if (!cancelled) setMessages(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载历史消息失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  return { messages, setMessages, loading, error };
}

"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiFetchJson, clearTokens, getAccessToken, setTokens } from "@/lib/api-client";

export interface User {
  id: string;
  email: string;
  role: "Admin" | "Editor" | "Viewer";
  name: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type TokenResponse = {
  access_token: string;
  refresh_token?: string | null;
  expires_in: number;
  refresh_expires_in?: number | null;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
};

function normalizeRole(r: string): User["role"] {
  const x = r.toLowerCase();
  if (x === "admin") return "Admin";
  if (x === "editor") return "Editor";
  return "Viewer";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const loadMe = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const me = await apiFetchJson<{
        id: string;
        email: string;
        name: string;
        role: string;
      }>("/auth/me");
      setUser({
        id: me.id,
        email: me.email,
        name: me.name,
        role: normalizeRole(me.role),
      });
    } catch {
      clearTokens();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await loadMe();
      setIsLoading(false);
    })();
  }, [loadMe]);

  useEffect(() => {
    if (!isLoading && !user && pathname !== "/login") {
      router.push("/login");
    }
  }, [user, isLoading, pathname, router]);

  useEffect(() => {
    if (!isLoading && user && pathname === "/login") {
      router.push("/");
    }
  }, [user, isLoading, pathname, router]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const data = await apiFetchJson<TokenResponse>("/auth/login", {
        method: "POST",
        json: { email: email.trim(), password },
      });
      setTokens(data.access_token, data.refresh_token ?? undefined);
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: normalizeRole(data.user.role),
      });
      router.push("/");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    clearTokens();
    setUser(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

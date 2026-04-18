"use client";

import React from 'react';
import { Sidebar } from "./sidebar";
import { useAuth } from "@/lib/auth-context";
import { usePathname } from 'next/navigation';
import { Loader2 } from "lucide-react";

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();

  // 登录页面不需要布局
  if (pathname === '/login') {
    return <>{children}</>;
  }

  // 加载状态
  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-serif italic text-muted-foreground">正在进入系统...</p>
        </div>
      </div>
    );
  }

  // 未登录或跳转
  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F9F7F2]">
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

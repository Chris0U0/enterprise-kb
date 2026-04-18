"use client";

import React from "react";
import { cn } from "@/lib/utils";

export type AppPageMaxWidth = "full" | "6xl" | "7xl";

export function AppPage({
  children,
  className,
  innerClassName,
  maxWidth = "7xl",
  /** 与侧栏主区一致的浅纸色 */
  surface = "paper",
  /** 占满主内容区宽度，不做 max-w 居中（图谱、全宽表格等） */
  fullWidth = false,
  /** 去掉默认内边距（沉浸式页面） */
  noPadding = false,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  maxWidth?: AppPageMaxWidth;
  surface?: "paper" | "canvas";
  fullWidth?: boolean;
  noPadding?: boolean;
}) {
  const maxClass =
    maxWidth === "full" || fullWidth
      ? "max-w-full"
      : maxWidth === "6xl"
        ? "max-w-6xl"
        : "max-w-7xl";

  return (
    <div
      className={cn(
        "min-h-full font-sans",
        surface === "paper" && "bg-[#F9F7F2]",
        surface === "canvas" && "bg-background",
        !noPadding && "p-4 sm:p-6 lg:p-8",
        className
      )}
    >
      <div
        className={cn(
          !fullWidth && maxClass,
          !fullWidth && "mx-auto",
          "space-y-8",
          innerClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

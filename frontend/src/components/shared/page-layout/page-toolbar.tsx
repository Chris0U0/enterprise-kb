"use client";

import React from "react";
import { cn } from "@/lib/utils";

export function PageToolbar({
  children,
  end,
  className,
}: {
  children?: React.ReactNode;
  end?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">{children}</div>
      {end ? (
        <div className="text-xs text-muted-foreground shrink-0 sm:text-right">
          {end}
        </div>
      ) : null}
    </div>
  );
}

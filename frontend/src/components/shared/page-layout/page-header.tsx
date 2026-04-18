"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";

export function PageHeader({
  title,
  description,
  breadcrumbs,
  icon,
  actions,
  className,
  titleClassName,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <header className={cn("border-b border-border pb-6", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2 min-w-0">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <Breadcrumbs items={breadcrumbs} />
          )}
          <div className="flex items-start gap-3">
            {icon ? <div className="mt-1 shrink-0 text-primary">{icon}</div> : null}
            <div className="min-w-0">
              <h1
                className={cn(
                  "text-2xl sm:text-3xl lg:text-4xl font-bold italic tracking-tight font-serif",
                  titleClassName
                )}
              >
                {title}
              </h1>
              {description ? (
                <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        {actions ? (
          <div className="flex flex-wrap gap-2 shrink-0 lg:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

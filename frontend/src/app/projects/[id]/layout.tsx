"use client";

import { ProjectSubNav } from "@/components/shared/project-sub-nav";

export default function ProjectIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <ProjectSubNav />
      {children}
    </div>
  );
}

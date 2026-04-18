"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquareText,
  PackageOpen,
  UsersRound,
  Library,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { suffix: "" as const, label: "概览", icon: LayoutDashboard },
  { suffix: "knowledge", label: "知识库", icon: Library },
  { suffix: "qa", label: "问答记录", icon: MessageSquareText },
  { suffix: "artifacts", label: "产出物", icon: PackageOpen },
  { suffix: "collab", label: "协作空间", icon: UsersRound },
] as const;

export function ProjectSubNav() {
  const params = useParams();
  const pathname = usePathname();
  const id = params.id as string;
  const base = `/projects/${id}`;

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-[#F9F7F2]/95 backdrop-blur-sm">
      <nav
        className="flex gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="项目模块"
      >
        {items.map(({ suffix, label, icon: Icon }) => {
          const href = suffix ? `${base}/${suffix}` : base;
          const isActive =
            suffix === ""
              ? pathname === base
              : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={suffix || "overview"}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-sm px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

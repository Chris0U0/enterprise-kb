"use client";

import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";

/**
 * 只读或其它权限受限时，在内容区顶部展示说明条（不遮挡阅读）。
 */
export function ReadOnlyBanner({
  className,
  message = "当前为只读角色，无法执行编辑、上传与审批类操作。",
}: {
  className?: string;
  message?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-sm border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950",
        className
      )}
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
      <p className="leading-relaxed">{message}</p>
    </div>
  );
}

"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type StatusVariant =
  | "default"
  | "processing"
  | "success"
  | "warning"
  | "error"
  | "pending";

const styles: Record<
  StatusVariant,
  string
> = {
  default: "border-border bg-muted/80 text-foreground",
  processing: "border-blue-200 bg-blue-50 text-blue-800",
  success: "border-green-200 bg-green-50 text-green-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-800",
  pending: "border-border bg-secondary text-secondary-foreground",
};

export function StatusBadge({
  status = "default",
  className,
  ...props
}: Omit<React.ComponentProps<typeof Badge>, "variant"> & {
  status?: StatusVariant;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-bold tracking-wide",
        styles[status],
        className
      )}
      {...props}
    />
  );
}

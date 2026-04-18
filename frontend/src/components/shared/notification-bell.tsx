"use client";

import * as React from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

type Notice = { id: string; title: string; time: string; href: string };

const MOCK_NOTICES: Notice[] = [
  {
    id: "1",
    title: "「核心代码逻辑V3」待您审批入库",
    time: "10 分钟前",
    href: "/admin/approval",
  },
  {
    id: "2",
    title: "项目「智能排班系统」风险等级已更新",
    time: "1 小时前",
    href: "/projects/1",
  },
  {
    id: "3",
    title: "文档「需求文档V2」解析完成",
    time: "昨日",
    href: "/knowledge",
  },
];

export function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const unread = MOCK_NOTICES.length;

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label={`通知${unread ? `，${unread} 条未读` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cn(
            "z-50 w-[min(100vw-2rem,22rem)] rounded-sm border border-border bg-background p-0 shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out"
          )}
          align="end"
          sideOffset={8}
        >
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              通知
            </p>
          </div>
          <ScrollArea className="max-h-[min(60vh,320px)]">
            <ul className="divide-y divide-border">
              {MOCK_NOTICES.map((n) => (
                <li key={n.id}>
                  <DropdownMenu.Item asChild>
                    <Link
                      href={n.href}
                      className="block px-3 py-3 text-left text-sm outline-none hover:bg-muted/60 focus:bg-muted/60"
                      onClick={() => setOpen(false)}
                    >
                      <span className="line-clamp-2 font-medium leading-snug">
                        {n.title}
                      </span>
                      <span className="mt-1 block text-[10px] text-muted-foreground">
                        {n.time}
                      </span>
                    </Link>
                  </DropdownMenu.Item>
                </li>
              ))}
            </ul>
          </ScrollArea>
          <div className="border-t border-border p-2">
            <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
              <Link href="/admin" onClick={() => setOpen(false)}>
                进入系统设置 / 审计
              </Link>
            </Button>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

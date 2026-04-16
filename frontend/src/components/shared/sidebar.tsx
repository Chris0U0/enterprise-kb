"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, 
  FolderKanban,
  BookOpen, 
  Library, 
  Network, 
  FileText, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  LogOut,
  User,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { href: '/', label: '全局工作台', icon: Home },
  { href: '/projects', label: '项目管理', icon: FolderKanban },
  { href: '/copilot', label: 'AI 研读室', icon: BookOpen },
  { href: '/knowledge', label: '知识库管理', icon: Library },
  { href: '/graph', label: '图谱探索', icon: Network },
  { href: '/report', label: '报告中心', icon: FileText },
  { href: '/admin', label: '系统设置', icon: Settings },
];

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div 
      className={cn(
        "h-screen bg-background border-r border-border flex flex-col transition-all duration-300 relative",
        isCollapsed ? "w-[64px]" : "w-[240px]"
      )}
    >
      {/* 顶部 Logo */}
      <div className="h-16 flex items-center px-4 border-b border-border">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-sm bg-primary flex items-center justify-center shrink-0">
            <span className="text-primary-foreground font-bold italic font-serif">K</span>
          </div>
          {!isCollapsed && (
            <span className="font-serif italic font-bold tracking-tight text-lg whitespace-nowrap">Enterprise KB</span>
          )}
        </div>
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-sm transition-all group",
                isActive 
                  ? "bg-primary text-primary-foreground font-medium" 
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon size={20} className={cn("shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
              {!isCollapsed && (
                <span className="text-sm font-sans truncate">{item.label}</span>
              )}
              {isActive && !isCollapsed && (
                <div className="ml-auto w-1 h-4 bg-white/20 rounded-full" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* 底部用户信息 */}
      <div className="p-4 border-t border-border mt-auto">
        <div className={cn(
          "flex items-center gap-3 overflow-hidden",
          isCollapsed ? "justify-center" : ""
        )}>
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0 border border-border shadow-sm">
            <User size={16} className="text-muted-foreground" />
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold font-sans truncate">{user.name}</p>
              <Badge variant="outline" className="text-[9px] px-1 h-3.5 border-none bg-primary/5 text-primary">
                {user.role}
              </Badge>
            </div>
          )}
        </div>

        {!isCollapsed && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={logout}
            className="w-full mt-4 justify-start gap-3 h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
          >
            <LogOut size={16} />
            <span className="text-xs font-medium">退出登录</span>
          </Button>
        )}
      </div>

      {/* 折叠按钮 */}
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-8 w-6 h-6 rounded-full border border-border bg-white flex items-center justify-center shadow-sm hover:bg-secondary transition-colors z-20 group"
      >
        {isCollapsed ? <PanelLeftOpen size={12} className="text-muted-foreground group-hover:text-primary" /> : <PanelLeftClose size={12} className="text-muted-foreground group-hover:text-primary" />}
      </button>
    </div>
  );
}

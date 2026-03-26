"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Search, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { useNotifications } from "@/context/notification-context";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

// ─── Notification type badge ──────────────────────────────────────────────────

const TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  withdrawal:    { label: "Withdrawal",    cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  status_change: { label: "Status Change", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  mr_update:     { label: "MR Update",     cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  post_hrg:      { label: "Post HRG",      cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AppHeader({ title, subtitle, actions }: AppHeaderProps) {
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [panelOpen,   setPanelOpen]   = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { notifications, unreadCount, isLoading, markAllRead, refresh } =
    useNotifications();

  // Close panel on outside click
  useEffect(() => {
    if (!panelOpen) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [panelOpen]);

  function togglePanel() {
    setPanelOpen((v) => !v);
  }

  // Mark all read whenever the panel opens — must be in useEffect, not inside setPanelOpen
  useEffect(() => {
    if (panelOpen) markAllRead();
  }, [panelOpen, markAllRead]);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 backdrop-blur-md px-4">
      {/* Sidebar trigger + separator */}
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-2 data-[orientation=vertical]:h-4"
      />

      {/* Title */}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold">{title}</h1>
        {subtitle && (
          <p className="-mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        )}
      </div>

      {/* Right: search, notifications, actions, theme */}
      <div className="flex items-center gap-1.5">

        {/* Global search */}
        <div className={cn("flex items-center transition-all duration-200", searchOpen ? "w-64" : "w-auto")}>
          {searchOpen ? (
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search claimants, ALJs..."
                className="h-8 pl-8 text-sm"
                autoFocus
                onBlur={() => setSearchOpen(false)}
              />
            </div>
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSearchOpen(true)}>
              <Search className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Notification bell */}
        <div className="relative" ref={panelRef}>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-8 w-8"
            onClick={togglePanel}
          >
            <Bell className={cn("h-4 w-4", panelOpen && "text-primary")} />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
            {unreadCount === 0 && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-600" />
            )}
          </Button>

          {/* Dropdown panel */}
          {panelOpen && (
            <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-border bg-card shadow-xl">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                <span className="text-[12px] font-semibold text-foreground">Notifications</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={refresh}
                    className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title="Refresh"
                  >
                    <RefreshCw size={11} className={cn(isLoading && "animate-spin")} />
                  </button>
                  <button
                    onClick={() => setPanelOpen(false)}
                    className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>

              {/* List — shows ~3 items then scrolls */}
              <div className="max-h-54 overflow-y-auto divide-y divide-border">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[11px] text-muted-foreground">
                    {isLoading ? "Loading…" : "No notifications"}
                  </div>
                ) : (
                  notifications.map((n) => {
                    const badge = TYPE_LABEL[n.notification_type] ?? {
                      label: n.notification_type,
                      cls: "bg-muted text-muted-foreground",
                    };
                    return (
                      <div key={n.id} className="px-3 py-2.5 hover:bg-muted/40 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 mt-0.5", badge.cls)}>
                            {badge.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-foreground leading-snug">{n.message}</p>
                        {n.created_by_name && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">by {n.created_by_name}</p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="px-3 py-2 border-t border-border bg-muted/20 text-center">
                  <span className="text-[10px] text-muted-foreground">
                    {notifications.length} notification{notifications.length !== 1 ? "s" : ""} · auto-refreshes every 30s
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Page-specific actions */}
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}

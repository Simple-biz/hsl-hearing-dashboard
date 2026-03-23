"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
  type Context,
} from "react";
import type { NotificationItem } from "@/lib/notifications";

// ─── Context shape ────────────────────────────────────────────────────────────

interface NotificationContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  markAllRead: () => void;
  refresh: () => Promise<void>;
}

const NotificationContext: Context<NotificationContextValue | null> =
  createContext<NotificationContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL = 30_000; // 30s

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [lastReadAt, setLastReadAt]       = useState<Date>(() => new Date());
  const [isLoading, setIsLoading]         = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items: NotificationItem[] = await res.json();
      if (mountedRef.current) setNotifications(items);
    } catch (err) {
      console.error("[NotificationContext] refresh failed:", err);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [refresh]);

  const markAllRead = useCallback(() => {
    setLastReadAt(new Date());
  }, []);

  const unreadCount = notifications.filter(
    (n) => new Date(n.created_at) > lastReadAt,
  ).length;

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, isLoading, markAllRead, refresh }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used inside <NotificationProvider>");
  }
  return ctx;
}

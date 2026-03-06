"use client";

import { useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
// import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
// import { Shield, UserPlus, Search } from "lucide-react";
import { UserPlus, Search } from "lucide-react";

interface UserRow {
  id: number;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  last_login: string | null;
  force_password_change: boolean;
}

interface ActivityLogRow {
  id: number;
  action: string;
  description: string | null;
  ip_address: string | null;
  created_at: string;
  user_name: string | null;
}

// Mock data - will be replaced with Neon queries
const MOCK_USERS: UserRow[] = [
  {
    id: 1,
    full_name: "Thomas Admin",
    email: "thomas@hogansmith.com",
    role: "admin",
    is_active: true,
    last_login: "2026-03-04T10:00:00Z",
    force_password_change: false,
  },
  {
    id: 2,
    full_name: "Sarah Johnson",
    email: "sarah@hogansmith.com",
    role: "hearings_agent",
    is_active: true,
    last_login: "2026-03-03T14:30:00Z",
    force_password_change: false,
  },
  {
    id: 3,
    full_name: "Michael Chen",
    email: "michael@hogansmith.com",
    role: "mr_admin",
    is_active: true,
    last_login: "2026-03-02T09:15:00Z",
    force_password_change: false,
  },
];

const MOCK_ACTIVITY: ActivityLogRow[] = [
  {
    id: 1,
    action: "hearing_updated",
    description: "Hearing #5432 updated",
    ip_address: "192.168.1.1",
    created_at: "2026-03-04T10:30:00Z",
    user_name: "Thomas Admin",
  },
  {
    id: 2,
    action: "hearing_imported",
    description: "66 hearings imported from sheet",
    ip_address: "192.168.1.1",
    created_at: "2026-03-04T09:00:00Z",
    user_name: "Thomas Admin",
  },
  {
    id: 3,
    action: "user_login",
    description: "User logged in",
    ip_address: "10.0.0.5",
    created_at: "2026-03-03T14:30:00Z",
    user_name: "Sarah Johnson",
  },
];

const ACTION_COLORS: Record<string, string> = {
  hearing_updated:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  hearing_imported:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  hearing_deleted:
    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  user_login: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export default function AdminPage() {
  const [tab, setTab] = useState<"users" | "activity">("users");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredUsers = MOCK_USERS.filter(
    (u) =>
      !searchQuery ||
      u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <>
      <AppHeader
        title="Administration"
        subtitle="User management & audit log"
        actions={
          <Button size="sm" className="h-8 gap-1.5 text-xs">
            <UserPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add User</span>
          </Button>
        }
      />

      <div className="flex flex-col gap-4 p-4 lg:p-6">
        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
          <button
            onClick={() => setTab("users")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === "users" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Users
          </button>
          <button
            onClick={() => setTab("activity")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === "activity" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Activity Log
          </button>
        </div>

        {tab === "users" && (
          <div className="space-y-3">
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-9 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-foreground/80">
                      Name
                    </th>
                    <th className="h-9 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-foreground/80">
                      Email
                    </th>
                    <th className="h-9 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-foreground/80">
                      Role
                    </th>
                    <th className="h-9 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-foreground/80">
                      Status
                    </th>
                    <th className="h-9 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-foreground/80">
                      Last Login
                    </th>
                    <th className="h-9 px-3 text-[11px] font-bold uppercase tracking-wide text-foreground/80"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="px-3 py-2 text-xs font-medium">
                        {user.full_name}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {user.email}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {user.role}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={user.is_active ? "default" : "outline"}
                          className="text-[10px]"
                        >
                          {user.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                        {user.last_login
                          ? new Date(user.last_login).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )
                          : "Never"}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "activity" && (
          <div className="space-y-2">
            {MOCK_ACTIVITY.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 rounded-lg border p-3"
              >
                <Badge
                  className={`shrink-0 text-[10px] ${ACTION_COLORS[log.action] || "bg-muted text-muted-foreground"}`}
                >
                  {log.action}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-xs">{log.description}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {log.user_name} · {log.ip_address} ·{" "}
                    {new Date(log.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

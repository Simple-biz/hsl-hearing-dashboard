"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatCardGrid } from "@/components/stat-card";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  UserPlus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Copy,
  Eye,
  EyeOff,
  Dice5,
  Users,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  saveUser,
  toggleUserActive,
  deleteUser,
  resetUserPasswordCustom,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendVideoTutorialEmail,
} from "./actions";
import { fetchActivityLog } from "@/app/(dashboard)/actions";
import type { ActivityLogEntry } from "@/app/(dashboard)/actions";
import type { AdminUser } from "./actions";
import type { UserRole } from "@/lib/roles";
import { UserAccessModal } from "@/components/modals/user-access-modal";
import { BulkCreateModal } from "@/components/modals/bulk-create-modal";

const ALL_ROLES = [
  { value: "admin", label: "Administrator", group: "Administration" },
  { value: "manager", label: "Manager", group: "Administration" },
  { value: "hearings_admin", label: "Hearings Admin", group: "Hearings" },
  { value: "hearings_agent", label: "Hearings Agent", group: "Hearings" },
  {
    value: "hearings_status_moa",
    label: "Hearings Status/MOA",
    group: "Hearings",
  },
  {
    value: "hearings_docs_fee",
    label: "Hearings Docs & Fee",
    group: "Hearings",
  },
  { value: "hearings_docs", label: "Hearings Docs", group: "Hearings" },
  { value: "hearings_mc", label: "Hearings MC", group: "Hearings" },
  { value: "hearings_brief", label: "Hearings Brief", group: "Hearings" },
  { value: "mr_admin", label: "MR Admin", group: "Medical Records" },
  { value: "mr_lead", label: "MR Lead", group: "Medical Records" },
  { value: "mr_agent", label: "MR Agent", group: "Medical Records" },
  { value: "pre_hearing_staff", label: "Pre-Hearing Staff", group: "Staff" },
  { value: "brief_agent", label: "Brief Agent", group: "Staff" },
  { value: "post_hearing_admin", label: "Post Hearing Admin", group: "Staff" },
  { value: "post_hearing_staff", label: "Post Hearing Staff", group: "Staff" },
  { value: "staff", label: "Staff", group: "Staff" },
  { value: "chronicle_editor", label: "Chronicle Editor", group: "Staff" },
  { value: "link_editor", label: "Link Editor", group: "Staff" },
  { value: "rep", label: "Representative", group: "Representatives" },
];

function generatePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%";
  return Array.from(
    { length: 12 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    Administration:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
    Hearings:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    "Medical Records":
      "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
    Staff: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    Representatives:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  };
  const found = ALL_ROLES.find((r) => r.value === role);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
        colors[found?.group || ""] || colors.Staff,
      )}
    >
      {found?.label || role.replace(/_/g, " ")}
    </span>
  );
}

export function AdminClient({
  users: initUsers,
  userRole,
}: {
  users: AdminUser[];
  userRole: string;
}) {
  const [tab, setTab] = useState<"users" | "activity">("users");
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [users, setUsers] = useState(initUsers);
  const [, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  return (
    <>
      <AppHeader
        title="Administration"
        subtitle="User management & audit log"
      />
      <div className="flex flex-col gap-4 p-4 lg:p-6">
        <DashboardNav userRole={userRole as UserRole} />
        <div className="flex items-center gap-4 border-b">
          <button
            onClick={() => setTab("users")}
            className={cn(
              "flex items-center gap-1.5 pb-2 text-sm font-medium border-b-2 transition-colors",
              tab === "users"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Users className="h-4 w-4" /> Users
          </button>
          <button
            onClick={() => setTab("activity")}
            className={cn(
              "flex items-center gap-1.5 pb-2 text-sm font-medium border-b-2 transition-colors",
              tab === "activity"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Activity className="h-4 w-4" /> Activity Log
          </button>
        </div>
        {tab === "users" && (
          <UsersTab
            users={users}
            setUsers={setUsers}
            startTransition={startTransition}
            showToast={showToast}
            onBulkCreate={() => setShowBulkCreate(true)}
          />
        )}
        {tab === "activity" && <ActivityTab />}
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-200 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 shadow-lg dark:border-emerald-800 dark:bg-emerald-950/80 animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
            {toast}
          </span>
        </div>
      )}
      {showBulkCreate && (
        <BulkCreateModal
          onClose={() => setShowBulkCreate(false)}
          onCreated={(newUsers) => setUsers((prev) => [...newUsers, ...prev])}
          existingEmails={new Set(users.map((u) => u.email.toLowerCase()))}
        />
      )}
    </>
  );
}

// ═══════════ USERS TAB ═══════════
function UsersTab({
  users,
  setUsers,
  startTransition,
  showToast,
  onBulkCreate,
}: {
  users: AdminUser[];
  setUsers: (u: AdminUser[]) => void;
  startTransition: (fn: () => void) => void;
  showToast: (msg: string) => void;
  onBulkCreate: () => void;
}) {
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState<AdminUser | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [accessUser, setAccessUser] = useState<AdminUser | null>(null);

  const visible = users.filter((u) => u.role !== "system_admin");
  const active = visible.filter((u) => u.is_active);
  const inactive = visible.filter((u) => !u.is_active);
  const filtered = [...active, ...inactive].filter(
    (u) =>
      !search ||
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <StatCardGrid className="grid-cols-3">
        <StatCard
          label="Total Users"
          value={visible.length}
          gradient="from-indigo-500 to-purple-600"
        />
        <StatCard
          label="Active"
          value={active.length}
          gradient="from-emerald-500 to-green-400"
        />
        <StatCard
          label="Inactive"
          value={inactive.length}
          gradient="from-zinc-400 to-zinc-500"
        />
      </StatCardGrid>

      <div className="flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9 text-sm"
          />
        </div>
        <Button
          size="sm"
          className="h-9 gap-2"
          onClick={() => setShowAddModal(true)}
        >
          <UserPlus className="h-4 w-4" /> Add User
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-2"
          onClick={onBulkCreate}
        >
          👥 Bulk Create
        </Button>
      </div>

      {editing && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm">
              Editing: {editing.full_name}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <form
              action={async (form: FormData) => {
                const data = {
                  id: editing.id,
                  full_name: form.get("full_name") as string,
                  email: form.get("email") as string,
                  role: form.get("role") as string,
                };
                startTransition(async () => {
                  await saveUser(data);
                  setUsers(
                    users.map((u) =>
                      u.id === data.id ? { ...u, ...data } : u,
                    ),
                  );
                  setEditing(null);
                  showToast(`✓ ${data.full_name} updated`);
                });
              }}
              className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
            >
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Full Name
                </label>
                <Input
                  name="full_name"
                  defaultValue={editing.full_name}
                  required
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Email
                </label>
                <Input
                  name="email"
                  type="email"
                  defaultValue={editing.email}
                  required
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Role
                </label>
                <select
                  name="role"
                  defaultValue={editing.role}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button size="sm" type="submit" className="h-9">
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  className="h-9"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <div className="overflow-hidden rounded-lg">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="h-10 px-4 text-left text-xs font-semibold text-muted-foreground">
                  User
                </th>
                <th className="h-10 px-4 text-left text-xs font-semibold text-muted-foreground">
                  Role
                </th>
                <th className="h-10 px-4 text-left text-xs font-semibold text-muted-foreground">
                  Status
                </th>
                <th className="h-10 px-4 text-left text-xs font-semibold text-muted-foreground">
                  Last Login
                </th>
                <th className="h-10 px-4 text-right text-xs font-semibold text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((user) => (
                <tr
                  key={user.id}
                  className={cn(
                    "hover:bg-muted/40 transition-colors",
                    !user.is_active && "opacity-50",
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary shrink-0">
                        {user.full_name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium leading-tight">
                          {user.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                        user.is_active
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-300"
                          : "bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          user.is_active ? "bg-emerald-500" : "bg-zinc-400",
                        )}
                      />
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                    {user.last_login ? (
                      new Date(user.last_login).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    ) : (
                      <span className="italic">Never</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => setEditing(user)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2.5 text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950/30"
                        onClick={() => setAccessUser(user)}
                        title="Per-user field access overrides"
                      >
                        Access
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2.5 text-orange-600 border-orange-200 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:hover:bg-orange-950/30"
                        onClick={() => setShowResetModal(user)}
                      >
                        PW
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-7 text-xs px-2.5",
                          user.is_active
                            ? "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            : "text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950/30",
                        )}
                        onClick={() => {
                          startTransition(async () => {
                            await toggleUserActive(user.id, !user.is_active);
                            setUsers(
                              users.map((u) =>
                                u.id === user.id
                                  ? { ...u, is_active: !user.is_active }
                                  : u,
                              ),
                            );
                            showToast(
                              `✓ ${user.full_name} ${!user.is_active ? "activated" : "deactivated"}`,
                            );
                          });
                        }}
                      >
                        {user.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => {
                          if (
                            confirm(
                              `Delete ${user.full_name}? This cannot be undone.`,
                            )
                          )
                            startTransition(async () => {
                              await deleteUser(user.id);
                              setUsers(users.filter((u) => u.id !== user.id));
                              showToast(`✓ ${user.full_name} deleted`);
                            });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onSaved={(u) => {
            setUsers([...users, u]);
            setShowAddModal(false);
            showToast(
              `✓ ${u.full_name} created as ${u.role === "rep" ? "Representative" : u.role}`,
            );
          }}
          startTransition={startTransition}
        />
      )}
      {showResetModal && (
        <ResetPasswordModal
          user={showResetModal}
          onClose={() => setShowResetModal(null)}
          startTransition={startTransition}
        />
      )}
      <UserAccessModal
        open={!!accessUser}
        user={
          accessUser
            ? {
                id: accessUser.id,
                full_name: accessUser.full_name,
                role: accessUser.role as UserRole,
              }
            : null
        }
        onClose={() => setAccessUser(null)}
      />
    </div>
  );
}

// ═══════════ MODAL ═══════════
function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-xl border bg-card shadow-2xl animate-in fade-in-0 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <Separator />
        {children}
      </div>
    </div>
  );
}

// ═══════════ PASSWORD FIELD ═══════════
function PasswordField({
  value,
  onChange,
  label = "Password *",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const [show, setShow] = useState(true);
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium">{label}</label>
      <div className="flex gap-1.5">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 text-sm font-mono flex-1 tracking-wide"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          title="Generate"
          onClick={() => onChange(generatePassword())}
        >
          <Dice5 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          title={show ? "Hide" : "Show"}
          onClick={() => setShow(!show)}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn("h-9 w-9 shrink-0", copied && "text-emerald-600")}
          title="Copy"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ═══════════ ADD USER MODAL ═══════════
function AddUserModal({
  onClose,
  onSaved,
  startTransition,
}: {
  onClose: () => void;
  onSaved: (u: AdminUser) => void;
  startTransition: (fn: () => void) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(generatePassword());
  const [role, setRole] = useState("staff");
  const [forceChange, setForceChange] = useState(true);
  const [sendWelcome, setSendWelcome] = useState(true);
  const [sendVideo, setSendVideo] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Rep profile step
  const [showRepStep, setShowRepStep] = useState(false);
  const [createRepProfile, setCreateRepProfile] = useState(true);
  const [repType, setRepType] = useState("in-house");

  // Any role in the "Representatives" group triggers the rep profile step
  const REP_GROUP_ROLES = ALL_ROLES.filter(
    (r) => r.group === "Representatives",
  ).map((r) => r.value);
  const isRepRole = REP_GROUP_ROLES.includes(role);

  const handleSubmit = () => {
    if (!name.trim() || !email.trim() || !password) {
      setError("All fields are required");
      return;
    }

    // If rep role and haven't shown the rep step yet, show it
    if (isRepRole && !showRepStep) {
      setShowRepStep(true);
      return;
    }

    setSaving(true);
    startTransition(async () => {
      try {
        const id = await saveUser({
          full_name: name.trim(),
          email: email.trim(),
          role,
          password,
          rep_type: isRepRole && createRepProfile ? repType : undefined,
          force_password_change: forceChange,
        });
        if (sendVideo) {
          try {
            await sendVideoTutorialEmail(id, password);
          } catch {}
        } else if (sendWelcome) {
          try {
            await sendWelcomeEmail(id, password);
          } catch {}
        }
        onSaved({
          id,
          full_name: name.trim(),
          email: email.trim(),
          role,
          is_active: true,
          last_login: null,
          force_password_change: forceChange,
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to create user");
        setSaving(false);
      }
    });
  };

  return (
    <Modal
      title={showRepStep ? "Create Rep Profile" : "Add User"}
      onClose={onClose}
    >
      <div className="px-5 py-4 space-y-4">
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        {!showRepStep ? (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Full Name *
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Smith"
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Email *
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                placeholder="john@hogansmith.com"
                className="h-9 text-sm"
              />
            </div>
            <PasswordField value={password} onChange={setPassword} />
            <div>
              <label className="mb-1.5 block text-xs font-medium">Role *</label>
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setShowRepStep(false);
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2.5 pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={forceChange}
                  onChange={(e) => setForceChange(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <span className="text-sm">
                  Require password change on first login
                </span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={sendWelcome && !sendVideo}
                  onChange={(e) => {
                    setSendWelcome(e.target.checked);
                    if (e.target.checked) setSendVideo(false);
                  }}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <span className="text-sm">
                  Send welcome email with credentials
                </span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={sendVideo}
                  onChange={(e) => {
                    setSendVideo(e.target.checked);
                    if (e.target.checked) setSendWelcome(false);
                  }}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <div>
                  <span className="text-sm">
                    Send scheduling video tutorial
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Includes login credentials + scheduling system video
                    tutorial
                  </p>
                </div>
              </label>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-3">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                This user has a representative role
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                A representative profile allows them to be assigned to hearings
                and manage their schedule.
              </p>
            </div>

            <div className="rounded-lg border bg-card p-4 space-y-3">
              <p className="text-sm font-semibold">{name}</p>
              <p className="text-xs text-muted-foreground">{email}</p>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={createRepProfile}
                onChange={(e) => setCreateRepProfile(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="text-sm font-medium">
                Create representative profile
              </span>
            </label>

            {createRepProfile && (
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  Representative Type *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      {
                        key: "in-house",
                        label: "In-House",
                        desc: "Employed directly by the firm",
                      },
                      {
                        key: "internal_advocates",
                        label: "Internal Advocates",
                        desc: "Internal advocate representative",
                      },
                      {
                        key: "external_advocates",
                        label: "External Advocates",
                        desc: "External contracted representative",
                      },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setRepType(t.key)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-all",
                        repType === t.key
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:bg-muted/40",
                      )}
                    >
                      <p className="text-sm font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <Separator />
      <div className="flex justify-between px-5 py-3">
        <div>
          {showRepStep && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRepStep(false)}
            >
              ← Back
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={saving} onClick={handleSubmit}>
            {saving
              ? "Creating..."
              : showRepStep
                ? "Create User & Rep Profile"
                : isRepRole
                  ? "Next →"
                  : "Create User"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════ RESET PASSWORD MODAL ═══════════
function ResetPasswordModal({
  user,
  onClose,
  startTransition,
}: {
  user: AdminUser;
  onClose: () => void;
  startTransition: (fn: () => void) => void;
}) {
  const [password, setPassword] = useState(generatePassword());
  const [forceChange, setForceChange] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState("");

  const handleSubmit = () => {
    if (!password || password.length < 8) return;
    setSaving(true);
    startTransition(async () => {
      try {
        await resetUserPasswordCustom(user.id, password, forceChange);
        let msg = "Password reset successfully";
        if (forceChange) msg += " · User must change on next login";
        if (sendEmail) {
          try {
            await sendPasswordResetEmail(user.id, password);
            msg += " · Email sent";
          } catch {
            msg += " · Email failed";
          }
        }
        setResult(msg);
        setSaving(false);
      } catch {
        setResult("Failed to reset password");
        setSaving(false);
      }
    });
  };

  return (
    <Modal title="Reset Password" onClose={onClose}>
      <div className="px-5 py-4 space-y-4">
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {user.full_name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium">{user.full_name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        {result && (
          <div
            className={cn(
              "rounded-lg border px-3 py-2.5 text-xs",
              result.includes("failed") || result.includes("Failed")
                ? "bg-destructive/10 border-destructive/20 text-destructive"
                : "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300",
            )}
          >
            {result}
          </div>
        )}
        <PasswordField
          value={password}
          onChange={setPassword}
          label="New Password *"
        />
        <div className="space-y-2.5 pt-1">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={forceChange}
              onChange={(e) => setForceChange(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <span className="text-sm">
              Require password change on next login
            </span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <span className="text-sm">Send new password to user via email</span>
          </label>
        </div>
      </div>
      <Separator />
      <div className="flex justify-end gap-2 px-5 py-3">
        <Button variant="outline" size="sm" onClick={onClose}>
          {result ? "Close" : "Cancel"}
        </Button>
        {!result && (
          <Button
            size="sm"
            variant="destructive"
            disabled={saving}
            onClick={handleSubmit}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {saving ? "Resetting..." : "Reset Password"}
          </Button>
        )}
      </div>
    </Modal>
  );
}

// ═══════════ ACTIVITY LOG TAB ═══════════
const LOG_CATEGORIES = [
  { key: "logins", label: "User Logins", icon: "🔑" },
  { key: "assignments", label: "Assignments", icon: "👤" },
  { key: "emails", label: "Emails", icon: "📧" },
  { key: "fields", label: "Fields", icon: "✏️" },
  { key: "hearings", label: "Hearings", icon: "📅" },
  { key: "schedule", label: "Schedule", icon: "🗓️" },
  { key: "reps", label: "Reps", icon: "👥" },
  { key: "users", label: "Users", icon: "👤" },
  { key: "archived", label: "Archived", icon: "📦" },
  { key: "all", label: "All", icon: "📋" },
];

const ACTION_COLORS: Record<string, string> = {
  // Auth
  user_login:
    "bg-green-100 text-green-800 dark:bg-green-800/40 dark:text-green-300",
  user_logout:
    "bg-zinc-100 text-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300",
  // Assignments
  rep_assigned:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-300",
  rep_unassigned:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  rep_auto_assigned:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  batch_auto_assign:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  bulk_unassign:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  status_assigned:
    "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  // Emails
  email_sent:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  email_failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  bulk_email:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  // Field updates
  field_updated:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  post_hrg_note_added:
    "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  post_hrg_deadline_updated:
    "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  post_hrg_note_deleted:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  // Post HRG Development lifecycle
  post_hrg_dev_created:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-300",
  post_hrg_dev_auto_created:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-300",
  post_hrg_dev_acknowledged:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  post_hrg_dev_deleted:
    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  post_hrg_dev_import:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  post_hrg_dev_phstatus_synced:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  // Hearings
  hearing_updated:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  hearing_created:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-300",
  hearing_deleted:
    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  hearing_imported:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  bulk_delete: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  bulk_migrate:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  // Schedule
  schedule_updated:
    "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  schedule_lock_override:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  // Reps
  rep_created:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-300",
  rep_updated:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  rep_deleted: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  token_revoked:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  // Archived
  archive_chronicles:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  unarchive_chronicles:
    "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  // Admin
  user_created:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-300",
  user_updated:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  user_deleted: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  config_updated:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  password_reset:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
};

function ActivityTab() {
  const [category, setCategory] = useState("logins");
  const [dateRange, setDateRange] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<ActivityLogEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);
  const [fetchId, setFetchId] = useState(1);
  const [lastFetchId, setLastFetchId] = useState(0);
  const pageSize = 30;
  const loading = fetchId !== lastFetchId;

  useEffect(() => {
    let cancelled = false;
    const cid = fetchId;
    fetchActivityLog({
      page,
      pageSize,
      category,
      dateRange: dateRange || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      userId: userId || undefined,
      excludeSystemAdmin: true,
    }).then((res) => {
      if (!cancelled) {
        setEntries(res.entries);
        setTotal(res.total);
        setUsers(res.users);
        setLastFetchId(cid);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = () => {
    setPage(1);
    setFetchId((n) => n + 1);
  };
  const changePage = (p: number) => {
    setPage(p);
    setFetchId((n) => n + 1);
  };
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {LOG_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => {
              setCategory(cat.key);
              reload();
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
              category === cat.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span>{cat.icon}</span> {cat.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={dateRange}
          onChange={(e) => {
            setDateRange(e.target.value);
            reload();
          }}
        >
          <option value="">All Time</option>
          <option value="today">Today</option>
          <option value="this_week">This Week</option>
          <option value="this_month">This Month</option>
          <option value="custom">Custom Range</option>
        </select>
        {dateRange === "custom" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                reload();
              }}
              className="h-9 w-35 text-sm"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                reload();
              }}
              className="h-9 w-35 text-sm"
            />
          </div>
        )}
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value);
            reload();
          }}
        >
          <option value="">All Users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {total.toLocaleString()} entries
        </span>
      </div>
      <Card>
        {loading && entries === null ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : entries !== null && entries.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No activity entries found.
          </div>
        ) : entries !== null ? (
          <div
            className={cn(
              "divide-y",
              loading && "opacity-50 pointer-events-none",
            )}
          >
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
              >
                <span
                  className={cn(
                    "shrink-0 mt-0.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                    ACTION_COLORS[entry.action] ||
                      "bg-muted text-muted-foreground",
                  )}
                >
                  {entry.action.replace(/_/g, " ")}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{entry.description}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {entry.user_name && (
                      <>
                        {" "}
                        · <span className="font-medium">{entry.user_name}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {total.toLocaleString()} entries
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 1 || loading}
            onClick={() => changePage(1)}
            title="First page"
          >
            <ChevronLeft className="h-4 w-4" />
            <ChevronLeft className="h-4 w-4 -ml-2.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 1 || loading}
            onClick={() => changePage(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            value={String(page)}
            onChange={(e) => changePage(Number(e.target.value))}
            disabled={loading}
          >
            {Array.from({ length: totalPages }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                Page {i + 1}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= totalPages || loading}
            onClick={() => changePage(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= totalPages || loading}
            onClick={() => changePage(totalPages)}
            title="Last page"
          >
            <ChevronRight className="h-4 w-4" />
            <ChevronRight className="h-4 w-4 -ml-2.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

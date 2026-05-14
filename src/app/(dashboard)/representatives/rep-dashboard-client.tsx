"use client";

import { useState, useMemo } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatCard, StatCardGrid } from "@/components/stat-card";
import type { UserRole } from "@/lib/roles";
import {
  saveRep,
  toggleRepActive,
  deleteRep,
  updateHearingRestriction,
} from "./action";
import type { RepDetail } from "./action";
import {
  TokenModal,
  RevokeAllModal,
  BulkLinksModal,
} from "@/components/modals";

const TYPE_SHORT: Record<string, string> = {
  internal_advocates: "Internal",
  external_advocates: "External",
  "in-house": "In-House",
  contract: "Contract",
};
// const TYPE_LABELS: Record<string, string> = {
//   internal_advocates: "Internal Advocates",
//   external_advocates: "External Advocates",
//   "in-house": "In-House",
//   contract: "Contract",
// };
const TYPE_COLORS: Record<string, string> = {
  internal_advocates:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "in-house":
    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  external_advocates:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  contract: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};
const RESTRICTION_OPTIONS = [
  {
    value: "none",
    label: "No Restriction",
    desc: "Standard limits",
    badge: "Default",
    badgeCls: "bg-zinc-100 text-zinc-600",
  },
  {
    value: "2_per_day_2_days",
    label: "2/day, 2 days/wk",
    desc: "Max 2 hearings on 2 days",
    badge: "2×2",
    badgeCls: "bg-amber-100 text-amber-700",
  },
  {
    value: "3_per_day_3_days",
    label: "3/day, 3 days/wk",
    desc: "Max 3 hearings on 3 days",
    badge: "3×3",
    badgeCls: "bg-purple-100 text-purple-700",
  },
];
const RESTRICTION_LABELS: Record<string, string> = {
  none: "None",
  "2_per_day_2_days": "2/day, 2x/wk",
  "3_per_day_3_days": "3/day, 3x/wk",
};

export function RepDashboardClient({
  reps: initialReps,
  userRole,
}: {
  reps: RepDetail[];
  userRole: UserRole;
}) {
  const [reps, setReps] = useState(initialReps);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState("active");
  const [editRep, setEditRep] = useState<RepDetail | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewAll, setShowViewAll] = useState(false);
  const [showRevokeAll, setShowRevokeAll] = useState(false);
  const [showBulkLinks, setShowBulkLinks] = useState(false);
  const [tokenRep, setTokenRep] = useState<RepDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    rep_type: "internal_advocates",
    priority: 5,
    daily_limit: 3,
    weekly_limit: 12,
    hearing_restriction: "none",
    /** Comma-separated text the admin types; converted to a string[] in
     * the submit handler. Stored as TEXT[] in `representatives.name_aliases`
     * and consulted by import-compare's rep lookup. */
    name_aliases_text: "",
  });
  const setField = (key: string, value: string | number) =>
    setForm((p) => ({ ...p, [key]: value }));

  // View All state
  const [vaSearch, setVaSearch] = useState("");
  const [vaType, setVaType] = useState("__all__");
  const [vaStatus, setVaStatus] = useState("__all__");
  const [vaSort, setVaSort] = useState("name-asc");

  const filtered = useMemo(
    () =>
      reps.filter((r) => {
        if (
          search &&
          !r.name?.toLowerCase().includes(search.toLowerCase()) &&
          !r.email?.toLowerCase().includes(search.toLowerCase())
        )
          return false;
        if (filterType !== "__all__" && r.rep_type !== filterType) return false;
        if (filterStatus === "active" && !r.is_active) return false;
        if (filterStatus === "inactive" && r.is_active) return false;
        return true;
      }),
    [reps, search, filterType, filterStatus],
  );

  const vaFiltered = useMemo(() => {
    const result = reps.filter((r) => {
      if (
        vaSearch &&
        !r.name?.toLowerCase().includes(vaSearch.toLowerCase()) &&
        !r.email?.toLowerCase().includes(vaSearch.toLowerCase())
      )
        return false;
      if (vaType !== "__all__" && r.rep_type !== vaType) return false;
      if (vaStatus === "active" && !r.is_active) return false;
      if (vaStatus === "inactive" && r.is_active) return false;
      return true;
    });
    switch (vaSort) {
      case "name-asc":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "type":
        result.sort((a, b) => a.rep_type.localeCompare(b.rep_type));
        break;
      case "priority-desc":
        result.sort((a, b) => b.priority - a.priority);
        break;
      case "priority-asc":
        result.sort((a, b) => a.priority - b.priority);
        break;
      case "upcoming-desc":
        result.sort((a, b) => b.upcoming_count - a.upcoming_count);
        break;
    }
    return result;
  }, [reps, vaSearch, vaType, vaStatus, vaSort]);

  const total = reps.length,
    internal = reps.filter((r) => r.rep_type === "internal_advocates").length;
  const external = reps.filter(
    (r) => r.rep_type === "external_advocates",
  ).length;
  const inHouse = reps.filter((r) => r.rep_type === "in-house").length;
  const active = reps.filter((r) => r.is_active).length;

  const openAdd = () => {
    setForm({
      name: "",
      email: "",
      rep_type: "internal_advocates",
      priority: 5,
      daily_limit: 3,
      weekly_limit: 12,
      hearing_restriction: "none",
      name_aliases_text: "",
    });
    setEditRep(null);
    setShowAddModal(true);
  };
  const openEdit = (rep: RepDetail) => {
    setForm({
      name: rep.name,
      email: rep.email || "",
      rep_type: rep.rep_type,
      priority: rep.priority,
      daily_limit: rep.daily_limit,
      weekly_limit: rep.weekly_limit,
      hearing_restriction: rep.hearing_restriction || "none",
      name_aliases_text: (rep.name_aliases ?? []).join(", "),
    });
    setEditRep(rep);
    setShowAddModal(true);
  };
  const handleSubmit = async () => {
    setSaving(true);
    const aliases = form.name_aliases_text
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    await saveRep({ ...form, id: editRep?.id, name_aliases: aliases });
    window.location.reload();
  };
  const handleToggle = async (id: number, val: boolean) => {
    await toggleRepActive(id, val);
    setReps((p) => p.map((r) => (r.id === id ? { ...r, is_active: val } : r)));
  };
  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    await deleteRep(id);
    setReps((p) => p.filter((r) => r.id !== id));
  };
  const handleRestriction = async (id: number, v: string) => {
    await updateHearingRestriction(id, v);
    setReps((p) =>
      p.map((r) => (r.id === id ? { ...r, hearing_restriction: v } : r)),
    );
  };

  return (
    <>
      <AppHeader
        title="Representative Dashboard"
        subtitle="Manage representatives and assignment configurations"
      />
      <div className="p-4 lg:p-6 space-y-4">
        {/* Nav with action buttons */}
        <DashboardNav userRole={userRole}>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => setShowRevokeAll(true)}
          >
            🚫 Revoke All Links
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1.5 text-[11px] bg-purple-600 hover:bg-purple-700"
            onClick={() => setShowBulkLinks(true)}
          >
            🔗 Manage All Links
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1.5 text-[11px] bg-green-600 hover:bg-green-700"
            onClick={openAdd}
          >
            + Add Representative
          </Button>
        </DashboardNav>

        {/* Summary cards */}
        <StatCardGrid className="grid-cols-2 sm:grid-cols-5">
          {[
            {
              label: "Total Reps",
              value: total,
              gradient: "from-indigo-500 to-purple-600",
            },
            {
              label: "Internal",
              value: internal,
              gradient: "from-emerald-500 to-green-400",
            },
            {
              label: "External",
              value: external,
              gradient: "from-amber-500 to-amber-600",
            },
            {
              label: "In-House",
              value: inHouse,
              gradient: "from-blue-400 to-cyan-400",
            },
            {
              label: "Active",
              value: active,
              gradient: "from-green-500 to-emerald-400",
            },
          ].map((c) => (
            <StatCard
              key={c.label}
              label={c.label}
              value={c.value}
              gradient={c.gradient}
            />
          ))}
        </StatCardGrid>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-sm"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-9 w-auto min-w-35 text-sm">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Types</SelectItem>
              <SelectItem value="internal_advocates">Internal</SelectItem>
              <SelectItem value="external_advocates">External</SelectItem>
              <SelectItem value="in-house">In-House</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-auto min-w-27.5 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <span className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Showing {filtered.length} of {total}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs"
              onClick={() => setShowViewAll(true)}
            >
              📋 View All
            </Button>
          </span>
        </div>

        {/* Rep cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((rep) => (
            <div
              key={rep.id}
              className={cn(
                "rounded-xl border bg-card overflow-hidden transition-shadow hover:shadow-md",
                !rep.is_active && "opacity-60",
              )}
            >
              <div className="bg-muted/50 px-4 py-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold truncate">{rep.name}</h3>
                  <p className="text-xs text-muted-foreground truncate">
                    {rep.email}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[10px] font-semibold",
                      TYPE_COLORS[rep.rep_type],
                    )}
                  >
                    {TYPE_SHORT[rep.rep_type]}
                  </span>
                  {!rep.is_active && (
                    <span className="rounded-md bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                      Inactive
                    </span>
                  )}
                </div>
              </div>
              <div className="px-4 py-3 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <p className="text-lg font-bold tabular-nums">
                      {rep.this_week_count}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      This Week
                    </p>
                    <p className="text-[9px] text-muted-foreground/60">
                      of {rep.weekly_limit}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">
                      {rep.upcoming_count}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Upcoming
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold tabular-nums">
                      {rep.total_count}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/30 p-2">
                  <div className="text-center">
                    <p className="text-xs font-semibold tabular-nums">
                      {rep.daily_limit}/day
                    </p>
                    <p className="text-[9px] text-muted-foreground">Daily</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-semibold tabular-nums">
                      {rep.weekly_limit}/wk
                    </p>
                    <p className="text-[9px] text-muted-foreground">Weekly</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-semibold tabular-nums">
                      {rep.priority}/10
                    </p>
                    <p className="text-[9px] text-muted-foreground">Priority</p>
                    <div className="mt-1 h-1 w-full rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${rep.priority * 10}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Hearing Restriction
                  </p>
                  <div className="space-y-1">
                    {RESTRICTION_OPTIONS.map((opt) => {
                      const c =
                        (rep.hearing_restriction || "none") === opt.value;
                      return (
                        <label
                          key={opt.value}
                          className={cn(
                            "flex items-center gap-2 rounded-md border px-2.5 py-1.5 cursor-pointer transition-all text-xs",
                            c
                              ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30"
                              : "border-border hover:bg-muted/50",
                          )}
                        >
                          <input
                            type="radio"
                            name={`r-${rep.id}`}
                            checked={c}
                            onChange={() =>
                              handleRestriction(rep.id, opt.value)
                            }
                            className="h-3.5 w-3.5 accent-blue-600"
                          />
                          <span className="flex-1 font-medium">
                            {opt.label}
                          </span>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[9px] font-bold",
                              opt.badgeCls,
                            )}
                          >
                            {opt.badge}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 border-t bg-muted/30 px-4 py-2">
                <button
                  onClick={() => openEdit(rep)}
                  className="rounded px-2 py-1 text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700"
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => handleToggle(rep.id, !rep.is_active)}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-semibold",
                    rep.is_active
                      ? "bg-amber-500 text-white"
                      : "bg-green-600 text-white",
                  )}
                >
                  {rep.is_active ? "⏸️ Deactivate" : "▶️ Activate"}
                </button>
                <button
                  onClick={() => handleDelete(rep.id, rep.name)}
                  className="rounded px-2 py-1 text-[11px] font-semibold bg-red-600 text-white hover:bg-red-700"
                >
                  🗑️ Delete
                </button>
                <button
                  onClick={() => setTokenRep(rep)}
                  className="rounded px-2 py-1 text-[11px] font-semibold bg-purple-600 text-white hover:bg-purple-700 ml-auto"
                >
                  🔗 Link
                </button>
              </div>
            </div>
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-lg font-semibold text-muted-foreground">
              No Representatives Found
            </p>
          </div>
        )}
      </div>

      {/* ═══════ VIEW ALL MODAL ═══════ */}
      {showViewAll && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowViewAll(false)}
        >
          <div
            className="w-full max-w-6xl h-[85vh] flex flex-col rounded-xl border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b bg-muted/50 px-6 py-4 shrink-0">
              <h2 className="text-lg font-semibold">📋 All Representatives</h2>
              <button
                onClick={() => setShowViewAll(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3 shrink-0">
              <Input
                placeholder="🔍 Search..."
                value={vaSearch}
                onChange={(e) => setVaSearch(e.target.value)}
                className="h-9 w-auto min-w-50 text-sm"
              />
              <Select value={vaType} onValueChange={setVaType}>
                <SelectTrigger className="h-9 w-auto min-w-32.5 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Types</SelectItem>
                  <SelectItem value="internal_advocates">Internal</SelectItem>
                  <SelectItem value="external_advocates">External</SelectItem>
                  <SelectItem value="in-house">In-House</SelectItem>
                </SelectContent>
              </Select>
              <Select value={vaStatus} onValueChange={setVaStatus}>
                <SelectTrigger className="h-9 w-auto min-w-27.5 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Select value={vaSort} onValueChange={setVaSort}>
                <SelectTrigger className="h-9 w-auto min-w-40 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-asc">Name A-Z</SelectItem>
                  <SelectItem value="name-desc">Name Z-A</SelectItem>
                  <SelectItem value="type">By Type</SelectItem>
                  <SelectItem value="priority-desc">
                    Priority High-Low
                  </SelectItem>
                  <SelectItem value="priority-asc">
                    Priority Low-High
                  </SelectItem>
                  <SelectItem value="upcoming-desc">Most Upcoming</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-card dark:bg-zinc-950 border-b">
                    {[
                      "Name",
                      "Type",
                      "Status",
                      "Priority",
                      "Daily",
                      "Weekly",
                      "This Week",
                      "Upcoming",
                      "Total",
                      "Restriction",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground bg-card dark:bg-zinc-950 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vaFiltered.map((rep) => (
                    <tr
                      key={rep.id}
                      className="border-b border-border/50 hover:bg-muted/30"
                    >
                      <td className="px-3 py-2.5">
                        <p className="text-sm font-semibold">{rep.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {rep.email}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[10px] font-semibold",
                            TYPE_COLORS[rep.rep_type],
                          )}
                        >
                          {TYPE_SHORT[rep.rep_type]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {rep.is_active ? (
                          <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            Active
                          </span>
                        ) : (
                          <span className="rounded-md bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {rep.priority}/10
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {rep.daily_limit}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {rep.weekly_limit}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {rep.this_week_count}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold text-blue-600">
                        {rep.upcoming_count}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {rep.total_count}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {RESTRICTION_LABELS[
                          rep.hearing_restriction || "none"
                        ] || "None"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setShowViewAll(false);
                              setTimeout(() => openEdit(rep), 100);
                            }}
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-blue-600 text-white hover:bg-blue-700"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => {
                              handleToggle(rep.id, !rep.is_active);
                              setShowViewAll(false);
                            }}
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                              rep.is_active
                                ? "bg-amber-500 text-white"
                                : "bg-green-600 text-white",
                            )}
                          >
                            {rep.is_active ? "⏸️" : "▶️"}
                          </button>
                          <button
                            onClick={() => {
                              setShowViewAll(false);
                              setTimeout(
                                () => handleDelete(rep.id, rep.name),
                                100,
                              );
                            }}
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-red-600 text-white hover:bg-red-700"
                          >
                            🗑️
                          </button>
                          <button
                            onClick={() => {
                              setShowViewAll(false);
                              setTimeout(() => setTokenRep(rep), 100);
                            }}
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-purple-600 text-white hover:bg-purple-700"
                          >
                            🔗
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {vaFiltered.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No representatives match your filters.
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t bg-muted/50 px-6 py-3 shrink-0">
              <span className="text-xs text-muted-foreground">
                Showing {vaFiltered.length} of {reps.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setShowViewAll(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ ADD/EDIT MODAL ═══════ */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4">
              <h2 className="text-sm font-semibold">
                {editRep ? "Edit Representative" : "Add Representative"}
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Name *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Name Aliases
                  <span className="ml-1 font-normal text-muted-foreground">
                    (optional, comma-separated)
                  </span>
                </label>
                <Input
                  value={form.name_aliases_text}
                  onChange={(e) =>
                    setField("name_aliases_text", e.target.value)
                  }
                  placeholder="e.g. Alecia Reed, Alecia M Reed"
                  className="h-10 text-sm"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Alternate names the import-compare flow should treat as
                  this rep. Useful for married names, abbreviations, or
                  recurring sheet typos.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Email *
                </label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Type *</label>
                <Select
                  value={form.rep_type}
                  onValueChange={(v) => setField("rep_type", v)}
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal_advocates">
                      Internal Advocates
                    </SelectItem>
                    <SelectItem value="external_advocates">
                      External Advocates
                    </SelectItem>
                    <SelectItem value="in-house">In-House</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 flex items-center justify-between text-sm font-medium">
                  Priority{" "}
                  <span className="text-muted-foreground tabular-nums">
                    {form.priority}/10
                  </span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={form.priority}
                  onChange={(e) =>
                    setField("priority", parseInt(e.target.value))
                  }
                  className="w-full h-2 rounded-full appearance-none bg-muted accent-blue-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Daily Limit
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={form.daily_limit}
                    onChange={(e) =>
                      setField("daily_limit", parseInt(e.target.value) || 1)
                    }
                    className="h-10 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Weekly Limit
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={form.weekly_limit}
                    onChange={(e) =>
                      setField("weekly_limit", parseInt(e.target.value) || 1)
                    }
                    className="h-10 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Hearing Restriction
                </label>
                <div className="space-y-1.5">
                  {RESTRICTION_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg border p-3 cursor-pointer transition-all",
                        form.hearing_restriction === opt.value
                          ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30"
                          : "border-border hover:bg-muted/50",
                      )}
                    >
                      <input
                        type="radio"
                        name="fr"
                        checked={form.hearing_restriction === opt.value}
                        onChange={() =>
                          setField("hearing_restriction", opt.value)
                        }
                        className="h-4 w-4 accent-blue-600"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {opt.desc}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t bg-muted/50 px-5 py-3">
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-sm"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-9 text-sm"
                onClick={handleSubmit}
                disabled={saving || !form.name || !form.email}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* External modals from components/modals/ */}
      {showRevokeAll && (
        <RevokeAllModal onClose={() => setShowRevokeAll(false)} />
      )}
      {showBulkLinks && (
        <BulkLinksModal onClose={() => setShowBulkLinks(false)} />
      )}
      {tokenRep && (
        <TokenModal
          repId={tokenRep.id}
          repName={tokenRep.name}
          repEmail={tokenRep.email || ""}
          onClose={() => setTokenRep(null)}
        />
      )}
    </>
  );
}

"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { RefreshCw, Download, ChevronLeft, ChevronRight, Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModalShell } from "@/components/modals/modal-shell";
import {
  getHearingsPaginated,
  updateMrStatus,
  updateHearingDecisionStatus,
  updateMrTeam,
  toggleTaskAssigned,
  toggleCredited,
  updateMoa,
} from "@/app/(dashboard)/medical-records/action";
import type {
  Hearing, MrTeam, HearingFilters, Permissions,
} from "@/app/(dashboard)/medical-records/action";

// ─── Colour helpers ───────────────────────────────────────────────────────────

const TEAM_COLOUR_MAP: Record<string, string> = {
  blue: "#3b82f6", orange: "#f97316", green: "#22c55e",
  yellow: "#eab308", purple: "#a855f7", red: "#ef4444",
  pink: "#ec4899", teal: "#14b8a6", indigo: "#6366f1", cyan: "#06b6d4",
};

function teamHex(color: string | null): string {
  if (!color) return "#9ca3af";
  return TEAM_COLOUR_MAP[color] ?? color;
}

// Theme-safe status badge classes
const MR_STATUS_COLOURS: Record<string, string> = {
  "Complete":                "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "In Progress":             "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  "Ready":                   "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "Not Started":             "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "URGENT! NEEDS ATTENTION": "bg-red-700 text-white font-semibold",
  "WITHDRAWAL":              "bg-zinc-200 text-zinc-500 line-through dark:bg-zinc-700 dark:text-zinc-400",
};

function mrStatusCls(s: string | null): string {
  return MR_STATUS_COLOURS[s ?? ""] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
}

const HRG_STATUS_COLOURS: Record<string, string> = {
  "Scheduled":            "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  "Favorable":            "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Unfavorable":          "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  "Post HRG Review/ Dev": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  "Continued":            "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
  "Pending Decision":     "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  "OTR at Hrg":           "bg-green-700 text-white",
  "Dismissal":            "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function hrgStatusCls(s: string | null): string {
  return HRG_STATUS_COLOURS[s ?? ""] ?? "bg-red-500 text-white";
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  teams: MrTeam[];
  mrStatusOptions: string[];
  hearingDecisionOptions: string[];
  mannerOptions: string[];
  availableMonths: Array<{ month_value: string; month_label: string }>;
  permissions: Permissions;
}

const DATE_RANGE_OPTIONS = [
  { value: "",           label: "All Dates" },
  { value: "today",      label: "Today" },
  { value: "this_week",  label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "next_week",  label: "Next Week" },
  { value: "next_month", label: "Next Month" },
  { value: "custom",     label: "Custom Range…" },
];

// ─── HearingRow ───────────────────────────────────────────────────────────────
// Native selects/checkboxes are intentional — they live inside a fixed-column
// data grid where shadcn Select would break the compact layout.

function HearingRow({
  h, teams, mrStatusOptions, hearingDecisionOptions, mannerOptions, permissions, onUpdate,
}: {
  h: Hearing;
  teams: MrTeam[];
  mrStatusOptions: string[];
  hearingDecisionOptions: string[];
  mannerOptions: string[];
  permissions: Permissions;
  onUpdate: (id: number, field: string, value: unknown) => void;
}) {
  const dateStr = new Date(h.hearing_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div
      className="grid gap-3 px-4 py-2 border-b border-border/50 hover:bg-muted/40 transition-colors text-xs items-center"
      style={{ gridTemplateColumns: "180px 120px 40px 100px 170px 120px 40px 100px 80px 48px 80px 90px", minWidth: "1260px" }}
    >
      {/* Claimant */}
      <div className="font-semibold text-foreground truncate">
        {h.claimant}
        {h.rep_name && <div className="text-[10px] text-muted-foreground font-normal truncate">{h.rep_name}</div>}
      </div>

      {/* MR Specialist */}
      <div>
        {permissions.canEditMrTeam ? (
          <select
            className="w-full text-[10px] px-1.5 py-1 rounded border border-border bg-card cursor-pointer"
            value={h.mr_team_id ?? ""}
            style={{ backgroundColor: h.mr_team_id ? teamHex(h.mr_team_color) : undefined, color: h.mr_team_id ? "#fff" : undefined }}
            onChange={(e) => onUpdate(h.id, "mr_team", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Unassigned</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.team_name}</option>)}
          </select>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-medium"
            style={{ backgroundColor: teamHex(h.mr_team_color), color: h.mr_team_id ? "#fff" : "#6b7280" }}>
            {h.mr_team_name ?? "Unassigned"}
          </span>
        )}
      </div>

      {/* Task */}
      <div className="text-center">
        {permissions.canEditTask ? (
          <input type="checkbox" checked={h.task_assigned} className="w-4 h-4 cursor-pointer accent-emerald-500"
            onChange={(e) => onUpdate(h.id, "task_assigned", e.target.checked)} />
        ) : (
          <span className={h.task_assigned ? "text-emerald-500 font-bold" : "text-muted-foreground/40"}>
            {h.task_assigned ? "✓" : "—"}
          </span>
        )}
      </div>

      {/* Date */}
      <div className="text-foreground font-medium">
        {dateStr}
        {h.converted_time_est && <div className="text-[10px] text-muted-foreground">{h.converted_time_est}</div>}
      </div>

      {/* MR Status */}
      <div>
        {permissions.canManage ? (
          <select
            className={cn("w-full text-[10px] px-1.5 py-1 rounded border-0 cursor-pointer", mrStatusCls(h.medical_record_status))}
            value={h.medical_record_status ?? ""}
            onChange={(e) => onUpdate(h.id, "medical_record_status", e.target.value)}
          >
            <option value="">No Status</option>
            {mrStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <span className={cn("inline-block text-[10px] px-2 py-0.5 rounded font-medium", mrStatusCls(h.medical_record_status))}>
            {h.medical_record_status ?? "No Status"}
          </span>
        )}
      </div>

      {/* Credited */}
      <div>
        {permissions.canEditCredited ? (
          <input type="checkbox" checked={h.credited} className="w-4 h-4 cursor-pointer accent-blue-500"
            onChange={(e) => onUpdate(h.id, "credited", e.target.checked)} />
        ) : (
          <span className={h.credited ? "text-blue-500 font-bold" : "text-muted-foreground/40"}>
            {h.credited ? "✓" : "—"}
          </span>
        )}
      </div>

      {/* Hearing Decision */}
      <div>
        {permissions.canManage ? (
          <select
            className={cn("w-full text-[10px] px-1.5 py-1 rounded border-0 cursor-pointer", hrgStatusCls(h.hearing_decision_status))}
            value={h.hearing_decision_status ?? ""}
            onChange={(e) => onUpdate(h.id, "hearing_decision_status", e.target.value)}
          >
            <option value="">— Status —</option>
            {hearingDecisionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <span className={cn("inline-block text-[10px] px-2 py-0.5 rounded font-medium", hrgStatusCls(h.hearing_decision_status))}>
            {h.hearing_decision_status ?? "—"}
          </span>
        )}
      </div>

      {/* MOA */}
      <div>
        {permissions.canEditMoa ? (
          <select
            className="w-full text-[10px] px-1.5 py-1 rounded border border-border bg-card text-foreground cursor-pointer"
            value={h.manner_of_appearance ?? ""}
            onChange={(e) => onUpdate(h.id, "manner_of_appearance", e.target.value)}
          >
            <option value="">—</option>
            {mannerOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <span className="text-[10px] text-muted-foreground">{h.manner_of_appearance ?? "—"}</span>
        )}
      </div>

      {/* 5-Day */}
      <div className="text-center text-[10px]">
        {h.five_day_notice
          ? <span className="text-emerald-500 font-bold">✓</span>
          : <span className="text-muted-foreground/40">—</span>}
      </div>

      {/* Post HRG */}
      <div className="text-[10px]">
        {h.post_hrg_review ? (
          <span className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 px-1.5 py-0.5 rounded font-medium">📝 PHR</span>
        ) : <span className="text-muted-foreground/40">—</span>}
      </div>

      {/* Worksheet */}
      <div>
        {h.medical_record_link ? (
          <a href={h.medical_record_link} target="_blank" rel="noreferrer"
            className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded transition-colors">
            📋 Sheet
          </a>
        ) : (
          <span className="text-muted-foreground/40 text-[10px]">—</span>
        )}
      </div>
    </div>
  );
}

// ─── StatsBar ─────────────────────────────────────────────────────────────────

function StatsBar({ stats }: {
  stats: { total: number; complete: number; in_progress: number; ready: number; not_started: number; urgent: number };
}) {
  return (
    <div className="flex gap-2 px-4 py-2 bg-muted/30 border-b border-border flex-wrap items-center shrink-0">
      <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-muted text-muted-foreground">
        Total: {stats.total}
      </span>
      <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-purple-700 text-white">
        Complete: {stats.complete}
      </span>
      <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300">
        In Progress: {stats.in_progress}
      </span>
      <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
        Ready: {stats.ready}
      </span>
      <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
        Not Started: {stats.not_started}
      </span>
      {stats.urgent > 0 && (
        <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-red-700 text-white">
          🚨 Urgent: {stats.urgent}
        </span>
      )}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function HearingsModal({
  open, onClose,
  teams, mrStatusOptions, hearingDecisionOptions, mannerOptions,
  availableMonths, permissions,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [hearings, setHearings] = useState<Hearing[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({ total: 0, complete: 0, in_progress: 0, ready: 0, not_started: 0, urgent: 0 });
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const [filters, setFilters] = useState<HearingFilters>({
    search: "", month_filter: "", team_filter: "", status_filter: "",
    assignment_filter: "", date_range: "", date_from: "", date_to: "",
    sort_order: "asc", page: 1, per_page: 50,
  });

  const load = useCallback((f: HearingFilters) => {
    startTransition(async () => {
      const res = await getHearingsPaginated(f);
      setHearings(res.hearings);
      setTotal(res.total);
      setTotalPages(res.total_pages);
      setStats(res.stats);
    });
  }, []);

  useEffect(() => { if (open) load(filters); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilter(patch: Partial<HearingFilters>) {
    const next = { ...filters, ...patch, page: 1 };
    setFilters(next);
    load(next);
  }

  function goPage(p: number) {
    const next = { ...filters, page: p };
    setFilters(next);
    load(next);
  }

  async function handleUpdate(id: number, field: string, value: unknown) {
    const actions: Record<string, (v: unknown) => Promise<unknown>> = {
      medical_record_status:   (v) => updateMrStatus(id, v as string),
      hearing_decision_status: (v) => updateHearingDecisionStatus(id, v as string),
      mr_team:                 (v) => updateMrTeam(id, v as number | null),
      task_assigned:           (v) => toggleTaskAssigned(id, v as boolean),
      credited:                (v) => toggleCredited(id, v as boolean),
      manner_of_appearance:    (v) => updateMoa(id, v as string),
    };
    await actions[field]?.(value);
    setHearings((prev) => prev.map((h) => h.id === id ? { ...h, [field]: value } : h));
  }

  const grouped = hearings.reduce<Record<string, Hearing[]>>((acc, h) => {
    const key = h.hearing_date.slice(0, 7);
    (acc[key] ??= []).push(h);
    return acc;
  }, {});

  if (!open) return null;

  return (
    <ModalShell
      title="Hearings — Detail View"
      icon={FileText}
      onClose={onClose}
      maxWidth="max-w-[1700px]"
      layout="bare"
      actions={
        <>
          <button
            onClick={() => load(filters)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-semibold transition-colors"
          >
            <RefreshCw size={12} /> Refresh
          </button>
          <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors">
            <Download size={12} /> Export CSV
          </button>
        </>
      }
    >
      {/* ── Filter Bar — flex-shrink-0, never scrolls away ─────────────── */}
      <div className="flex flex-wrap gap-2 px-4 py-2.5 bg-muted/20 border-b border-border shrink-0">
        <input
          type="text"
          placeholder="🔍 Search claimant…"
          value={filters.search}
          onChange={(e) => applyFilter({ search: e.target.value })}
          className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:border-primary min-w-40"
        />
        <select value={filters.sort_order} onChange={(e) => applyFilter({ sort_order: e.target.value as "asc" | "desc" })}
          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer">
          <option value="asc">📅 Date Asc</option>
          <option value="desc">📅 Date Desc</option>
        </select>
        <select value={filters.date_range} onChange={(e) => applyFilter({ date_range: e.target.value })}
          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer">
          {DATE_RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {filters.date_range === "custom" && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={filters.date_from} onChange={(e) => applyFilter({ date_from: e.target.value })}
              className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground" />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="date" value={filters.date_to} onChange={(e) => applyFilter({ date_to: e.target.value })}
              className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground" />
          </div>
        )}
        <select value={filters.month_filter} onChange={(e) => applyFilter({ month_filter: e.target.value })}
          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer">
          <option value="">All Months</option>
          {availableMonths.map((m) => <option key={m.month_value} value={m.month_value}>{m.month_label}</option>)}
        </select>
        <select value={filters.team_filter} onChange={(e) => applyFilter({ team_filter: e.target.value })}
          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer">
          <option value="">All Teams</option>
          <option value="unassigned">Unassigned</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.team_name}</option>)}
        </select>
        <select value={filters.status_filter} onChange={(e) => applyFilter({ status_filter: e.target.value })}
          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer">
          <option value="">All Statuses</option>
          <option value="unassigned">No Status</option>
          {mrStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.assignment_filter} onChange={(e) => applyFilter({ assignment_filter: e.target.value })}
          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer">
          <option value="">All Assignments</option>
          <option value="no_specialist">No Specialist</option>
          <option value="no_task">No Task Assigned</option>
          <option value="no_both">No Specialist &amp; No Task</option>
        </select>
        <button
          onClick={() => applyFilter({ search: "", month_filter: "", team_filter: "", status_filter: "", assignment_filter: "", date_range: "", date_from: "", date_to: "" })}
          className="text-xs px-3 py-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:text-zinc-200 font-semibold transition-colors"
        >
          Clear
        </button>
      </div>

      {/* ── Stats Bar — flex-shrink-0 ───────────────────────────────────── */}
      <StatsBar stats={stats} />

      {/* ── Column Headers — flex-shrink-0, sticky above scrollable body ── */}
      <div className="shrink-0 overflow-x-auto border-b border-border">
        <div
          className="grid gap-3 px-4 py-2 bg-muted text-foreground text-[10px] font-semibold uppercase tracking-wide"
          style={{ gridTemplateColumns: "180px 120px 40px 100px 170px 120px 40px 100px 80px 48px 80px 90px", minWidth: "1260px" }}
        >
          <div>Claimant</div><div>MR Specialist</div><div>Task</div><div>Date</div>
          <div>MR Status</div><div>Credited</div><div>Status</div><div>MOA</div>
          <div>5-Day</div><div>Post HRG</div><div>Worksheet</div>
        </div>
      </div>

      {/* ── Scrollable Rows — flex-1 min-h-0 ───────────────────────────── */}
      <div className="flex-1 overflow-y-auto relative min-h-0">
        {isPending && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center z-10">
            <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        )}

        {Object.entries(grouped).map(([monthKey, rows]) => {
          const expanded = expandedMonths.has(monthKey);
          const label = new Date(monthKey + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" });
          return (
            <div key={`hm-${monthKey}`}>
              <div
                className="flex items-center gap-3 px-4 py-2 bg-muted/40 border-b border-border cursor-pointer hover:bg-muted/60 transition-colors select-none"
                onClick={() => setExpandedMonths((p) => {
                  const n = new Set(p);
                  if (n.has(monthKey)) {
                    n.delete(monthKey)
                  } else {
                    n.add(monthKey)
                  }
                  return n;
                })}
              >
                <span className="w-5 h-5 flex items-center justify-center bg-primary text-white rounded text-[10px] font-bold shrink-0">
                  {expanded ? "−" : "+"}
                </span>
                <span className="text-xs font-semibold text-foreground">{label}</span>
                <span className="text-[11px] text-muted-foreground ml-1">({rows.length})</span>
              </div>
              {expanded && rows.map((h) => (
                <HearingRow
                  key={`hr-${h.id}`}
                  h={h} teams={teams}
                  mrStatusOptions={mrStatusOptions}
                  hearingDecisionOptions={hearingDecisionOptions}
                  mannerOptions={mannerOptions}
                  permissions={permissions}
                  onUpdate={handleUpdate}
                />
              ))}
            </div>
          );
        })}

        {!isPending && hearings.length === 0 && (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            No hearings match the current filters.
          </div>
        )}
      </div>

      {/* ── Pagination Footer — flex-shrink-0 ──────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-border bg-muted/20 shrink-0">
        <span className="text-xs text-muted-foreground">
          Showing {((filters.page ?? 1) - 1) * (filters.per_page as number) + 1}–{Math.min(
            (filters.page ?? 1) * (filters.per_page as number), total
          )} of {total}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={filters.per_page}
            onChange={(e) => applyFilter({ per_page: e.target.value === "all" ? "all" : Number(e.target.value) })}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
          >
            <option value={50}>50/page</option>
            <option value={100}>100/page</option>
            <option value={200}>200/page</option>
            <option value="all">Show All</option>
          </select>
          <button
            onClick={() => goPage((filters.page ?? 1) - 1)}
            disabled={(filters.page ?? 1) <= 1}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:text-zinc-200 font-semibold disabled:opacity-40 transition-colors"
          >
            <ChevronLeft size={12} /> Prev
          </button>
          <span className="text-xs text-muted-foreground">Page {filters.page} of {totalPages}</span>
          <button
            onClick={() => goPage((filters.page ?? 1) + 1)}
            disabled={(filters.page ?? 1) >= totalPages}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-40 transition-colors"
          >
            Next <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

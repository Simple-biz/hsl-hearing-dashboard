"use client";

import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ClaimantCopyButton } from "@/components/ui/claimant-copy-button";
import { ModalShell } from "@/components/modals/modal-shell";
import { PostHrgReviewModal } from "@/components/modals/post-hrg-review-modal";
import {
  getHearingsPaginated,
  updateMrStatus,
  updateHearingDecisionStatus,
  updateMrTeam,
  toggleTaskAssigned,
  toggleCredited,
  updateMoa,
  toggleFiveDayNotice,
} from "@/app/(dashboard)/medical-records/action";
import type {
  Hearing,
  MrTeam,
  HearingFilters,
  Permissions,
} from "@/app/(dashboard)/medical-records/action";

// ─── Colour helpers ───────────────────────────────────────────────────────────

// Compact stamp for the workflow-checkbox completion date — "May 7, 26".
// Matches fmtCheckStamp in dashboard-client + medical-records-client.
function fmtCheckStamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function fmtTime(raw: string | null | undefined): string {
  if (!raw) return "";
  const [hStr, mStr] = raw.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  if (isNaN(h)) return raw;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

const TEAM_COLOUR_MAP: Record<string, string> = {
  blue: "#3b82f6",
  orange: "#f97316",
  green: "#22c55e",
  yellow: "#eab308",
  purple: "#a855f7",
  red: "#ef4444",
  pink: "#ec4899",
  teal: "#14b8a6",
  indigo: "#6366f1",
  cyan: "#06b6d4",
};

function teamHex(color: string | null): string {
  if (!color) return "#9ca3af";
  return TEAM_COLOUR_MAP[color] ?? color;
}

// Theme-safe status badge classes
const MR_STATUS_COLOURS: Record<string, string> = {
  Complete:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "In Progress":
    "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  Ready: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "Not Started": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "URGENT! NEEDS ATTENTION": "bg-red-700 text-white font-semibold",
  WITHDRAWAL:
    "bg-zinc-200 text-zinc-500 line-through dark:bg-zinc-700 dark:text-zinc-400",
};

function mrStatusCls(s: string | null): string {
  return (
    MR_STATUS_COLOURS[s ?? ""] ??
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
  );
}

const HRG_STATUS_COLOURS: Record<string, string> = {
  Scheduled:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  Favorable:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  Unfavorable:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  "Post HRG Review/ Dev":
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  Continued: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
  "Pending Decision":
    "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  "OTR at Hrg": "bg-green-700 text-white",
  Dismissal: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function hrgStatusCls(s: string | null): string {
  return HRG_STATUS_COLOURS[s ?? ""] ?? "bg-red-500 text-white";
}

const MOA_COLOURS: Record<string, string> = {
  "Get Phone Permission":
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  "Case is Ready":
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  "In Person Florida":
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  Phone:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  OVH: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
};

function moaCls(s: string | null): string {
  return (
    MOA_COLOURS[s ?? ""] ??
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
  );
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
  userRole: string;
  userName: string;
}

const DATE_RANGE_OPTIONS = [
  { value: "", label: "All Dates" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "next_week", label: "Next Week" },
  { value: "next_month", label: "Next Month" },
  { value: "specific", label: "Specific Date" },
  { value: "custom", label: "Custom Range…" },
];

const MONTH_OPTIONS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

// ─── HearingRow ───────────────────────────────────────────────────────────────
// Native selects/checkboxes are intentional — they live inside a fixed-column
// data grid where shadcn Select would break the compact layout. Wrapped in
// memo so unrelated rows don't re-render when the parent's expand-state
// changes; relies on `onUpdate` having a stable reference (useCallback).

function HearingRowInner({
  h,
  teams,
  mrStatusOptions,
  hearingDecisionOptions,
  mannerOptions,
  permissions,
  onUpdate,
}: {
  h: Hearing;
  teams: MrTeam[];
  mrStatusOptions: string[];
  hearingDecisionOptions: string[];
  mannerOptions: string[];
  permissions: Permissions;
  onUpdate: (id: number, field: string, value: unknown) => void;
}) {
  const dateStr = new Date(h.hearing_date + "T00:00:00").toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric" },
  );

  // Whole-row tint by credited state — mirrors the MR Pivot's pattern so the
  // visual cue is consistent across the page. Light mode uses pale 50-shade;
  // dark mode uses 500-shade at low opacity (900-shade reads as invisible
  // against the near-black surface).
  const creditedRowCls =
    h.credited === true
      ? "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30"
      : h.credited === false
        ? "bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/20 dark:hover:bg-rose-500/30"
        : "hover:bg-muted/40";

  return (
    <div
      className={cn(
        "grid gap-3 px-4 py-2 border-b border-border/50 transition-colors text-xs items-center",
        creditedRowCls,
      )}
      style={{
        gridTemplateColumns:
          "minmax(180px,2fr) minmax(120px,1.4fr) minmax(40px,0.4fr) minmax(90px,1fr) minmax(160px,1.8fr) minmax(55px,0.5fr) minmax(130px,1.4fr) minmax(100px,1.1fr) minmax(50px,0.5fr) minmax(80px,0.9fr) minmax(90px,1fr)",
        minWidth: "1180px",
      }}
    >
      {/* Claimant — matches MR Pivot pattern: MyCase-linked name + copy button
          on top, rep · Chronicle below. */}
      <div className="min-w-0">
        <div className="font-semibold truncate flex items-center gap-1">
          {h.claimant_link ? (
            <a
              href={h.claimant_link}
              target="_blank"
              rel="noreferrer"
              className="text-blue-500 hover:text-blue-400 underline truncate"
            >
              {h.claimant}
            </a>
          ) : (
            <span className="text-foreground truncate">{h.claimant}</span>
          )}
          <ClaimantCopyButton name={h.claimant} link={h.claimant_link} />
        </div>
        {(h.rep_name || h.chronicle_link) && (
          <div className="text-[10px] text-muted-foreground font-normal truncate flex items-center gap-1">
            {h.rep_name && <span className="truncate">{h.rep_name}</span>}
            {h.rep_name && h.chronicle_link && (
              <span className="text-border">·</span>
            )}
            {h.chronicle_link && (
              <a
                href={h.chronicle_link}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-violet-600 hover:underline dark:text-violet-400"
              >
                Chronicle
              </a>
            )}
          </div>
        )}
      </div>

      {/* MR Specialist */}
      <div className="text-center">
        {permissions.canEditMrTeam ? (
          <select
            className="w-full text-[10px] px-1.5 py-1 rounded border border-border bg-card cursor-pointer [&>option]:bg-white [&>option]:text-black dark:[&>option]:bg-zinc-800 dark:[&>option]:text-zinc-100"
            value={h.mr_team_id ?? ""}
            style={{
              backgroundColor: h.mr_team_id
                ? teamHex(h.mr_team_color)
                : undefined,
              color: h.mr_team_id ? "#fff" : undefined,
            }}
            onChange={(e) =>
              onUpdate(
                h.id,
                "mr_team",
                e.target.value ? Number(e.target.value) : null,
              )
            }
          >
            <option value="">Unassigned</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.team_name}
              </option>
            ))}
          </select>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-medium"
            style={{
              backgroundColor: teamHex(h.mr_team_color),
              color: h.mr_team_id ? "#fff" : "#6b7280",
            }}
          >
            {h.mr_team_name ?? "Unassigned"}
          </span>
        )}
      </div>

      {/* Task */}
      <div className="text-center">
        {permissions.canEditTask ? (
          <input
            type="checkbox"
            checked={h.task_assigned}
            className="w-4 h-4 cursor-pointer accent-emerald-500"
            onChange={(e) => onUpdate(h.id, "task_assigned", e.target.checked)}
          />
        ) : (
          <span
            className={
              h.task_assigned
                ? "text-emerald-500 font-bold"
                : "text-muted-foreground/40"
            }
          >
            {h.task_assigned ? "✓" : "—"}
          </span>
        )}
      </div>

      {/* Date */}
      <div className="text-center text-foreground font-medium">
        {dateStr}
        {h.converted_time_est && (
          <div className="text-[10px] text-muted-foreground">
            {fmtTime(h.converted_time_est)}
          </div>
        )}
      </div>

      {/* MR Status */}
      <div className="text-center">
        {permissions.canEditMrStatus ? (
          <select
            className={cn(
              "w-full text-[10px] px-1.5 py-1 rounded border-0 cursor-pointer [&>option]:bg-white [&>option]:text-black dark:[&>option]:bg-zinc-800 dark:[&>option]:text-zinc-100",
              mrStatusCls(h.medical_record_status),
            )}
            value={h.medical_record_status ?? ""}
            onChange={(e) =>
              onUpdate(h.id, "medical_record_status", e.target.value)
            }
          >
            <option value="">No Status</option>
            {mrStatusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <span
            className={cn(
              "inline-block text-[10px] px-2 py-0.5 rounded font-medium",
              mrStatusCls(h.medical_record_status),
            )}
          >
            {h.medical_record_status ?? "No Status"}
          </span>
        )}
      </div>

      {/* Credited — 3-state (— / ✓ / ✗) matching the main Medical Records
          table. null = unverified, true = credited, false = not credited. */}
      <div className="text-center">
        {permissions.canEditCredited ? (
          <select
            value={h.credited === null ? "" : h.credited ? "true" : "false"}
            onChange={(e) => {
              const v = e.target.value;
              const next: boolean | null = v === "" ? null : v === "true";
              onUpdate(h.id, "credited", next);
            }}
            className={cn(
              "text-xs px-1.5 py-0.5 rounded border cursor-pointer font-medium",
              h.credited === true &&
                "bg-emerald-100 border-emerald-300 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
              h.credited === false &&
                "bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:text-red-300",
              h.credited === null &&
                "bg-card border-border text-muted-foreground",
            )}
            aria-label="Credited status"
          >
            <option value="">—</option>
            <option value="true">✓</option>
            <option value="false">✗</option>
          </select>
        ) : h.credited === true ? (
          <span className="text-emerald-600 font-bold">✓</span>
        ) : h.credited === false ? (
          <span className="text-red-500 font-bold">✗</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </div>

      {/* Hearing Decision */}
      <div className="text-center">
        {permissions.canEditDecisionStatus ? (
          <select
            className={cn(
              "w-full text-[10px] px-1.5 py-1 rounded border-0 cursor-pointer [&>option]:bg-white [&>option]:text-black dark:[&>option]:bg-zinc-800 dark:[&>option]:text-zinc-100",
              hrgStatusCls(h.hearing_decision_status),
            )}
            value={h.hearing_decision_status ?? ""}
            onChange={(e) =>
              onUpdate(h.id, "hearing_decision_status", e.target.value)
            }
          >
            <option value="">— Status —</option>
            {hearingDecisionOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <span
            className={cn(
              "inline-block text-[10px] px-2 py-0.5 rounded font-medium",
              hrgStatusCls(h.hearing_decision_status),
            )}
          >
            {h.hearing_decision_status ?? "—"}
          </span>
        )}
      </div>

      {/* MOA */}
      <div className="text-center">
        {permissions.canEditMoa ? (
          <select
            className={cn(
              "w-full text-[10px] px-1.5 py-1 rounded border-0 cursor-pointer [&>option]:bg-white [&>option]:text-black dark:[&>option]:bg-zinc-800 dark:[&>option]:text-zinc-100",
              moaCls(h.manner_of_appearance),
            )}
            value={h.manner_of_appearance ?? ""}
            onChange={(e) =>
              onUpdate(h.id, "manner_of_appearance", e.target.value)
            }
          >
            <option value="">—</option>
            {mannerOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            {h.manner_of_appearance ?? "—"}
          </span>
        )}
      </div>

      {/* 5-Day — checkbox with completion-date stamp below when ticked.
          Matches the MR Pivot pattern (medical-records-client.tsx). */}
      <div className="flex flex-col items-center justify-center gap-0.5 leading-none">
        <input
          type="checkbox"
          checked={h.five_day_notice}
          disabled={!permissions.canEditFiveDay}
          className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer disabled:cursor-default"
          onChange={(e) => onUpdate(h.id, "five_day_notice", e.target.checked)}
        />
        {h.five_day_notice && h.five_day_notice_at && (
          <span className="text-[9px] leading-none text-muted-foreground tabular-nums">
            {fmtCheckStamp(h.five_day_notice_at)}
          </span>
        )}
      </div>

      {/* Post HRG — clickable button showing + Add or Notes, matching MR page */}
      <div className="flex justify-center">
        <button
          onClick={() => onUpdate(h.id, "__open_post_hrg", h)}
          className={cn(
            "inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border transition-colors whitespace-nowrap",
            h.post_hrg_review
              ? "bg-yellow-50 border-yellow-300 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-300"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          📝{" "}
          {h.post_hrg_review ? (
            <span className="font-semibold">Notes</span>
          ) : (
            <span>+ Add</span>
          )}
        </button>
      </div>

      {/* MR Worksheet */}
      <div className="text-center">
        {h.medical_record_link ? (
          <a
            href={h.medical_record_link}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded transition-colors"
          >
            📋 Sheet
          </a>
        ) : (
          <span className="text-[10px] text-muted-foreground hover:text-foreground cursor-default">
            + Link
          </span>
        )}
      </div>
    </div>
  );
}

// Memoized export — shallow-compares props so unrelated rows skip re-render
// when the parent's expand-state changes. Stable `onUpdate` (useCallback in
// HearingsModal) is what makes this effective.
const HearingRow = memo(HearingRowInner);

// ─── StatsBar ─────────────────────────────────────────────────────────────────

function StatsBar({
  stats,
}: {
  stats: {
    total: number;
    complete: number;
    in_progress: number;
    ready: number;
    not_started: number;
    urgent: number;
  };
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
  open,
  onClose,
  teams,
  mrStatusOptions,
  hearingDecisionOptions,
  mannerOptions,
  availableMonths,
  permissions,
  userRole,
  userName,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [hearings, setHearings] = useState<Hearing[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({
    total: 0,
    complete: 0,
    in_progress: 0,
    ready: 0,
    not_started: 0,
    urgent: 0,
  });
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [postHrgHearing, setPostHrgHearing] = useState<Hearing | null>(null);

  // Derive the Year dropdown options from the existing availableMonths prop
  // (each entry's month_value is "YYYY-MM"). Unique, descending — newest first.
  const availableYears = Array.from(
    new Set(
      availableMonths
        .map((m) => m.month_value.slice(0, 4))
        .filter((y) => /^\d{4}$/.test(y)),
    ),
  ).sort((a, b) => b.localeCompare(a));

  const [filters, setFilters] = useState<HearingFilters>({
    search: "",
    month: "",
    year: "",
    team_filter: "",
    status_filter: "",
    assignment_filter: "",
    date_range: "",
    date_from: "",
    date_to: "",
    sort_order: "asc",
    page: 1,
    per_page: 50,
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

  // Manual refresh — refetches with current filters/sort/page and restores
  // scroll position so the user stays put. Bypasses startTransition so we
  // can await the fetch and show a spinner on the button itself.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    const top = scrollRef.current?.scrollTop ?? 0;
    setRefreshing(true);
    try {
      const res = await getHearingsPaginated(filters);
      setHearings(res.hearings);
      setTotal(res.total);
      setTotalPages(res.total_pages);
      setStats(res.stats);
    } finally {
      setRefreshing(false);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = top;
      });
    }
  }, [filters]);

  useEffect(() => {
    if (open) load(filters);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Stable reference — memoized HearingRow relies on this not changing
  // identity each render, otherwise the memo never hits.
  const handleUpdate = useCallback(
    async (id: number, field: string, value: unknown) => {
      // Special signal: open the Post HRG modal for a specific hearing
      if (field === "__open_post_hrg") {
        setPostHrgHearing(value as Hearing);
        return;
      }

      const actions: Record<string, (v: unknown) => Promise<unknown>> = {
        medical_record_status: (v) => updateMrStatus(id, v as string),
        hearing_decision_status: (v) =>
          updateHearingDecisionStatus(id, v as string),
        mr_team: (v) => updateMrTeam(id, v as number | null),
        task_assigned: (v) => toggleTaskAssigned(id, v as boolean),
        credited: (v) => toggleCredited(id, v as boolean | null),
        manner_of_appearance: (v) => updateMoa(id, v as string),
        five_day_notice: (v) => toggleFiveDayNotice(id, v as boolean),
      };

      // Snapshot the previous row in case we need to revert on server error.
      let snapshot: Hearing | undefined;
      setHearings((prev) => {
        const idx = prev.findIndex((h) => h.id === id);
        if (idx < 0) return prev;
        snapshot = prev[idx];
        // Optimistic patch — flip the field immediately so the checkbox/select
        // visually updates without waiting for the server roundtrip. For
        // five_day_notice we also stamp/clear the companion `_at` column the
        // way the server does (mirrors the MR Pivot's pattern).
        const patch: Partial<Hearing> = { [field]: value as Hearing[keyof Hearing] };
        if (field === "five_day_notice") {
          (patch as Partial<Hearing>).five_day_notice_at = value
            ? new Date().toISOString()
            : null;
        }
        const next = prev.slice();
        next[idx] = { ...snapshot, ...patch };
        return next;
      });

      try {
        await actions[field]?.(value);
      } catch (err) {
        // Revert on failure so the UI matches the server.
        if (snapshot) {
          const original = snapshot;
          setHearings((prev) =>
            prev.map((h) => (h.id === id ? original : h)),
          );
        }
        console.error(`[hearings-modal] ${field} failed — reverted`, err);
      }
    },
    [],
  );

  const grouped = hearings.reduce<Record<string, Hearing[]>>((acc, h) => {
    const key = h.hearing_date.slice(0, 7);
    (acc[key] ??= []).push(h);
    return acc;
  }, {});

  if (!open) return null;

  return (
    <>
      <ModalShell
        title="Hearings — Detail View"
        icon={FileText}
        onClose={onClose}
        maxWidth="max-w-[1700px]"
        layout="bare"
        actions={
          <>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh table data without losing scroll, filters, or sort"
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border font-semibold transition-colors bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 hover:border-sky-300 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800 dark:hover:bg-sky-950/50 dark:hover:border-sky-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw size={12} className={cn(refreshing && "animate-spin")} />
              <span className="hidden sm:inline">
                {refreshing ? "Refreshing…" : "Refresh"}
              </span>
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
          <select
            value={filters.sort_order}
            onChange={(e) =>
              applyFilter({ sort_order: e.target.value as "asc" | "desc" })
            }
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
          >
            <option value="asc">📅 Date Asc</option>
            <option value="desc">📅 Date Desc</option>
          </select>
          <select
            value={filters.date_range}
            onChange={(e) => applyFilter({ date_range: e.target.value })}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
          >
            {DATE_RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {filters.date_range === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={filters.date_from}
                onChange={(e) => applyFilter({ date_from: e.target.value })}
                className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) => applyFilter({ date_to: e.target.value })}
                className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground"
              />
            </div>
          )}
          {filters.date_range === "specific" && (
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) =>
                applyFilter({ date_from: e.target.value, date_to: "" })
              }
              className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground"
              aria-label="Specific hearing date"
            />
          )}
          <select
            value={filters.month || ""}
            onChange={(e) => applyFilter({ month: e.target.value })}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
          >
            <option value="">All Months</option>
            {MONTH_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={filters.year || ""}
            onChange={(e) => applyFilter({ year: e.target.value })}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
          >
            <option value="">All Years</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={filters.team_filter}
            onChange={(e) => applyFilter({ team_filter: e.target.value })}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
          >
            <option value="">All Teams</option>
            <option value="unassigned">Unassigned</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.team_name}
              </option>
            ))}
          </select>
          <select
            value={filters.status_filter}
            onChange={(e) => applyFilter({ status_filter: e.target.value })}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="unassigned">No Status</option>
            {mrStatusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={filters.assignment_filter}
            onChange={(e) => applyFilter({ assignment_filter: e.target.value })}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
          >
            <option value="">All Assignments</option>
            <option value="no_specialist">No Specialist</option>
            <option value="no_task">No Task Assigned</option>
            <option value="no_both">No Specialist &amp; No Task</option>
          </select>
          {/* Expand / Collapse all month groups on the current page. Pure
              client-side state — does not refetch. Wrapped in startTransition
              so the click feels instant; React renders the (potentially many)
              rows as a low-priority update without blocking the button. */}
          <button
            onClick={() =>
              startTransition(() =>
                setExpandedMonths(new Set(Object.keys(grouped))),
              )
            }
            disabled={
              Object.keys(grouped).length === 0 ||
              Object.keys(grouped).every((k) => expandedMonths.has(k))
            }
            title="Expand all month groups"
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Expand All
          </button>
          <button
            onClick={() => startTransition(() => setExpandedMonths(new Set()))}
            disabled={expandedMonths.size === 0}
            title="Collapse all month groups"
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Collapse All
          </button>
          <button
            onClick={() =>
              applyFilter({
                search: "",
                month: "",
                year: "",
                team_filter: "",
                status_filter: "",
                assignment_filter: "",
                date_range: "",
                date_from: "",
                date_to: "",
              })
            }
            className="text-xs px-3 py-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:text-zinc-200 font-semibold transition-colors"
          >
            Clear
          </button>
        </div>

        {/* ── Stats Bar — flex-shrink-0 ───────────────────────────────────── */}
        <StatsBar stats={stats} />

        {/* ── Scrollable table area — single horizontal scroll container for header + rows ── */}
        <div ref={scrollRef} className="flex-1 overflow-auto relative min-h-0">
          {isPending && (
            <div className="absolute inset-0 bg-background/70 flex items-center justify-center z-10">
              <Loader2 size={32} className="animate-spin text-primary" />
            </div>
          )}

          {/* Column Headers — sticky top so they stay visible while scrolling vertically */}
          <div
            className="grid gap-3 px-4 py-2 bg-muted text-foreground text-[10px] font-semibold uppercase tracking-wide sticky top-0 z-5 border-b border-border"
            style={{
              gridTemplateColumns:
                "minmax(180px,2fr) minmax(120px,1.4fr) minmax(40px,0.4fr) minmax(90px,1fr) minmax(160px,1.8fr) minmax(55px,0.5fr) minmax(130px,1.4fr) minmax(100px,1.1fr) minmax(50px,0.5fr) minmax(80px,0.9fr) minmax(90px,1fr)",
              minWidth: "1180px",
            }}
          >
            <div>Claimant</div>
            <div className="text-center">MR Specialist</div>
            <div className="text-center">Task</div>
            <div className="text-center">Date</div>
            <div className="text-center">MR Status</div>
            <div className="text-center">Credited</div>
            <div className="text-center">HRG Decision</div>
            <div className="text-center">MOA</div>
            <div className="text-center">5-Day</div>
            <div className="text-center">Post HRG</div>
            <div className="text-center">MR Worksheet</div>
          </div>

          {Object.entries(grouped).map(([monthKey, rows]) => {
            const expanded = expandedMonths.has(monthKey);
            const label = new Date(
              monthKey + "-01T00:00:00",
            ).toLocaleDateString("en-US", { month: "long", year: "numeric" });
            return (
              <div key={`hm-${monthKey}`}>
                <div
                  className="flex items-center gap-3 px-4 py-2 bg-muted/40 border-b border-border cursor-pointer hover:bg-muted/60 transition-colors select-none"
                  onClick={() =>
                    startTransition(() =>
                      setExpandedMonths((p) => {
                        const n = new Set(p);
                        if (n.has(monthKey)) {
                          n.delete(monthKey);
                        } else {
                          n.add(monthKey);
                        }
                        return n;
                      }),
                    )
                  }
                >
                  <span className="w-5 h-5 flex items-center justify-center bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded text-sm font-bold shrink-0">
                    {expanded ? "−" : "+"}
                  </span>
                  <span className="text-xs font-semibold text-foreground">
                    {label}
                  </span>
                  <span className="text-[11px] text-muted-foreground ml-1">
                    ({rows.length})
                  </span>
                </div>
                {expanded &&
                  rows.map((h) => (
                    <HearingRow
                      key={`hr-${h.id}`}
                      h={h}
                      teams={teams}
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
            {(() => {
              // Guard against non-numeric per_page values (e.g. stale "all"
              // from a previous build's URL/session) — fall back to 50 so the
              // range math doesn't produce NaN.
              const perPage =
                typeof filters.per_page === "number" && filters.per_page > 0
                  ? filters.per_page
                  : 50;
              const page = filters.page ?? 1;
              const start = total === 0 ? 0 : (page - 1) * perPage + 1;
              const end = Math.min(page * perPage, total);
              return `Showing ${start}–${end} of ${total}`;
            })()}
          </span>
          <div className="flex items-center gap-2">
            <select
              value={filters.per_page}
              onChange={(e) =>
                applyFilter({ per_page: Number(e.target.value) })
              }
              className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
            >
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
              <option value={200}>200 / page</option>
              <option value={500}>500 / page</option>
            </select>
            <button
              onClick={() => goPage(1)}
              disabled={(filters.page ?? 1) <= 1}
              className="flex items-center text-xs px-2 py-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:text-zinc-200 font-semibold disabled:opacity-40 transition-colors"
              title="First page"
            >
              <ChevronLeft size={12} />
              <ChevronLeft size={12} className="-ml-1.5" />
            </button>
            <button
              onClick={() => goPage((filters.page ?? 1) - 1)}
              disabled={(filters.page ?? 1) <= 1}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:text-zinc-200 font-semibold disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={12} /> Prev
            </button>
            <select
              value={filters.page ?? 1}
              onChange={(e) => goPage(Number(e.target.value))}
              className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer tabular-nums"
            >
              {Array.from({ length: totalPages }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Page {i + 1}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              of {totalPages}
            </span>
            <button
              onClick={() => goPage((filters.page ?? 1) + 1)}
              disabled={(filters.page ?? 1) >= totalPages}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-40 transition-colors"
            >
              Next <ChevronRight size={12} />
            </button>
            <button
              onClick={() => goPage(totalPages)}
              disabled={(filters.page ?? 1) >= totalPages}
              className="flex items-center text-xs px-2 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-40 transition-colors"
              title="Last page"
            >
              <ChevronRight size={12} />
              <ChevronRight size={12} className="-ml-1.5" />
            </button>
          </div>
        </div>
      </ModalShell>

      {/* Post HRG Review modal — opened from the 📝 button in each row */}
      {postHrgHearing && (
        <PostHrgReviewModal
          mode="hearing"
          hearingId={postHrgHearing.id}
          claimant={postHrgHearing.claimant ?? ""}
          hearingDateText={new Date(
            postHrgHearing.hearing_date + "T00:00:00",
          ).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          assignedRep={postHrgHearing.rep_name}
          userName={userName}
          userRole={userRole}
          initialNotes={null}
          initialDeadline={postHrgHearing.post_hrg_deadline}
          initialRequirements={postHrgHearing.post_hrg_requirements}
          initialDeadlinePrev={null}
          initialDeadlineChangedBy={null}
          onClose={() => setPostHrgHearing(null)}
          onHearingPatch={(patch) => {
            const mrPatch: Partial<Hearing> = {};
            if (patch.post_hrg_deadline !== undefined) {
              mrPatch.post_hrg_deadline = patch.post_hrg_deadline;
            }
            if (patch.post_hrg_review !== undefined) {
              mrPatch.post_hrg_review = patch.post_hrg_review ? "true" : null;
            }
            if (patch.post_hrg_requirements !== undefined) {
              mrPatch.post_hrg_requirements = patch.post_hrg_requirements;
            }
            setHearings((prev) =>
              prev.map((h) =>
                h.id === postHrgHearing.id ? { ...h, ...mrPatch } : h,
              ),
            );
            setPostHrgHearing((h) =>
              h && h.id === postHrgHearing.id ? { ...h, ...mrPatch } : h,
            );
          }}
        />
      )}
    </>
  );
}


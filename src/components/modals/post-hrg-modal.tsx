"use client";

import { useState, useEffect, useTransition, useCallback, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  ClipboardList,
  Check,
  X,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ClaimantCopyButton } from "@/components/ui/claimant-copy-button";
import { ModalShell } from "@/components/modals/modal-shell";
import { PostHrgReviewModal } from "@/components/modals/post-hrg-review-modal";
import {
  getPostHrgHearings,
  toggleFiveDayNotice,
} from "@/app/(dashboard)/medical-records/action";
import type {
  Hearing,
  MrTeam,
  HearingFilters,
} from "@/app/(dashboard)/medical-records/action";

interface Props {
  open: boolean;
  onClose: () => void;
  teams: MrTeam[];
  mrStatusOptions: string[];
  hearingId?: number;
  userName: string;
  userRole: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEAM_HEX: Record<string, string> = {
  blue: "#3b82f6", orange: "#f97316", green: "#22c55e",
  yellow: "#eab308", purple: "#a855f7", red: "#ef4444",
};
function teamBg(color: string | null | undefined) {
  if (!color) return { backgroundColor: "#9ca3af", color: "#fff" };
  return { backgroundColor: TEAM_HEX[color] ?? color, color: "#fff" };
}

const MR_STATUS_CLS: Record<string, string> = {
  "Complete":                  "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "In Progress":               "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  "Ready":                     "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "Not Started":               "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  "URGENT! NEEDS ATTENTION":   "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

/** Safely parse a date string or Date object — returns null if invalid */
function safeDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  // Already a Date object (Postgres driver returns DATE columns as Date)
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  if (typeof d !== "string" || d.length < 6) return null;
  // Strip time portion if it's a full ISO string, then parse as local date
  const dateOnly = d.includes("T") ? d.split("T")[0] : d;
  const parsed = new Date(dateOnly + "T00:00:00");
  return isNaN(parsed.getTime()) ? null : parsed;
}

// Compact stamp for the workflow-checkbox completion date — "May 7, 26".
// Matches fmtCheckStamp in dashboard-client + representative-docs.
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

function fmtDate(d: string | Date | null) {
  if (!d) return "—";
  // If it's already a Date object, use it directly
  if (d instanceof Date) {
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  // For strings, force local date parsing to avoid timezone shifts
  const dateOnly = d.includes("T") ? d.split("T")[0] : d;
  const parsed = new Date(dateOnly + "T00:00:00");
  return isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Parses "13:00:00", "13:00", "1:00 PM" etc → "01:00 PM"
function fmtTime(t: string | null): string {
  if (!t) return "—";
  // Already has AM/PM
  if (/[AaPp][Mm]/.test(t)) {
    const clean = t.trim().toUpperCase().replace(/\s+/, "");
    const [timePart, ampm] = [clean.slice(0, -2), clean.slice(-2)];
    const [h, m] = timePart.split(":").map(Number);
    return `${String(h).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}${ampm}`;
  }
  // 24hr format: "13:00:00" or "13:00"
  const parts = t.split(":");
  const h24 = Number(parts[0]);
  const min = parts[1] ?? "00";
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12  = h24 % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${min}${ampm}`;
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function PostHrgModal({ open, onClose, teams, mrStatusOptions, hearingId, userName, userRole }: Props) {
  const [isPending, startTransition] = useTransition();
  const [hearings, setHearings]       = useState<Hearing[]>([]);
  const [total, setTotal]             = useState(0);
  const [totalPages, setTotalPages]   = useState(1);
  // The hearing whose Post HRG Review modal is open (clicking the Post HRG
  // column cell). Null = no review modal open.
  const [reviewHearing, setReviewHearing] = useState<Hearing | null>(null);

  const [filters, setFilters] = useState<HearingFilters>({
    search: "", team_filter: "", status_filter: "",
    sort_order: "desc", page: 1, per_page: 50,
  });

  // Scroll container for the table body — used to restore scroll position
  // after manual refresh.
  const scrollRef = useRef<HTMLDivElement>(null);

  function load(f: HearingFilters) {
    startTransition(async () => {
      const res = await getPostHrgHearings(f);
      setHearings(res.hearings);
      setTotal(res.total);
      setTotalPages(res.total_pages);
      // Deep-link: auto-open the review modal for a specific hearing.
      if (hearingId) {
        const found = res.hearings.find((h) => h.id === hearingId);
        if (found) setReviewHearing(found);
      }
    });
  }

  // Manual refresh — refetches with current filters/sort/page and restores
  // scroll position so the user stays put. Bypasses startTransition so we
  // can await the fetch.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    const top = scrollRef.current?.scrollTop ?? 0;
    setRefreshing(true);
    try {
      const res = await getPostHrgHearings(filters);
      setHearings(res.hearings);
      setTotal(res.total);
      setTotalPages(res.total_pages);
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

  if (!open) return null;

  return (
    <>
    <ModalShell
      title={`Post HRG Review (${total})`}
      icon={ClipboardList}
      onClose={onClose}
      maxWidth="max-w-7xl"
      layout="bare"
    >
      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2 px-4 py-2.5 bg-muted/20 border-b border-border shrink-0">
        <input
          type="text"
          placeholder="🔍 Search claimant…"
          value={filters.search}
          onChange={(e) => applyFilter({ search: e.target.value })}
          className="text-xs px-3 py-1.5 rounded border border-border bg-card text-foreground focus:outline-none focus:border-primary min-w-40"
        />
        <select
          value={filters.sort_order}
          onChange={(e) => applyFilter({ sort_order: e.target.value as "asc" | "desc" })}
          className="text-xs px-2 py-1.5 rounded border border-border bg-card text-foreground cursor-pointer"
        >
          <option value="desc">Date Descending</option>
          <option value="asc">Date Ascending</option>
        </select>
        <select
          value={filters.team_filter}
          onChange={(e) => applyFilter({ team_filter: e.target.value })}
          className="text-xs px-2 py-1.5 rounded border border-border bg-card text-foreground cursor-pointer"
        >
          <option value="">All Teams</option>
          <option value="unassigned">Unassigned</option>
          {teams.filter((t) => (t.team_type as string) !== "shared").map((t) => (
            <option key={t.id} value={t.id}>{t.team_name}</option>
          ))}
        </select>
        <select
          value={filters.status_filter}
          onChange={(e) => applyFilter({ status_filter: e.target.value })}
          className="text-xs px-2 py-1.5 rounded border border-border bg-card text-foreground cursor-pointer"
        >
          <option value="">All MR Statuses</option>
          {mrStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {/* Refresh — refetches with current filters/sort/page and restores
            scroll position. Same class set as the other refresh buttons. */}
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
        <span className="ml-auto text-xs text-muted-foreground self-center">{total} hearing{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div ref={scrollRef} className="flex-1 overflow-auto min-h-0">
        {isPending ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : hearings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-16">No Post HRG hearings found.</p>
        ) : (
          <table className="w-full text-[11px] border-collapse min-w-275">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted text-foreground text-[10px] font-extrabold uppercase tracking-wider border-b border-border">
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Hearing Date</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Time</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Claimant</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Rep</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">MR Team</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">MR Status</th>
                <th className="px-3 py-2.5 text-center whitespace-nowrap">Credited</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Status</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap text-[9px] leading-tight">
                  Post HRG
                  <br />
                  Dev Status
                </th>
                <th className="px-3 py-2.5 text-center whitespace-nowrap">MOA</th>
                <th className="px-3 py-2.5 text-center whitespace-nowrap">5-Day</th>
                <th className="px-3 py-2.5 text-center whitespace-nowrap">Post HRG</th>
              </tr>
            </thead>
            <tbody>
              {hearings.map((h) => {
                // Match the row tint scheme used in the main MR table.
                const creditedRowCls =
                  h.credited === true
                    ? "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30"
                    : h.credited === false
                      ? "bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/20 dark:hover:bg-rose-500/30"
                      : "hover:bg-muted/30";
                return (
                <tr
                  key={h.id}
                  className={cn(
                    "border-b border-border/40 transition-colors",
                    creditedRowCls,
                  )}
                >
                  {/* Hearing Date */}
                  <td className="px-3 py-2 whitespace-nowrap font-medium text-foreground">
                    {fmtDate(h.hearing_date)}
                  </td>
                  {/* Time */}
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {fmtTime(h.converted_time_est)}
                  </td>
                  {/* Claimant — unified ClaimantCell pattern: hyperlinked
                      name (MyCase / claimant_link) + copy button, then
                      claim_type · Chronicle below. Matches the dashboard,
                      medical-records, post-hrg-development, and rep-docs
                      pages so the layout is globally consistent. */}
                  <td className="px-3 py-2 min-w-0">
                    <div className="flex items-center gap-1 min-w-0">
                      {h.claimant_link ? (
                        <a
                          href={h.claimant_link}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {h.claimant}
                        </a>
                      ) : (
                        <span className="truncate text-xs font-medium text-foreground">
                          {h.claimant}
                        </span>
                      )}
                      <ClaimantCopyButton
                        name={h.claimant}
                        link={h.claimant_link}
                      />
                    </div>
                    {(h.claim_type || h.chronicle_link) && (
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                        {h.claim_type && (
                          <span className="truncate">{h.claim_type}</span>
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
                  </td>
                  {/* Rep */}
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {h.rep_name ?? "—"}
                  </td>
                  {/* MR Team */}
                  <td className="px-3 py-2">
                    {h.mr_team_name ? (
                      <span className="inline-block text-[9px] px-1.5 py-0.5 rounded font-medium text-white whitespace-nowrap"
                        style={teamBg(h.mr_team_color)}>
                        {h.mr_team_name}
                      </span>
                    ) : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  {/* MR Status */}
                  <td className="px-3 py-2">
                    {h.medical_record_status ? (
                      <span className={cn("inline-block text-[9px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap",
                        MR_STATUS_CLS[h.medical_record_status] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      )}>
                        {h.medical_record_status}
                      </span>
                    ) : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  {/* Credited — read-only mirror of the main MR table. */}
                  <td className="px-3 py-2 text-center">
                    {h.credited === true ? (
                      <Check
                        className="inline h-4 w-4 text-emerald-600"
                        aria-label="Credited"
                      />
                    ) : h.credited === false ? (
                      <X
                        className="inline h-4 w-4 text-red-500"
                        aria-label="Not credited"
                      />
                    ) : (
                      <span
                        className="text-muted-foreground/40"
                        aria-label="Unverified"
                      >
                        —
                      </span>
                    )}
                  </td>
                  {/* Hearing Decision Status */}
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {h.hearing_decision_status ?? "—"}
                  </td>
                  {/* Dev Status — status from this hearing's linked MR
                      post_hrg_development row (NULL if no MR PHD row). */}
                  <td className="px-3 py-2 text-[10px] whitespace-nowrap">
                    {h.phd_mr_status ? (
                      <span className="text-foreground/90">
                        {h.phd_mr_status}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  {/* MOA */}
                  <td className="px-3 py-2 text-center">
                    {h.manner_of_appearance ? (
                      <span className="inline-block text-[9px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 font-medium">
                        {h.manner_of_appearance}
                      </span>
                    ) : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  {/* 5-Day — checkbox with completion-date stamp below
                      when ticked. Same pattern as the dashboard's
                      InlineCheck for workflow checkboxes. */}
                  <td className="px-3 py-2 text-center">
                    <div className="flex flex-col items-center justify-center gap-0.5 leading-none">
                      <input
                        type="checkbox"
                        checked={!!h.five_day_notice}
                        className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer"
                        onChange={async (e) => {
                          const val = e.target.checked;
                          // Optimistic — mirror the server's NOW() stamp so
                          // the date shows immediately on tick / clears on
                          // untick. The next refetch corrects the exact ms.
                          setHearings((prev) =>
                            prev.map((r) =>
                              r.id === h.id
                                ? {
                                    ...r,
                                    five_day_notice: val,
                                    five_day_notice_at: val
                                      ? new Date().toISOString()
                                      : null,
                                  }
                                : r,
                            ),
                          );
                          await toggleFiveDayNotice(h.id, val);
                        }}
                      />
                      {h.five_day_notice && h.five_day_notice_at && (
                        <span className="text-[9px] leading-none text-muted-foreground tabular-nums">
                          {fmtCheckStamp(h.five_day_notice_at)}
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Post HRG — opens the Post HRG Review modal */}
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setReviewHearing(h)}
                      title="Open Post HRG Review"
                      className="mx-auto flex items-center justify-center gap-1.5 flex-wrap rounded px-1.5 py-1 hover:bg-muted transition-colors"
                    >
                      {h.post_hrg_deadline && safeDate(h.post_hrg_deadline) && (
                        <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap",
                          safeDate(h.post_hrg_deadline)! < new Date()
                            ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        )}>
                          📅 {fmtDate(h.post_hrg_deadline)}
                        </span>
                      )}
                      {h.post_hrg_review && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-medium">
                          Notes
                        </span>
                      )}
                      {!h.post_hrg_deadline && !h.post_hrg_review && (
                        <span className="text-[9px] text-muted-foreground/50">+ Add</span>
                      )}
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-border bg-muted/20 shrink-0">
        <span className="text-xs text-muted-foreground">
          Page {filters.page} of {totalPages} — {total} total
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { const next = { ...filters, page: (filters.page ?? 1) - 1 }; setFilters(next); load(next); }}
            disabled={(filters.page ?? 1) <= 1}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-muted hover:bg-muted/80 text-foreground font-semibold disabled:opacity-40"
          >
            <ChevronLeft size={12} /> Prev
          </button>
          <button
            onClick={() => { const next = { ...filters, page: (filters.page ?? 1) + 1 }; setFilters(next); load(next); }}
            disabled={(filters.page ?? 1) >= totalPages}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-40"
          >
            Next <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </ModalShell>

    {/* Post HRG Review modal — opened from the Post HRG column */}
    {reviewHearing && (
      <PostHrgReviewModal
        mode="hearing"
        hearingId={reviewHearing.id}
        claimant={reviewHearing.claimant ?? ""}
        hearingDateText={fmtDate(reviewHearing.hearing_date)}
        assignedRep={reviewHearing.rep_name}
        userName={userName}
        userRole={userRole}
        initialNotes={null}
        initialDeadline={reviewHearing.post_hrg_deadline}
        initialRequirements={null}
        initialDeadlinePrev={null}
        initialDeadlineChangedBy={null}
        onClose={() => setReviewHearing(null)}
        onHearingPatch={(patch) => {
          const mrPatch: Partial<Hearing> = {};
          if (patch.post_hrg_deadline !== undefined) {
            mrPatch.post_hrg_deadline = patch.post_hrg_deadline;
          }
          if (patch.post_hrg_review !== undefined) {
            mrPatch.post_hrg_review = patch.post_hrg_review ? "true" : null;
          }
          setHearings((prev) =>
            prev.map((h) =>
              h.id === reviewHearing.id ? { ...h, ...mrPatch } : h,
            ),
          );
          setReviewHearing((h) =>
            h && h.id === reviewHearing.id ? { ...h, ...mrPatch } : h,
          );
        }}
      />
    )}
    </>
  );
}

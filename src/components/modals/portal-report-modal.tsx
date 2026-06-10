"use client";

import { useEffect, useState, useMemo } from "react";
import {
  X,
  BarChart3,
  RefreshCw,
  Download,
  Users,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPortalReport } from "@/app/(dashboard)/patient-portal/action";
import type {
  PortalFilters,
  PortalReportRow,
  MrSpecialist,
} from "@/app/(dashboard)/patient-portal/types";

const MONTH_OPTIONS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

interface PortalReportModalProps {
  /** Snapshot of the page's filters at the moment the modal opened.
   *  Used as the initial value for the modal's internal filter state.
   *  Stable across modal renders — only changes when modal is re-opened. */
  initialFilters: PortalFilters | null;
  onClose: () => void;
  /** Called when the user clicks a specialist row — should set the
   *  page-level specialist filter and close the modal. null = unassigned. */
  onDrillIn: (specialistId: number | null) => void;
  /** Specialists list to populate the modal's specialist dropdown.
   *  Comes from PortalPageData.specialists. */
  specialists: MrSpecialist[];
  /** Years to populate the modal's year dropdown. Mirrors the main page's
   *  availableYears (derived from data.availableMonths YYYY-MM values). */
  availableYears: string[];
}

/** Format a count safely (never `NaN` or `undefined`). */
function fmt(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString() : "0";
}

function SpecialistChip({
  name,
  color,
  active,
}: {
  name: string | null;
  color: string | null;
  active: boolean | null;
}) {
  if (!name) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground italic">
        <Users size={11} /> (Unassigned)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full border border-black/10 shrink-0"
        style={{ backgroundColor: color ?? "#9CA3AF" }}
      />
      <span className={cn(active === false && "text-muted-foreground italic")}>
        {name}
        {active === false ? " (inactive)" : ""}
      </span>
    </span>
  );
}

export function PortalReportModal({
  initialFilters,
  onClose,
  onDrillIn,
  specialists,
  availableYears,
}: PortalReportModalProps) {
  const [localFilters, setLocalFilters] = useState<PortalFilters | null>(null);
  const [rows, setRows] = useState<PortalReportRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync localFilters from initialFilters when the modal opens / re-opens.
  // We only reset when the initialFilters REFERENCE changes — the parent
  // takes a snapshot at open time, so identity equality is the right signal.
  // Without this gate, every page re-render would wipe modal-internal edits.
  useEffect(() => {
    setLocalFilters(initialFilters ? { ...initialFilters } : null);
  }, [initialFilters]);

  // Fetch whenever localFilters changes. The cancelled flag prevents a stale
  // request from late-arriving and overwriting newer state when the user
  // changes filters quickly.
  useEffect(() => {
    if (!localFilters) {
      setRows(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPortalReport(localFilters)
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load report");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [localFilters]);

  const totals = useMemo(() => {
    const acc = { total: 0, got_mr: 0, pending_mr: 0, portal_set: 0, approved: 0 };
    if (!rows) return acc;
    for (const r of rows) {
      acc.total += r.total;
      acc.got_mr += r.got_mr;
      acc.pending_mr += r.pending_mr;
      acc.portal_set += r.portal_set;
      acc.approved += r.approved;
    }
    return acc;
  }, [rows]);

  if (!initialFilters || !localFilters) return null;

  const patchFilter = (patch: Partial<PortalFilters>) => {
    setLocalFilters((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const refetch = () => {
    if (!localFilters) return;
    // Trigger the effect by handing it a new object reference.
    setLocalFilters({ ...localFilters });
  };

  const resetToPageFilters = () => {
    setLocalFilters({ ...initialFilters });
  };

  const exportCsv = () => {
    if (!rows) return;
    const header = ["Specialist", "Total", "Got MR", "Pending MR", "Portal Set", "Approved by TL"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const name = r.specialist_name
        ? `"${r.specialist_name.replace(/"/g, '""')}"${r.specialist_active === false ? " (inactive)" : ""}`
        : "(Unassigned)";
      lines.push(
        [name, r.total, r.got_mr, r.pending_mr, r.portal_set, r.approved].join(","),
      );
    }
    lines.push(
      [
        '"TOTAL"',
        totals.total,
        totals.got_mr,
        totals.pending_mr,
        totals.portal_set,
        totals.approved,
      ].join(","),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patient-portal-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-xl border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 size={16} className="text-sky-600 dark:text-sky-400" />
            Patient Portal Report — by MR Specialist
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={refetch}
              disabled={loading}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border font-semibold transition-colors bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800 dark:hover:bg-sky-950/50"
              title="Refresh report"
            >
              <RefreshCw size={11} className={cn(loading && "animate-spin")} />
              {loading ? "Loading…" : "Refresh"}
            </button>
            <button
              onClick={exportCsv}
              disabled={!rows || loading}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              title="Download CSV"
            >
              <Download size={11} />
              CSV
            </button>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="ml-1 p-1 rounded-md hover:bg-muted"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Filter bar — modal-local state, does NOT touch page filters. */}
        <div className="border-b bg-muted/20 px-5 py-3 flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
            Filters
          </span>

          {/* Specialist */}
          <select
            value={localFilters.specialist ?? ""}
            onChange={(e) => patchFilter({ specialist: e.target.value })}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
            title="Narrow the report to one specialist (or unassigned)"
          >
            <option value="">All Specialists</option>
            <option value="unassigned">— Unassigned —</option>
            {specialists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Month */}
          <select
            value={localFilters.month ?? ""}
            onChange={(e) => patchFilter({ month: e.target.value })}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
          >
            <option value="">All Months</option>
            {MONTH_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {/* Year */}
          <select
            value={localFilters.year ?? ""}
            onChange={(e) => patchFilter({ year: e.target.value })}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
          >
            <option value="">All Years</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          {/* Date — same single-day picker pattern as the main page. */}
          <input
            type="date"
            value={localFilters.date_from ?? ""}
            onChange={(e) =>
              patchFilter({
                date_preset: e.target.value ? "specific" : "",
                date_from: e.target.value,
                date_to: "",
              })
            }
            aria-label="Filter by date created"
            title="Filter entries created on this date"
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
          />

          {/* Reset — restores filters to the page's snapshot taken at open. */}
          <button
            onClick={resetToPageFilters}
            title="Reset modal filters to the values the page had when this modal opened"
            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground font-medium transition-colors ml-auto"
          >
            <RotateCcw size={11} />
            Reset
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded px-3 py-2 mb-3">
              {error}
            </p>
          )}

          {!rows && loading && (
            <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
              <RefreshCw size={14} className="animate-spin mr-2" /> Loading
              report…
            </div>
          )}

          {rows && rows.length === 0 && !loading && (
            <div className="text-center py-10 text-xs text-muted-foreground">
              No entries match the current filters.
            </div>
          )}

          {rows && rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-3 py-2">Specialist</th>
                    <th className="text-right px-3 py-2">Total</th>
                    <th className="text-right px-3 py-2 text-emerald-700 dark:text-emerald-400">
                      Got MR ✓
                    </th>
                    <th className="text-right px-3 py-2 text-amber-700 dark:text-amber-400">
                      Pending
                    </th>
                    <th className="text-right px-3 py-2">Portal Set</th>
                    <th className="text-right px-3 py-2 text-sky-700 dark:text-sky-400">
                      Appr. TL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.specialist_id ?? "unassigned"}
                      onClick={() => onDrillIn(r.specialist_id)}
                      className="border-t border-border/50 cursor-pointer hover:bg-muted/40 transition-colors"
                      title="Click to filter the main table to this specialist"
                    >
                      <td className="px-3 py-2">
                        <SpecialistChip
                          name={r.specialist_name}
                          color={r.specialist_color}
                          active={r.specialist_active}
                        />
                      </td>
                      <td className="text-right px-3 py-2 font-semibold">
                        {fmt(r.total)}
                      </td>
                      <td className="text-right px-3 py-2 text-emerald-700 dark:text-emerald-400 font-semibold">
                        {fmt(r.got_mr)}
                      </td>
                      <td className="text-right px-3 py-2 text-amber-700 dark:text-amber-400 font-semibold">
                        {fmt(r.pending_mr)}
                      </td>
                      <td className="text-right px-3 py-2">{fmt(r.portal_set)}</td>
                      <td className="text-right px-3 py-2 text-sky-700 dark:text-sky-400 font-semibold">
                        {fmt(r.approved)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 font-bold border-t-2 border-border">
                  <tr>
                    <td className="px-3 py-2 text-[11px] uppercase tracking-wider">
                      Total
                    </td>
                    <td className="text-right px-3 py-2">{fmt(totals.total)}</td>
                    <td className="text-right px-3 py-2 text-emerald-700 dark:text-emerald-400">
                      {fmt(totals.got_mr)}
                    </td>
                    <td className="text-right px-3 py-2 text-amber-700 dark:text-amber-400">
                      {fmt(totals.pending_mr)}
                    </td>
                    <td className="text-right px-3 py-2">{fmt(totals.portal_set)}</td>
                    <td className="text-right px-3 py-2 text-sky-700 dark:text-sky-400">
                      {fmt(totals.approved)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t bg-muted/30 px-5 py-2.5 text-[10px] text-muted-foreground shrink-0">
          Filters here only affect this modal — the main page is unchanged.
          Click any specialist row to filter the main table and close the
          report.
        </div>
      </div>
    </div>
  );
}

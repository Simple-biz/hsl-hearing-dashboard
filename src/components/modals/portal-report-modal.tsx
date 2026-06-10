"use client";

import { useEffect, useState, useMemo } from "react";
import { X, BarChart3, RefreshCw, Download, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPortalReport } from "@/app/(dashboard)/patient-portal/action";
import type {
  PortalFilters,
  PortalReportRow,
} from "@/app/(dashboard)/patient-portal/types";

interface PortalReportModalProps {
  /** When non-null, modal is open and report is fetched with these filters. */
  filters: PortalFilters | null;
  onClose: () => void;
  /** Called when the user clicks a specialist row — should set the
   *  page-level specialist filter and close the modal. null = unassigned. */
  onDrillIn: (specialistId: number | null) => void;
}

/** Format a count safely (never `NaN` or `undefined`). */
function fmt(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString() : "0";
}

/** Convert a specialist bg_color (hex like "#A78BFA" or null) to a small
 *  swatch + soft pill — mirrors how the main table renders the chip. */
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
  filters,
  onClose,
  onDrillIn,
}: PortalReportModalProps) {
  const [rows, setRows] = useState<PortalReportRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch on open + whenever the filter snapshot changes. We pass a fresh
  // PortalFilters object each open, so identity-equality on the filters
  // ref is enough to detect "filters changed since last fetch."
  useEffect(() => {
    if (!filters) {
      setRows(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPortalReport(filters)
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
  }, [filters]);

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

  if (!filters) return null;

  const refetch = () => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPortalReport(filters)
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

  // Indicates whether any non-specialist filter is currently restricting the
  // result set — informs the "filtered view" hint at the top of the modal.
  const hasActiveFilters =
    !!filters.search ||
    !!filters.mr_status ||
    !!filters.month ||
    !!filters.year ||
    (!!filters.date_preset && filters.date_preset !== "");

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

        {/* Filter hint */}
        {hasActiveFilters && (
          <div className="px-5 py-2 text-[11px] bg-amber-50 text-amber-800 border-b border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50">
            Counts reflect the filters currently applied to the main page
            (search / status / dates). The specialist filter is intentionally
            ignored so all specialists appear.
          </div>
        )}

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
          Click any specialist row to filter the main table to that specialist
          and close the report.
        </div>
      </div>
    </div>
  );
}

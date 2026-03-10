"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Download, Grid3x3, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RepStatusRow } from "@/app/(dashboard)/reports/action";

// Status columns (exclude the "rep" label column and "Total")
const STATUS_COLS = [
  "Continued",
  "Dismissal",
  "Favorable",
  "Good Cause",
  "OTR",
  "Pending",
  "Post HRG",
  "Scheduled",
  "Unfavorable",
  "Withdrawal",
] as const;

type StatusCol = (typeof STATUS_COLS)[number];

interface ReportMatrixModalProps {
  open: boolean;
  onClose: () => void;
  repStatusRows: RepStatusRow[];
}

/** Returns a Tailwind bg + text class pair based on heat ratio 0–1 */
function heatStyle(value: number, max: number): React.CSSProperties {
  if (max === 0 || value === 0) return {};
  const ratio = value / max;
  if (ratio <= 0.1)  return { backgroundColor: "rgba(59,130,246,0.10)", color: "#374151" };
  if (ratio <= 0.25) return { backgroundColor: "rgba(59,130,246,0.20)", color: "#1d4ed8" };
  if (ratio <= 0.5)  return { backgroundColor: "rgba(59,130,246,0.35)", color: "#1d4ed8", fontWeight: 600 };
  if (ratio <= 0.75) return { backgroundColor: "rgba(59,130,246,0.52)", color: "#1e3a8a", fontWeight: 700 };
  return { backgroundColor: "rgba(59,130,246,0.72)", color: "#ffffff", fontWeight: 700 };
}

function exportCsv(rows: RepStatusRow[]) {
  const header = ["Representative", ...STATUS_COLS, "Total"];
  const body   = rows.map((r) => [
    r.rep,
    ...STATUS_COLS.map((c) => r[c as keyof RepStatusRow] ?? 0),
    r.Total,
  ]);
  // Column totals row
  const totals = STATUS_COLS.map((c) =>
    rows.reduce((s, r) => s + ((r[c as keyof RepStatusRow] as number) || 0), 0)
  );
  const grandTotal = rows.reduce((s, r) => s + r.Total, 0);

  const allRows = [header, ...body, ["Grand Total", ...totals, grandTotal]];
  const csv = allRows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `rep-status-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

export function ReportMatrixModal({
  open,
  onClose,
  repStatusRows,
}: ReportMatrixModalProps) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Reset search when modal opens
  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const rows = q
      ? repStatusRows.filter((r) => r.rep.toLowerCase().includes(q))
      : repStatusRows;
    return [...rows].sort((a, b) => a.rep.localeCompare(b.rep));
  }, [repStatusRows, search]);

  // Max value across ALL rows (not just filtered) so heatmap scale is stable
  const maxValue = useMemo(() => {
    let m = 0;
    for (const row of repStatusRows) {
      for (const col of STATUS_COLS) {
        const v = row[col as keyof RepStatusRow] as number;
        if (v > m) m = v;
      }
    }
    return m;
  }, [repStatusRows]);

  // Column totals (filtered)
  const colTotals = useMemo(() =>
    Object.fromEntries(
      STATUS_COLS.map((c) => [
        c,
        filtered.reduce((s, r) => s + ((r[c as keyof RepStatusRow] as number) || 0), 0),
      ])
    ),
    [filtered]
  );
  const grandTotal = filtered.reduce((s, r) => s + r.Total, 0);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* XL modal — up to 95vw */}
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-[1400px] max-h-[88vh] flex flex-col overflow-hidden border border-border">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-blue-600 flex-shrink-0 gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-white">
            <Grid3x3 size={18} />
            <h2 className="text-sm font-semibold">
              Representative × Status Matrix
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search representative…"
                className="pl-7 pr-3 py-1.5 rounded-md bg-white/90 text-slate-800 placeholder-slate-400 text-xs focus:outline-none focus:ring-2 focus:ring-white/50 w-52"
              />
            </div>
            {search && (
              <span className="text-xs text-white/80 whitespace-nowrap">
                {filtered.length} of {repStatusRows.length} reps
              </span>
            )}
            <button
              type="button"
              onClick={() => exportCsv(repStatusRows)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white text-blue-600 text-xs font-semibold hover:bg-blue-50 transition-colors"
            >
              <Download size={11} />
              Export CSV
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-md text-white/80 hover:bg-white/20 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="overflow-auto flex-1">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              {search
                ? `No representatives match "${search}".`
                : "No data available."}
            </p>
          ) : (
            <table className="w-full text-xs border-separate border-spacing-0">
              {/* ── Table head ── */}
              <thead className="sticky top-0 z-20">
                {/* Row 1: group headers */}
                <tr>
                  <th
                    className="sticky left-0 z-30 px-3 py-2.5 text-left font-semibold text-muted-foreground bg-muted border-b border-r border-border min-w-[180px]"
                    rowSpan={2}
                  >
                    Representative
                  </th>
                  <th
                    colSpan={STATUS_COLS.length}
                    className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground bg-muted border-b border-border"
                  >
                    Hearing Decision Status
                  </th>
                  <th
                    className="px-3 py-2.5 text-center font-semibold text-amber-700 bg-amber-50 border-b border-l-2 border-amber-300 min-w-[60px] whitespace-nowrap"
                    rowSpan={2}
                  >
                    Total
                  </th>
                </tr>
                {/* Row 2: individual status columns */}
                <tr>
                  {STATUS_COLS.map((col) => (
                    <th
                      key={col}
                      title={col}
                      className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted border-b border-border whitespace-nowrap min-w-[52px]"
                    >
                      {col.length > 9 ? col.slice(0, 9) + "…" : col}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* ── Table body ── */}
              <tbody>
                {filtered.map((row, i) => (
                  <tr
                    key={row.rep}
                    className={cn(
                      "border-b border-border/50 hover:bg-blue-50/40 transition-colors",
                      i % 2 === 0 ? "bg-card" : "bg-muted/20"
                    )}
                  >
                    {/* Sticky rep name */}
                    <td className="sticky left-0 z-10 px-3 py-2.5 font-semibold text-foreground bg-inherit border-r border-border whitespace-nowrap">
                      {row.rep}
                    </td>

                    {/* Status cells with heatmap */}
                    {STATUS_COLS.map((col) => {
                      const val = (row[col as keyof RepStatusRow] as number) || 0;
                      const style = heatStyle(val, maxValue);
                      return (
                        <td
                          key={col}
                          className="px-2 py-2.5 text-center tabular-nums"
                          style={style}
                        >
                          {val === 0 ? (
                            <span className="text-muted-foreground/40">—</span>
                          ) : (
                            val
                          )}
                        </td>
                      );
                    })}

                    {/* Total */}
                    <td className="px-3 py-2.5 text-center font-bold text-amber-700 bg-amber-50 border-l-2 border-amber-200 tabular-nums">
                      {row.Total}
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* ── Sticky footer totals ── */}
              <tfoot className="sticky bottom-0 z-20">
                <tr className="bg-gradient-to-r from-blue-50 to-indigo-50 border-t-2 border-blue-300">
                  <td className="sticky left-0 z-30 px-3 py-3 font-bold text-foreground bg-blue-50 border-r border-blue-200 whitespace-nowrap">
                    Grand Total
                    {search && (
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                        (filtered)
                      </span>
                    )}
                  </td>
                  {STATUS_COLS.map((col) => (
                    <td
                      key={col}
                      className="px-2 py-3 text-center font-bold text-foreground tabular-nums"
                    >
                      {(colTotals[col] ?? 0) > 0 ? colTotals[col] : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center font-bold text-amber-700 bg-amber-100 border-l-2 border-amber-300 tabular-nums">
                    {grandTotal}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

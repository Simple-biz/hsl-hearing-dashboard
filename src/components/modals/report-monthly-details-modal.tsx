"use client";

import { useEffect } from "react";
import { X, Download, Calendar } from "lucide-react";
import type { MonthlyTrend } from "@/app/(dashboard)/reports/action";

interface ReportMonthlyDetailsModalProps {
  open: boolean;
  onClose: () => void;
  monthly: MonthlyTrend[];
}

function exportCsv(monthly: MonthlyTrend[]) {
  const rows = [
    ["Month", "Total Hearings", "Favorable", "Unfavorable"],
    ...monthly.map((m) => [m.month, m.count, m.favorable, m.unfavorable]),
    [
      "Grand Total",
      monthly.reduce((s, m) => s + m.count, 0),
      monthly.reduce((s, m) => s + m.favorable, 0),
      monthly.reduce((s, m) => s + m.unfavorable, 0),
    ],
  ];
  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `monthly-hearings-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

export function ReportMonthlyDetailsModal({
  open,
  onClose,
  monthly,
}: ReportMonthlyDetailsModalProps) {
  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const grandTotal   = monthly.reduce((s, m) => s + m.count, 0);
  const grandFav     = monthly.reduce((s, m) => s + m.favorable, 0);
  const grandUnfav   = monthly.reduce((s, m) => s + m.unfavorable, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden border border-border">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-blue-600 flex-shrink-0">
          <div className="flex items-center gap-2 text-white">
            <Calendar size={18} />
            <h2 className="text-sm font-semibold">Monthly Hearing Schedule</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportCsv(monthly)}
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
        <div className="overflow-y-auto flex-1">
          {monthly.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              No data available.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground bg-muted border-b border-border">
                    Month
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-white bg-slate-600 border-b border-border">
                    # of HRGs
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-emerald-700 bg-emerald-50 border-b border-border">
                    Favorable
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-red-600 bg-red-50 border-b border-border">
                    Unfavorable
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m, i) => (
                  <tr
                    key={m.month}
                    className={i % 2 === 0 ? "bg-card" : "bg-muted/30"}
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {m.month}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-foreground tabular-nums">
                      {m.count.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-emerald-600 font-semibold tabular-nums">
                      {m.favorable.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-red-500 font-semibold tabular-nums">
                      {m.unfavorable.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0">
                <tr className="bg-gradient-to-r from-blue-50 to-indigo-50 border-t-2 border-blue-300">
                  <td className="px-4 py-3 font-bold text-foreground">
                    Grand Total
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-foreground tabular-nums">
                    {grandTotal.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-600 tabular-nums">
                    {grandFav.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-red-500 tabular-nums">
                    {grandUnfav.toLocaleString()}
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

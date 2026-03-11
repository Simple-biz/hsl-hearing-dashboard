"use client";

import { useEffect } from "react";
import { X, Download, PieChart } from "lucide-react";
import type { HearingStatus } from "@/app/(dashboard)/reports/action";

interface ReportStatusSummaryModalProps {
  open: boolean;
  onClose: () => void;
  hearingStatus: HearingStatus[];
}

function exportCsv(hearingStatus: HearingStatus[], total: number) {
  const rows = [
    ["Status", "Count", "Percentage"],
    ...hearingStatus.map((s) => [
      s.status,
      s.count,
      `${((s.count / total) * 100).toFixed(1)}%`,
    ]),
    ["Total", total, "100%"],
  ];
  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `status-summary-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

export function ReportStatusSummaryModal({
  open,
  onClose,
  hearingStatus,
}: ReportStatusSummaryModalProps) {
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

  if (!open) return null;

  const total = hearingStatus.reduce((s, h) => s + h.count, 0);
  const sorted = [...hearingStatus].sort((a, b) => b.count - a.count);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden border border-border">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-blue-600 flex-shrink-0">
          <div className="flex items-center gap-2 text-white">
            <PieChart size={18} />
            <h2 className="text-sm font-semibold">Hearing Status Summary</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportCsv(hearingStatus, total)}
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
          {hearingStatus.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              No data available.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground bg-muted border-b border-border">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground bg-muted border-b border-border">
                    Count
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground bg-muted border-b border-border">
                    Percentage
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item, i) => {
                  const pct = total > 0
                    ? ((item.count / total) * 100).toFixed(1)
                    : "0.0";
                  return (
                    <tr
                      key={item.status}
                      className={i % 2 === 0 ? "bg-card" : "bg-muted/30"}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-foreground font-medium">
                            {item.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-foreground tabular-nums">
                        {item.count.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {/* Mini bar + percentage */}
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: item.color,
                              }}
                            />
                          </div>
                          <span className="text-muted-foreground w-10 text-right">
                            {pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0">
                <tr className="bg-gradient-to-r from-blue-50 to-indigo-50 border-t-2 border-blue-300">
                  <td className="px-4 py-3 font-bold text-foreground">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-foreground tabular-nums">
                    {total.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-foreground">
                    100%
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

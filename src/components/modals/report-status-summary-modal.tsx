"use client";

import { Download, PieChart } from "lucide-react";
import { ModalShell } from "@/components/modals/modal-shell";
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
  if (!open) return null;

  const total  = hearingStatus.reduce((s, h) => s + h.count, 0);
  const sorted = [...hearingStatus].sort((a, b) => b.count - a.count);

  return (
    <ModalShell
      title="Hearing Status Summary"
      icon={PieChart}
      onClose={onClose}
      actions={
        <button
          type="button"
          onClick={() => exportCsv(hearingStatus, total)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
        >
          <Download size={11} /> Export CSV
        </button>
      }
    >
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
              const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : "0.0";
              return (
                <tr key={item.status} className={i % 2 === 0 ? "bg-card" : "bg-muted/30"}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-foreground font-medium">{item.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-foreground tabular-nums">
                    {item.count.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: item.color }}
                        />
                      </div>
                      <span className="text-muted-foreground w-10 text-right">{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0">
            <tr className="bg-muted border-t-2 border-border">
              <td className="px-4 py-3 font-bold text-foreground">Total</td>
              <td className="px-4 py-3 text-right font-bold text-foreground tabular-nums">
                {total.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right font-bold text-foreground">100%</td>
            </tr>
          </tfoot>
        </table>
      )}
    </ModalShell>
  );
}

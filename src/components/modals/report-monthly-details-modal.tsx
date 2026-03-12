"use client";

import { Download, Calendar } from "lucide-react";
import { ModalShell } from "@/components/modals/modal-shell";
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
  if (!open) return null;

  const grandTotal = monthly.reduce((s, m) => s + m.count, 0);
  const grandFav   = monthly.reduce((s, m) => s + m.favorable, 0);
  const grandUnfav = monthly.reduce((s, m) => s + m.unfavorable, 0);

  return (
    <ModalShell
      title="Monthly Hearing Schedule"
      icon={Calendar}
      onClose={onClose}
      actions={
        <button
          type="button"
          onClick={() => exportCsv(monthly)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
        >
          <Download size={11} /> Export CSV
        </button>
      }
    >
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
              <th className="px-4 py-3 text-right font-semibold text-foreground bg-muted border-b border-border">
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
              <tr key={m.month} className={i % 2 === 0 ? "bg-card" : "bg-muted/30"}>
                <td className="px-4 py-2.5 font-medium text-foreground">{m.month}</td>
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
            <tr className="bg-linear-to-r from-muted to-muted/50 border-t-2 border-border">
              <td className="px-4 py-3 font-bold text-foreground">Grand Total</td>
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
    </ModalShell>
  );
}

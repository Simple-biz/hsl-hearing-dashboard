"use client";

import { useEffect, useState } from "react";
import { X, Download, Users, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssignedRep } from "@/app/(dashboard)/reports/action";

interface ReportAssignedCasesModalProps {
  open: boolean;
  onClose: () => void;
  assignedReps: AssignedRep[];
}

type SortKey = "name" | "hearings";
type SortDir = "asc" | "desc";

function exportCsv(reps: AssignedRep[]) {
  const rows = [
    ["Representative", "Hearings", "% of Total"],
    ...reps.map((r) => {
      const total = reps.reduce((s, x) => s + x.hearings, 0);
      return [
        r.name,
        r.hearings,
        `${((r.hearings / (total || 1)) * 100).toFixed(1)}%`,
      ];
    }),
    [
      "Grand Total",
      reps.reduce((s, r) => s + r.hearings, 0),
      "100%",
    ],
  ];
  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `assigned-cases-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function SortIcon({ col, sortKey, dir }: { col: SortKey; sortKey: SortKey; dir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown size={11} className="opacity-40" />;
  return dir === "asc"
    ? <ArrowUp   size={11} className="text-white" />
    : <ArrowDown size={11} className="text-white" />;
}

export function ReportAssignedCasesModal({
  open,
  onClose,
  assignedReps,
}: ReportAssignedCasesModalProps) {
  const [sortKey, setSortKey] = useState<SortKey>("hearings");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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

  const grandTotal = assignedReps.reduce((s, r) => s + r.hearings, 0);
  const maxHearings = Math.max(1, ...assignedReps.map((r) => r.hearings));

  const sorted = [...assignedReps].sort((a, b) => {
    const va = sortKey === "name" ? a.name : a.hearings;
    const vb = sortKey === "name" ? b.name : b.hearings;
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "hearings" ? "desc" : "asc");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden border border-border">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-blue-600 flex-shrink-0">
          <div className="flex items-center gap-2 text-white">
            <Users size={18} />
            <h2 className="text-sm font-semibold">
              Assigned Cases by Representative
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportCsv(assignedReps)}
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

        {/* ── Summary bar ────────────────────────────────────────────────── */}
        <div className="px-5 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center gap-4 text-xs text-blue-800 flex-shrink-0">
          <span>
            <span className="font-semibold">{assignedReps.length}</span>{" "}
            representatives
          </span>
          <span>
            <span className="font-semibold">
              {grandTotal.toLocaleString()}
            </span>{" "}
            total hearings
          </span>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1">
          {assignedReps.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              No data available.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr>
                  {/* Representative col */}
                  <th
                    className="px-4 py-3 text-left font-semibold bg-muted border-b border-border cursor-pointer select-none hover:bg-muted/80"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      Representative
                      <SortIcon col="name" sortKey={sortKey} dir={sortDir} />
                    </div>
                  </th>
                  {/* Hearings col */}
                  <th
                    className="px-4 py-3 text-right font-semibold bg-slate-600 border-b border-border cursor-pointer select-none hover:bg-slate-500 text-white"
                    onClick={() => handleSort("hearings")}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      # of Assigned HRGs
                      <SortIcon col="hearings" sortKey={sortKey} dir={sortDir} />
                    </div>
                  </th>
                  {/* Share col */}
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground bg-muted border-b border-border">
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((rep, i) => {
                  const pct = grandTotal > 0
                    ? ((rep.hearings / grandTotal) * 100).toFixed(1)
                    : "0.0";
                  return (
                    <tr
                      key={rep.name}
                      className={cn(
                        "border-b border-border/50 hover:bg-muted/40 transition-colors",
                        i % 2 === 0 ? "bg-card" : "bg-muted/20"
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {/* Colour avatar */}
                          <div
                            className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          >
                            {rep.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              {rep.name}
                            </p>
                            {/* Mini bar */}
                            <div className="mt-1 w-32 h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{
                                  width: `${(rep.hearings / maxHearings) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-foreground tabular-nums">
                        {rep.hearings.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                        {pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0">
                <tr className="bg-gradient-to-r from-blue-50 to-indigo-50 border-t-2 border-blue-300">
                  <td className="px-4 py-3 font-bold text-foreground">
                    Grand Total
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-foreground tabular-nums">
                    {grandTotal.toLocaleString()}
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

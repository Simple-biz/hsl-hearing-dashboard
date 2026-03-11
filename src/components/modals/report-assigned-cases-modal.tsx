"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { X, Download, Users, ChevronDown, ChevronRight, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssignedRep, MonthlyTrend } from "@/app/(dashboard)/reports/action";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthEntry {
  month_code: string; // e.g. "25-12"
  month_name: string; // e.g. "December 2025"
  count: number;
}

interface RepWithMonths {
  name: string;
  total: number;
  months: MonthEntry[];
}

// ─── Derive per-month data from existing stub data ────────────────────────────
//
// Since the server action only provides aggregate rep totals, we synthesise
// per-month rows on the client from the monthly trend data.  When the DB
// query is live, replace this with real per-rep-per-month rows from the server.
//
function deriveRepMonthly(
  assignedReps: AssignedRep[],
  monthly: MonthlyTrend[]
): RepWithMonths[] {
  if (assignedReps.length === 0) return [];

  // Parse "Jan '25" → sortable key + display label
  const MONTH_ABBR: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04",
    May: "05", Jun: "06", Jul: "07", Aug: "08",
    Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const MONTH_FULL: Record<string, string> = {
    Jan: "January",  Feb: "February",  Mar: "March",     Apr: "April",
    May: "May",      Jun: "June",      Jul: "July",       Aug: "August",
    Sep: "September",Oct: "October",   Nov: "November",  Dec: "December",
  };

  // Parse month labels from the trend data
  const parsedMonths = monthly
    .map((m) => {
      const match = m.month.match(/^(\w{3})\s+'(\d{2})/);
      if (!match) return null;
      const [, abbr, yr] = match;
      const mm = MONTH_ABBR[abbr] ?? "01";
      return {
        raw: m.month,
        code: `${yr}-${mm}`,
        label: `${MONTH_FULL[abbr] ?? abbr} 20${yr}`,
        total: m.count,
      };
    })
    .filter(Boolean) as { raw: string; code: string; label: string; total: number }[];

  const totalHearings = assignedReps.reduce((s, r) => s + r.hearings, 0) || 1;

  return assignedReps.map((rep) => {
    const repShare = rep.hearings / totalHearings;

    // Distribute rep's hearings proportionally across months that have data
    // Use Math.round and adjust the last bucket so the total matches exactly.
    let runningTotal = 0;
    const months: MonthEntry[] = parsedMonths.map((m, i) => {
      const isLast = i === parsedMonths.length - 1;
      const count  = isLast
        ? rep.hearings - runningTotal
        : Math.round(m.total * repShare);
      runningTotal += count;
      return { month_code: m.code, month_name: m.label, count };
    }).filter((m) => m.count > 0); // hide zero-count months

    return { name: rep.name, total: rep.hearings, months };
  });
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCsv(reps: RepWithMonths[]) {
  const rows: (string | number)[][] = [
    ["Representative", "Month Code", "Month", "# of Assigned HRGs"],
  ];
  for (const rep of reps) {
    for (const m of rep.months) {
      rows.push([rep.name, m.month_code, m.month_name, m.count]);
    }
    rows.push([`${rep.name} Total`, "", "", rep.total]);
  }
  rows.push(["Grand Total", "", "", reps.reduce((s, r) => s + r.total, 0)]);

  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `assigned-cases-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ReportAssignedCasesModalProps {
  open: boolean;
  onClose: () => void;
  assignedReps: AssignedRep[];
  monthly: MonthlyTrend[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ReportAssignedCasesModal({
  open,
  onClose,
  assignedReps,
  monthly,
}: ReportAssignedCasesModalProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const repData = useMemo(
    () => deriveRepMonthly(assignedReps, monthly),
    [assignedReps, monthly]
  );

  // Start fully expanded
  useEffect(() => { if (open) setCollapsed(new Set()); }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const toggle = useCallback((name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }, []);

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(repData.map((r) => r.name)));

  if (!open) return null;

  const sorted = [...repData].sort((a, b) => a.name.localeCompare(b.name));
  const grandTotal = sorted.reduce((s, r) => s + r.total, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-xl max-h-[88vh] flex flex-col overflow-hidden border border-border">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-blue-600 flex-shrink-0 gap-2">
          <div className="flex items-center gap-2 text-white">
            <Users size={18} />
            <h2 className="text-sm font-semibold">Assigned Cases by Representative</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={expandAll}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/15 text-white text-xs font-medium hover:bg-white/25 transition-colors border border-white/20"
            >
              <Plus size={11} /> Expand All
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/15 text-white text-xs font-medium hover:bg-white/25 transition-colors border border-white/20"
            >
              <Minus size={11} /> Collapse All
            </button>
            <button
              type="button"
              onClick={() => exportCsv(sorted)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white text-blue-600 text-xs font-semibold hover:bg-blue-50 transition-colors"
            >
              <Download size={11} /> Export CSV
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
          {sorted.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">No data available.</p>
          ) : (
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground bg-muted border-b border-border w-[40%]">
                    Representative
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground bg-muted border-b border-border w-[35%]">
                    Month
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-white bg-slate-600 border-b border-border whitespace-nowrap w-[25%]">
                    # of Assigned HRGs
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((rep) => {
                  const isCollapsed = collapsed.has(rep.name);
                  const hasMultiple = rep.months.length > 1;

                  return (
                    <React.Fragment key={rep.name}>
                      {/* Rep header row */}
                      <tr
                        key={`hdr-${rep.name}`}
                        className={cn(
                          "border-b border-border/40 bg-muted/50 transition-colors",
                          hasMultiple && "cursor-pointer hover:bg-muted/80"
                        )}
                        onClick={hasMultiple ? () => toggle(rep.name) : undefined}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {hasMultiple ? (
                              <span className="flex items-center justify-center w-5 h-5 rounded bg-primary text-primary-foreground flex-shrink-0">
                                {isCollapsed
                                  ? <ChevronRight size={12} />
                                  : <ChevronDown  size={12} />
                                }
                              </span>
                            ) : (
                              <span className="w-5 h-5 flex-shrink-0" />
                            )}
                            <span className="font-semibold text-foreground">{rep.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-[11px]">
                          {hasMultiple
                            ? `${rep.months.length} months`
                            : (
                              <span className="flex items-center gap-2">
                                <MonthCodeBadge code={rep.months[0]?.month_code ?? ""} />
                                {rep.months[0]?.month_name}
                              </span>
                            )
                          }
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-foreground tabular-nums">
                          {rep.total.toLocaleString()}
                        </td>
                      </tr>

                      {/* Month detail rows */}
                      {hasMultiple && !isCollapsed && rep.months.map((m) => (
                        <tr
                          key={`${rep.name}-${m.month_code}`}
                          className="border-b border-border/30 bg-card hover:bg-blue-50/30 transition-colors"
                        >
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2 pl-11">
                            <span className="flex items-center gap-2">
                              <MonthCodeBadge code={m.month_code} />
                              <span className="text-foreground/80">{m.month_name}</span>
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-foreground">
                            {m.count.toLocaleString()}
                          </td>
                        </tr>
                      ))}

                      {/* Rep subtotal (multi-month expanded only) */}
                      {hasMultiple && !isCollapsed && (
                        <tr
                          key={`sub-${rep.name}`}
                          className="border-b border-border bg-slate-100/70"
                        >
                          <td className="px-4 py-2 font-semibold text-foreground/80 text-[11px]">
                            {rep.name} Total
                          </td>
                          <td />
                          <td className="px-4 py-2 text-right font-bold text-foreground tabular-nums">
                            {rep.total.toLocaleString()}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0">
                <tr className="bg-gradient-to-r from-blue-50 to-indigo-50 border-t-2 border-blue-300">
                  <td className="px-4 py-3 font-bold text-foreground" colSpan={2}>Grand Total</td>
                  <td className="px-4 py-3 text-right font-bold text-foreground tabular-nums">
                    {grandTotal.toLocaleString()}
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

function MonthCodeBadge({ code }: { code: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 font-mono text-[10px] text-slate-600 whitespace-nowrap">
      {code}
    </span>
  );
}

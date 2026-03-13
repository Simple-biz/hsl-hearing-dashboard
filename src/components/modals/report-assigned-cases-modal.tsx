"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  Download,
  Users,
  ChevronDown,
  ChevronRight,
  Minus,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ModalShell } from "@/components/modals/modal-shell";
import type {
  AssignedRep,
  MonthlyTrend,
} from "@/app/(dashboard)/reports/action";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthEntry {
  month_code: string;
  month_name: string;
  count: number;
}

interface RepWithMonths {
  name: string;
  total: number;
  months: MonthEntry[];
  isWithdrawal?: boolean;
}

// ─── Derive per-month data ────────────────────────────────────────────────────

function deriveRepMonthly(
  assignedReps: AssignedRep[],
  monthly: MonthlyTrend[],
  withdrawalTotal: number,
): RepWithMonths[] {
  if (assignedReps.length === 0 && withdrawalTotal === 0) return [];

  const MONTH_ABBR: Record<string, string> = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  const MONTH_FULL: Record<string, string> = {
    Jan: "January",
    Feb: "February",
    Mar: "March",
    Apr: "April",
    May: "May",
    Jun: "June",
    Jul: "July",
    Aug: "August",
    Sep: "September",
    Oct: "October",
    Nov: "November",
    Dec: "December",
  };

  const parsedMonths = monthly
    .map((m) => {
      const match = m.month.match(/^(\w{3})\s+'(\d{2})/);
      if (!match) return null;
      const [, abbr, yr] = match;
      return {
        code: `${yr}-${MONTH_ABBR[abbr] ?? "01"}`,
        label: `${MONTH_FULL[abbr] ?? abbr} 20${yr}`,
        total: m.count,
      };
    })
    .filter(Boolean) as { code: string; label: string; total: number }[];

  const totalHearings = assignedReps.reduce((s, r) => s + r.hearings, 0) || 1;

  const repRows: RepWithMonths[] = assignedReps.map((rep) => {
    const repShare = rep.hearings / totalHearings;
    let runningTotal = 0;
    const months: MonthEntry[] = parsedMonths
      .map((m, i) => {
        const isLast = i === parsedMonths.length - 1;
        const count = isLast
          ? rep.hearings - runningTotal
          : Math.round(m.total * repShare);
        runningTotal += count;
        return { month_code: m.code, month_name: m.label, count };
      })
      .filter((m) => m.count > 0);
    return { name: rep.name, total: rep.hearings, months };
  });

  if (withdrawalTotal > 0) {
    const wdShare = withdrawalTotal / (totalHearings + withdrawalTotal);
    let runningTotal = 0;
    const wdMonths: MonthEntry[] = parsedMonths
      .map((m, i) => {
        const isLast = i === parsedMonths.length - 1;
        const count = isLast
          ? withdrawalTotal - runningTotal
          : Math.round(m.total * wdShare);
        runningTotal += count;
        return { month_code: m.code, month_name: m.label, count };
      })
      .filter((m) => m.count > 0);
    repRows.push({
      name: "WITHDRAWAL",
      total: withdrawalTotal,
      months: wdMonths,
      isWithdrawal: true,
    });
  }

  return repRows;
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCsv(reps: RepWithMonths[]) {
  const rows: (string | number)[][] = [
    ["Representative", "Month Code", "Month", "# of Assigned HRGs"],
  ];
  for (const rep of reps) {
    for (const m of rep.months)
      rows.push([rep.name, m.month_code, m.month_name, m.count]);
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
  withdrawalTotal: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReportAssignedCasesModal({
  open,
  onClose,
  assignedReps,
  monthly,
  withdrawalTotal,
}: ReportAssignedCasesModalProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const repData = useMemo(
    () => deriveRepMonthly(assignedReps, monthly, withdrawalTotal),
    [assignedReps, monthly, withdrawalTotal],
  );

  const toggle = useCallback((name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(repData.map((r) => r.name)));

  if (!open) return null;

  const namedReps = [...repData.filter((r) => !r.isWithdrawal)].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const withdrawal = repData.find((r) => r.isWithdrawal);
  const sorted = withdrawal ? [...namedReps, withdrawal] : namedReps;
  const grandTotal = sorted.reduce((s, r) => s + r.total, 0);

  return (
    <ModalShell
      title="Assigned Cases by Representative"
      icon={Users}
      onClose={onClose}
      maxWidth="max-w-2xl"
      actions={
        <>
          <button
            type="button"
            onClick={expandAll}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors bg-blue-600 hover:bg-blue-700 text-white active:scale-95"
          >
            <Plus size={11} /> Expand All
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600 active:scale-95"
          >
            <Minus size={11} /> Collapse All
          </button>
          <button
            type="button"
            onClick={() => exportCsv(sorted)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors active:scale-95"
          >
            <Download size={11} /> Export CSV
          </button>
        </>
      }
    >
      {sorted.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">
          No data available.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-90">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted dark:bg-zinc-800">
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground border border-border w-[42%]">
                  Representative
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground border border-border w-[38%]">
                  Month
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground border border-border whitespace-nowrap w-[20%]">
                  # of Assigned HRGs
                </th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((rep) => {
                const isCollapsed = collapsed.has(rep.name);
                const hasMultiple = rep.months.length > 1;
                const isWithdrawal = rep.isWithdrawal === true;

                return (
                  <React.Fragment key={rep.name}>
                    {/* Rep summary row */}
                    <tr
                      className={cn(
                        "transition-colors",
                        isWithdrawal
                          ? "bg-rose-50/60 hover:bg-rose-50 dark:bg-rose-950/30 dark:hover:bg-rose-950/50"
                          : "bg-muted/50 hover:bg-muted/80 dark:bg-zinc-800/50 dark:hover:bg-zinc-800",
                        hasMultiple && "cursor-pointer",
                      )}
                      onClick={hasMultiple ? () => toggle(rep.name) : undefined}
                    >
                      <td className="px-4 py-2.5 border border-border">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          {hasMultiple ? (
                            <span
                              className={cn(
                                "flex items-center justify-center w-5 h-5 rounded shrink-0",
                                isWithdrawal
                                  ? "bg-rose-400 text-white dark:bg-rose-500 dark:text-white"
                                  : "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-800",
                              )}
                            >
                              {isCollapsed ? (
                                <ChevronRight size={11} />
                              ) : (
                                <ChevronDown size={11} />
                              )}
                            </span>
                          ) : (
                            <span className="w-5 h-5 shrink-0" />
                          )}
                          <span
                            className={cn(
                              "font-semibold truncate",
                              isWithdrawal
                                ? "text-rose-600 dark:text-rose-400 tracking-wide"
                                : "text-foreground",
                            )}
                          >
                            {rep.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 border border-border text-muted-foreground">
                        {hasMultiple ? (
                          <span className="text-[11px]">
                            {rep.months.length} months
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <MonthCodeBadge
                              code={rep.months[0]?.month_code ?? ""}
                              withdrawal={isWithdrawal}
                            />
                            <span className="whitespace-nowrap">
                              {rep.months[0]?.month_name}
                            </span>
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2.5 border border-border text-right font-bold tabular-nums",
                          isWithdrawal
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-foreground",
                        )}
                      >
                        {rep.total.toLocaleString()}
                      </td>
                    </tr>

                    {/* Month detail rows */}
                    {hasMultiple &&
                      !isCollapsed &&
                      rep.months.map((m) => (
                        <tr
                          key={`${rep.name}-${m.month_code}`}
                          className={cn(
                            "transition-colors",
                            isWithdrawal
                              ? "bg-rose-50/30 hover:bg-rose-50/60 dark:bg-rose-950/20 dark:hover:bg-rose-950/40"
                              : "bg-card hover:bg-muted/30 dark:bg-zinc-900 dark:hover:bg-zinc-800/50",
                          )}
                        >
                          <td className="py-2 border border-border" />
                          <td className="px-4 py-2 border border-border">
                            <span className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                              <MonthCodeBadge
                                code={m.month_code}
                                withdrawal={isWithdrawal}
                              />
                              <span className="text-foreground/80 whitespace-nowrap">
                                {m.month_name}
                              </span>
                              <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide shrink-0">
                                Est.
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-2 border border-border text-right tabular-nums text-foreground">
                            {m.count.toLocaleString()}
                          </td>
                        </tr>
                      ))}

                    {/* Rep subtotal row */}
                    {hasMultiple && !isCollapsed && (
                      <tr
                        className={cn(
                          "border-b-2 border-border",
                          isWithdrawal
                            ? "bg-rose-100/50 dark:bg-rose-950/40"
                            : "bg-muted/40 dark:bg-zinc-800/40",
                        )}
                      >
                        <td
                          className="px-4 py-2 font-semibold text-foreground/70 text-[11px] border border-border"
                          colSpan={2}
                        >
                          {rep.name} Total
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2 text-right font-bold tabular-nums border border-border",
                            isWithdrawal
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-foreground",
                          )}
                        >
                          {rep.total.toLocaleString()}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>

            <tfoot className="sticky bottom-0">
              <tr className="bg-muted dark:bg-zinc-800">
                <td
                  className="px-4 py-3 font-bold text-foreground text-xs border border-border"
                  colSpan={2}
                >
                  Grand Total
                </td>
                <td className="px-4 py-3 text-right font-bold text-foreground tabular-nums text-xs border border-border">
                  {grandTotal.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ModalShell>
  );
}

// ─── Month code badge ─────────────────────────────────────────────────────────

function MonthCodeBadge({
  code,
  withdrawal,
}: {
  code: string;
  withdrawal?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[10px] whitespace-nowrap shrink-0",
        withdrawal
          ? "bg-rose-100 border border-rose-200 text-rose-500 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-400"
          : "bg-muted border border-border text-muted-foreground",
      )}
    >
      {code}
    </span>
  );
}

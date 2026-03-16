"use client";

import { useState, useEffect, useTransition } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { ModalShell } from "@/components/modals/modal-shell";
import { getTeamStats } from "@/app/(dashboard)/medical-records/action";
import type { MonthlyTeamStat } from "@/app/(dashboard)/medical-records/action";

interface Props {
  open: boolean;
  onClose: () => void;
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

const TEAM_COLOUR_MAP: Record<string, string> = {
  blue: "#3b82f6", orange: "#f97316", green: "#22c55e",
  yellow: "#eab308", purple: "#a855f7", red: "#ef4444",
};

function teamHex(color: string | null | undefined): string {
  if (!color) return "#9ca3af";
  return TEAM_COLOUR_MAP[color] ?? color;
}

// ─── PeriodBlock ──────────────────────────────────────────────────────────────

function PeriodBlock({ stat }: { stat: MonthlyTeamStat }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors select-none border-b border-border"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-2.5 font-semibold text-sm text-foreground">
          <span
            className="inline-block w-4 text-[10px] text-muted-foreground mr-1 transition-transform"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0)" }}
          >▶</span>
          {stat.label}
        </td>
        <td className="px-3 py-2.5 text-center text-xs font-bold text-foreground">{stat.totals.total}</td>
        <td className="px-3 py-2.5 text-center text-xs font-semibold text-white bg-purple-700">{stat.totals.complete}</td>
        <td className="px-3 py-2.5 text-center text-xs font-semibold bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300">{stat.totals.in_progress}</td>
        <td className="px-3 py-2.5 text-center text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">{stat.totals.ready}</td>
        <td className="px-3 py-2.5 text-center text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">{stat.totals.not_started}</td>
        <td className="px-3 py-2.5 text-center text-xs font-bold text-white bg-red-700">{stat.totals.urgent}</td>
      </tr>

      {expanded && stat.teams.map((t, i) => (
        <tr key={i} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
          <td className="px-6 py-2 text-xs text-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: teamHex(t.team_color) }} />
              {t.team_name}
            </span>
          </td>
          <td className="px-3 py-2 text-center text-xs font-semibold text-foreground">{t.total_cases}</td>
          <td className="px-3 py-2 text-center text-xs text-white bg-purple-700/70">{t.complete}</td>
          <td className="px-3 py-2 text-center text-xs bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300">{t.in_progress}</td>
          <td className="px-3 py-2 text-center text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">{t.ready}</td>
          <td className="px-3 py-2 text-center text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">{t.not_started}</td>
          <td className="px-3 py-2 text-center text-xs text-white bg-red-600">{t.urgent}</td>
        </tr>
      ))}
    </>
  );
}

// ─── StatsTable ───────────────────────────────────────────────────────────────

function StatsTable({ stats }: { stats: MonthlyTeamStat[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted border-b border-border">
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-foreground">Period</th>
            <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide w-16 text-foreground">Total</th>
            <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide w-20 text-purple-600 dark:text-purple-400">Complete</th>
            <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide w-24 text-pink-600 dark:text-pink-400">In Progress</th>
            <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide w-16 text-green-600 dark:text-green-400">Ready</th>
            <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide w-24 text-red-600">Not Started</th>
            <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide w-16 text-red-700">Urgent</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s, i) => <PeriodBlock key={i} stat={s} />)}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function TeamStatsModal({ open, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [weekly,  setWeekly]  = useState<MonthlyTeamStat[]>([]);
  const [monthly, setMonthly] = useState<MonthlyTeamStat[]>([]);
  const [view, setView]       = useState<"weekly" | "monthly">("weekly");

  useEffect(() => {
    if (!open) return;
    startTransition(async () => {
      const d = await getTeamStats();
      setWeekly(d.weekly);
      setMonthly(d.monthly);
    });
  }, [open]);

  if (!open) return null;

  return (
    <ModalShell
      title="Team Stats"
      icon={BarChart3}
      onClose={onClose}
      maxWidth="max-w-4xl"
      layout="bare"
    >
      {/* Period toggle bar — flex-shrink-0 so it never scrolls away */}
      <div className="flex items-center gap-1 px-5 py-3 border-b border-border bg-muted/10 flex-shrink-0">
        <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
          {(["weekly", "monthly"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${
                view === v
                  ? "bg-card text-primary shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable table body */}
      <div className="flex-1 overflow-y-auto relative">
        {isPending ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        ) : (
          <StatsTable stats={view === "weekly" ? weekly : monthly} />
        )}
      </div>
    </ModalShell>
  );
}

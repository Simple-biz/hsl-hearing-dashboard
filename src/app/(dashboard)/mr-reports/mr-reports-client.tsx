"use client";

import {
  useMemo,
  useState,
  useTransition,
  useCallback,
  useRef,
  useEffect,
} from "react";
import type { Chart as ChartType } from "chart.js";
import { Card } from "@/components/ui/card";
import { StackedDeck } from "@/components/ui/stacked-deck";
import { AppHeader } from "@/components/layout/app-header";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserRole } from "@/lib/roles";
import type {
  TeamDecisionRow,
  TeamMrStatusRow,
  TeamMemberRow,
  WithdrawalRow,
} from "./action";
import { getMrReportsData } from "./action";

// ─── Shared chart styles ──────────────────────────────────────────────────────

const tooltipBase = {
  backgroundColor: "#fff",
  borderColor: "#e2e8f0",
  borderWidth: 1,
  titleColor: "#111827",
  bodyColor: "#6b7280",
  padding: 10,
  cornerRadius: 8,
} as const;

// ─── Colour maps ──────────────────────────────────────────────────────────────

const TEAM_HEX: Record<string, string> = {
  blue: "#3b82f6",
  orange: "#f97316",
  green: "#22c55e",
  yellow: "#eab308",
  purple: "#a855f7",
  red: "#ef4444",
  pink: "#ec4899",
  teal: "#14b8a6",
  indigo: "#6366f1",
  cyan: "#06b6d4",
};

/** Light tint for card backgrounds – 10 % opacity of the team colour */
const TEAM_BG: Record<string, string> = {
  blue: "rgba(59,130,246,0.10)",
  orange: "rgba(249,115,22,0.10)",
  green: "rgba(34,197,94,0.10)",
  yellow: "rgba(234,179,8,0.10)",
  purple: "rgba(168,85,247,0.10)",
  red: "rgba(239,68,68,0.10)",
  pink: "rgba(236,72,153,0.10)",
  teal: "rgba(20,184,166,0.10)",
  indigo: "rgba(99,102,241,0.10)",
  cyan: "rgba(6,182,212,0.10)",
};

function teamHex(color: string | null | undefined): string {
  if (!color) return "#9ca3af";
  return TEAM_HEX[color] ?? color;
}

function teamBg(color: string | null | undefined): string {
  if (!color) return "transparent";
  return TEAM_BG[color] ?? "transparent";
}

const DECISION_COLORS: Record<string, string> = {
  Scheduled: "#8b5cf6",
  Favorable: "#22c55e",
  Unfavorable: "#f97316",
  "Post HRG Review/ Dev": "#eab308",
  Continued: "#6b7280",
  "Pending Decision": "#f59e0b",
  "OTR at Hrg": "#16a34a",
  Dismissal: "#ef4444",
  "Good Cause": "#3b82f6",
};

const MR_STATUS_COLORS: Record<string, string> = {
  Complete: "#a855f7",
  "In Progress": "#ec4899",
  Ready: "#22c55e",
  "Not Started": "#ef4444",
  "URGENT! NEEDS ATTENTION": "#dc2626",
  Overpayment: "#f59e0b",
};

const DECISION_STATUSES = [
  "Continued",
  "Dismissal",
  "Favorable",
  "Good Cause",
  "OTR at Hrg",
  "Pending Decision",
  "Post HRG Review/ Dev",
  "Scheduled",
  "Unfavorable",
];

const MR_STATUSES = ["Complete", "In Progress", "Ready", "Not Started"];

// ─── Donut Chart ──────────────────────────────────────────────────────────────

function DonutChart({
  labels,
  data,
  colors,
}: {
  labels: string[];
  data: number[];
  colors: string[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<ChartType | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { Chart, registerables } = await import("chart.js");
      const { default: ChartDataLabels } =
        await import("chartjs-plugin-datalabels");
      Chart.register(...registerables, ChartDataLabels);
      if (cancelled || !canvasRef.current) return;
      chartRef.current?.destroy();
      chartRef.current = new Chart(canvasRef.current, {
        type: "doughnut",
        data: {
          labels,
          datasets: [
            {
              data,
              backgroundColor: colors,
              borderWidth: 2,
              borderColor: "#fff",
              hoverOffset: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "60%",
          plugins: {
            legend: { display: false },
            tooltip: tooltipBase,
            datalabels: { display: false },
          },
        },
      });
    })();
    return () => {
      cancelled = true;
      chartRef.current?.destroy();
    };
  }, [labels, data, colors]);

  return <canvas ref={canvasRef} />;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTeamMap<T extends { team_name: string }>(
  rows: T[],
  teamOrder: string[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const t of teamOrder) map.set(t, []);
  for (const r of rows) {
    if (!map.has(r.team_name)) map.set(r.team_name, []);
    map.get(r.team_name)!.push(r);
  }
  return map;
}

function pct(value: number, total: number): string {
  if (total === 0) return "0.0";
  return ((value / total) * 100).toFixed(1);
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  decisionByTeam: TeamDecisionRow[];
  mrStatusByTeam: TeamMrStatusRow[];
  withdrawalsByTeam: WithdrawalRow[];
  teamMembers: TeamMemberRow[];
  teamOrder: string[];
  initialMonth: string;
  userRole: UserRole;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export function MrReportsClient({
  decisionByTeam: initialDecisionByTeam,
  mrStatusByTeam: initialMrStatusByTeam,
  withdrawalsByTeam: initialWithdrawalsByTeam,
  teamMembers,
  teamOrder,
  initialMonth,
  userRole,
}: Props) {
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [isPending, startTransition] = useTransition();
  const [decisionByTeam, setDecisionByTeam] = useState(initialDecisionByTeam);
  const [mrStatusByTeam, setMrStatusByTeam] = useState(initialMrStatusByTeam);
  const [withdrawalsByTeam, setWithdrawalsByTeam] = useState(
    initialWithdrawalsByTeam,
  );

  // Generate month options: 12 months back + current month + "All Time"
  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
      });
      options.push({ value, label });
    }
    options.push({ value: "all", label: "All Time" });
    return options;
  }, []);

  const handleMonthChange = useCallback((month: string) => {
    setSelectedMonth(month);
    startTransition(async () => {
      const data = await getMrReportsData(month);
      setDecisionByTeam(data.decisionByTeam);
      setMrStatusByTeam(data.mrStatusByTeam);
      setWithdrawalsByTeam(data.withdrawalsByTeam);
    });
  }, []);
  // ── Build lookup maps ──────────────────────────────────────────────────────
  const decisionMap = useMemo(
    () => buildTeamMap(decisionByTeam, teamOrder),
    [decisionByTeam, teamOrder],
  );
  const mrStatusMap = useMemo(
    () => buildTeamMap(mrStatusByTeam, teamOrder),
    [mrStatusByTeam, teamOrder],
  );
  const withdrawalMap = useMemo(
    () => buildTeamMap(withdrawalsByTeam, teamOrder),
    [withdrawalsByTeam, teamOrder],
  );

  // ── Per-team aggregated counts ─────────────────────────────────────────────
  const teamDecisionData = useMemo(() => {
    const result: Record<
      string,
      { color: string | null; total: number; statuses: Record<string, number> }
    > = {};
    for (const [team, rows] of decisionMap) {
      const statuses: Record<string, number> = {};
      let total = 0;
      for (const r of rows) {
        const key = r.hearing_decision_status || "Scheduled";
        statuses[key] = (statuses[key] || 0) + r.cnt;
        total += r.cnt;
      }
      result[team] = { color: rows[0]?.team_color ?? null, total, statuses };
    }
    return result;
  }, [decisionMap]);

  const teamMrStatusData = useMemo(() => {
    const result: Record<
      string,
      { color: string | null; total: number; statuses: Record<string, number> }
    > = {};
    for (const [team, rows] of mrStatusMap) {
      const statuses: Record<string, number> = {};
      let total = 0;
      for (const r of rows) {
        const key =
          r.medical_record_status && r.medical_record_status !== ""
            ? r.medical_record_status
            : "Not Started";
        statuses[key] = (statuses[key] || 0) + r.cnt;
        total += r.cnt;
      }
      result[team] = { color: rows[0]?.team_color ?? null, total, statuses };
    }
    return result;
  }, [mrStatusMap]);

  const teamWithdrawalTotals = useMemo(() => {
    const result: Record<string, number> = {};
    for (const [team, rows] of withdrawalMap) {
      result[team] = rows.reduce((s, r) => s + r.cnt, 0);
    }
    return result;
  }, [withdrawalMap]);

  // ── Grand totals ───────────────────────────────────────────────────────────
  const grandDecisionTotal = Object.values(teamDecisionData).reduce(
    (s, d) => s + d.total,
    0,
  );
  const grandWithdrawalTotal = Object.values(teamWithdrawalTotals).reduce(
    (s, n) => s + n,
    0,
  );

  // ── Members by team ────────────────────────────────────────────────────────
  const membersByTeam = useMemo(() => {
    const map: Record<string, TeamMemberRow[]> = {};
    for (const m of teamMembers) {
      (map[m.team_name] ??= []).push(m);
    }
    return map;
  }, [teamMembers]);

  // =========================================================================
  return (
    <>
      <AppHeader title="MR Reports" subtitle="MR Pivot Charts & Analytics" />
      <div className="flex min-w-0 flex-col gap-4 p-3 sm:gap-5 sm:p-4 lg:p-6">
        <DashboardNav userRole={userRole} />

        {/* ══════════ Month Filter ══════════ */}
        <Card className="border-0 bg-linear-to-r from-amber-600 to-amber-700 dark:from-amber-700 dark:to-amber-800 shadow-md">
          <div className="flex items-center justify-between gap-4 px-5 py-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Hearing Decision Status
            </h2>
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-amber-100">
                Month:
              </label>
              <Select value={selectedMonth} onValueChange={handleMonthChange}>
                <SelectTrigger className="w-47.5 h-8 text-xs bg-white/90 dark:bg-white/10 border-amber-400/50 text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isPending && (
                <span className="text-xs text-amber-100 animate-pulse">
                  Loading…
                </span>
              )}
            </div>
          </div>
        </Card>

        <StackedDeck
          items={[
            {
              id: "decision-counts",
              title: "Decision Status — Counts",
              accent: "#f59e0b",
              content: (
        /* ══════════ SECTION 1: Decision Status Summary Table ══════════ */
        <Card className="overflow-x-auto shadow-sm">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-amber-600 dark:bg-amber-700 text-white">
                <th className="text-left px-3 py-2.5 font-semibold">MR Team</th>
                {DECISION_STATUSES.map((s) => (
                  <th
                    key={s}
                    className="text-center px-2 py-2.5 font-semibold whitespace-nowrap"
                  >
                    {s}
                  </th>
                ))}
                <th className="text-center px-2 py-2.5 font-semibold">
                  Withdrawals
                </th>
                <th className="text-center px-2 py-2.5 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {teamOrder.map((team, idx) => {
                const d = teamDecisionData[team];
                if (!d) return null;
                const wd = teamWithdrawalTotals[team] || 0;
                return (
                  <tr
                    key={team}
                    className={`border-b border-border/40 hover:bg-muted/40 transition-colors ${idx % 2 === 0 ? "bg-muted/20" : ""}`}
                  >
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">
                      <span
                        className="inline-block w-3 h-3 rounded-sm mr-2 align-middle shadow-sm"
                        style={{ backgroundColor: teamHex(d.color) }}
                      />
                      {team}
                    </td>
                    {DECISION_STATUSES.map((s) => (
                      <td
                        key={s}
                        className="text-center px-2 py-2 tabular-nums"
                      >
                        {d.statuses[s] || 0}
                      </td>
                    ))}
                    <td className="text-center px-2 py-2 tabular-nums font-medium text-red-600 dark:text-red-400">
                      {wd}
                    </td>
                    <td className="text-center px-2 py-2 tabular-nums font-bold">
                      {d.total + wd}
                    </td>
                  </tr>
                );
              })}
              {/* Grand total */}
              <tr className="border-t-2 border-amber-600/30 bg-amber-50 dark:bg-amber-900/20 font-bold">
                <td className="px-3 py-2.5">Grand Total</td>
                {DECISION_STATUSES.map((s) => (
                  <td key={s} className="text-center px-2 py-2.5 tabular-nums">
                    {Object.values(teamDecisionData).reduce(
                      (sum, d) => sum + (d.statuses[s] || 0),
                      0,
                    )}
                  </td>
                ))}
                <td className="text-center px-2 py-2.5 tabular-nums text-red-600 dark:text-red-400">
                  {grandWithdrawalTotal}
                </td>
                <td className="text-center px-2 py-2.5 tabular-nums">
                  {grandDecisionTotal + grandWithdrawalTotal}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
              ),
            },
            {
              id: "decision-pct",
              title: "Decision Status — Percentages",
              accent: "#f59e0b",
              content: (
        /* ══════════ SECTION 2: Percentage Table ══════════ */
        <Card className="overflow-x-auto shadow-sm">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-amber-600 dark:bg-amber-700 text-white">
                <th className="text-left px-3 py-2.5 font-semibold">MR Team</th>
                {DECISION_STATUSES.map((s) => (
                  <th
                    key={s}
                    className="text-center px-2 py-2.5 font-semibold whitespace-nowrap"
                  >
                    {s} %
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamOrder.map((team, idx) => {
                const d = teamDecisionData[team];
                if (!d) return null;
                return (
                  <tr
                    key={team}
                    className={`border-b border-border/40 hover:bg-muted/40 transition-colors ${idx % 2 === 0 ? "bg-muted/20" : ""}`}
                  >
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">
                      <span
                        className="inline-block w-3 h-3 rounded-sm mr-2 align-middle shadow-sm"
                        style={{ backgroundColor: teamHex(d.color) }}
                      />
                      {team}
                    </td>
                    {DECISION_STATUSES.map((s) => (
                      <td
                        key={s}
                        className="text-center px-2 py-2 tabular-nums"
                      >
                        {pct(d.statuses[s] || 0, d.total)}%
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
              ),
            },
            {
              id: "decision-pies",
              title: "Decision Status Distribution by Team",
              accent: "#f59e0b",
              content: (
        /* ══════════ SECTION 3: Decision Status Pie Charts ══════════ */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {teamOrder.map((team) => {
              const d = teamDecisionData[team];
              if (!d || d.total === 0) return null;
              const slices = Object.entries(d.statuses)
                .filter(([, v]) => v > 0)
                .sort(([, a], [, b]) => b - a);

              const labels = slices.map(([name]) => name);
              const series = slices.map(([, value]) => value);
              const colors = slices.map(
                ([name]) => DECISION_COLORS[name] || "#6b7280",
              );

              return (
                <Card
                  key={team}
                  className="overflow-hidden shadow-sm"
                  style={{ backgroundColor: teamBg(d.color) }}
                >
                  <div
                    className="px-4 py-2.5 flex items-center gap-2"
                    style={{ backgroundColor: teamHex(d.color) }}
                  >
                    <h3 className="text-sm font-bold text-white">{team}</h3>
                    <span className="text-xs text-white/80 font-normal ml-auto">
                      {d.total} cases
                    </span>
                  </div>
                  <div className="p-4 flex gap-4 items-center h-64">
                    <div className="w-48 h-48 shrink-0">
                      <DonutChart
                        labels={labels}
                        data={series}
                        colors={colors}
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto max-h-56 pr-2">
                      {slices.map(([name, value]) => (
                        <div
                          key={name}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{
                                backgroundColor:
                                  DECISION_COLORS[name] || "#6b7280",
                              }}
                            />
                            <span
                              className="text-[11px] text-muted-foreground truncate max-w-28"
                              title={name}
                            >
                              {name}
                            </span>
                          </div>
                          <span className="text-[11px] font-semibold text-foreground tabular-nums shrink-0">
                            {value} ({pct(value, d.total)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })}
        </div>
              ),
            },
            {
              id: "mr-status-stats",
              title: "Monthly Stats — Medical Record Status",
              accent: "#10b981",
              content: (
        /* ══════════ SECTION 4: Monthly Stats — MR Status ══════════ */
        <Card className="overflow-x-auto shadow-sm">
          <div className="bg-emerald-600 dark:bg-emerald-700 px-5 py-2.5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Monthly Stats &mdash; Medical Record Status
            </h2>
          </div>
          <div className="p-4">
            {/* Global summary */}
            <table className="w-full text-xs border-collapse mb-5">
              <thead>
                <tr className="bg-emerald-600 dark:bg-emerald-700 text-white">
                  <th className="text-left px-3 py-2 font-semibold">Status</th>
                  <th className="text-center px-3 py-2 font-semibold">Count</th>
                </tr>
              </thead>
              <tbody>
                {MR_STATUSES.map((status, idx) => {
                  const count = Object.values(teamMrStatusData).reduce(
                    (s, d) => s + (d.statuses[status] || 0),
                    0,
                  );
                  return (
                    <tr
                      key={status}
                      className={`border-b border-border/40 hover:bg-muted/40 transition-colors ${idx % 2 === 0 ? "bg-muted/20" : ""}`}
                    >
                      <td className="px-3 py-2 font-medium">
                        <span
                          className="inline-block w-3 h-3 rounded-sm mr-2 align-middle shadow-sm"
                          style={{
                            backgroundColor:
                              MR_STATUS_COLORS[status] || "#6b7280",
                          }}
                        />
                        {status}
                      </td>
                      <td className="text-center tabular-nums px-3 py-2 font-semibold">
                        {count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* per-team breakdown */}
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-emerald-600 dark:bg-emerald-700 text-white">
                  <th className="text-left px-3 py-2 font-semibold">MR Team</th>
                  {MR_STATUSES.map((s) => (
                    <th key={s} className="text-center px-2 py-2 font-semibold">
                      {s}
                    </th>
                  ))}
                  <th className="text-center px-2 py-2 font-semibold">
                    Withdrawn
                  </th>
                  <th className="text-center px-2 py-2 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {teamOrder.map((team, idx) => {
                  const d = teamMrStatusData[team];
                  if (!d) return null;
                  const wd = teamWithdrawalTotals[team] || 0;
                  return (
                    <tr
                      key={team}
                      className={`border-b border-border/40 hover:bg-muted/40 transition-colors ${idx % 2 === 0 ? "bg-muted/20" : ""}`}
                    >
                      <td className="px-3 py-2 font-semibold whitespace-nowrap">
                        <span
                          className="inline-block w-3 h-3 rounded-sm mr-2 align-middle shadow-sm"
                          style={{ backgroundColor: teamHex(d.color) }}
                        />
                        {team}
                      </td>
                      {MR_STATUSES.map((s) => (
                        <td
                          key={s}
                          className="text-center px-2 py-2 tabular-nums"
                        >
                          {d.statuses[s] || 0}
                        </td>
                      ))}
                      <td className="text-center px-2 py-2 tabular-nums font-medium text-red-600 dark:text-red-400">
                        {wd}
                      </td>
                      <td className="text-center px-2 py-2 tabular-nums font-bold">
                        {d.total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
              ),
            },
            {
              id: "mr-status-pies",
              title: "MR Status Distribution by Team",
              accent: "#10b981",
              content: (
        /* ══════════ SECTION 5: MR Status Pie Charts ══════════ */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {teamOrder.map((team) => {
              const d = teamMrStatusData[team];
              if (!d || d.total === 0) return null;
              const slices = MR_STATUSES.map((name) => ({
                name,
                value: d.statuses[name] || 0,
              })).filter((s) => s.value > 0);

              const labels = slices.map((s) => s.name);
              const series = slices.map((s) => s.value);
              const colors = slices.map(
                (s) => MR_STATUS_COLORS[s.name] || "#6b7280",
              );

              return (
                <Card
                  key={team}
                  className="overflow-hidden shadow-sm"
                  style={{ backgroundColor: teamBg(d.color) }}
                >
                  <div
                    className="px-4 py-2.5 flex items-center gap-2"
                    style={{ backgroundColor: teamHex(d.color) }}
                  >
                    <h3 className="text-sm font-bold text-white">{team}</h3>
                    <span className="text-xs text-white/80 font-normal ml-auto">
                      {d.total} cases
                    </span>
                  </div>
                  <div className="p-4 flex gap-4 items-center h-64">
                    <div className="w-48 h-48 shrink-0">
                      <DonutChart
                        labels={labels}
                        data={series}
                        colors={colors}
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto max-h-56 pr-2">
                      {slices.map((s) => (
                        <div
                          key={s.name}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{
                                backgroundColor:
                                  MR_STATUS_COLORS[s.name] || "#6b7280",
                              }}
                            />
                            <span
                              className="text-[11px] text-muted-foreground truncate max-w-28"
                              title={s.name}
                            >
                              {s.name}
                            </span>
                          </div>
                          <span className="text-[11px] font-semibold text-foreground tabular-nums shrink-0">
                            {s.value} ({pct(s.value, d.total)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })}
        </div>
              ),
            },
            {
              id: "team-roster",
              title: "Team Roster",
              accent: "#6366f1",
              content: (
        /* ══════════ SECTION 6: Team Members ══════════ */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {teamOrder.map((team) => {
              const members = membersByTeam[team];
              if (!members || members.length === 0) return null;
              const color = teamHex(members[0]?.team_color);
              const bg = teamBg(members[0]?.team_color);
              return (
                <Card
                  key={team}
                  className="overflow-hidden shadow-sm"
                  style={{ backgroundColor: bg }}
                >
                  <div
                    className="px-4 py-2 flex items-center justify-between"
                    style={{ backgroundColor: color }}
                  >
                    <h3 className="text-sm font-bold text-white">{team}</h3>
                    <span className="text-xs text-white/80">
                      {members.length}
                    </span>
                  </div>
                  <ul className="px-4 py-3 space-y-1 text-xs text-foreground">
                    {members.map((m, i) => (
                      <li key={i} className="py-0.5 flex items-center gap-1.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        {m.member_name}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
        </div>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}

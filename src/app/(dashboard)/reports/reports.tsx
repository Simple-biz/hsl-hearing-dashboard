"use client";

import { useEffect, useRef, useState } from "react";
import { Chart, registerables } from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { AppHeader } from "@/components/layout/app-header";
import {
  TrendingUp, PieChart as PieIcon, Users, Grid3x3,
  Download, Eye, RefreshCw, Filter, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  MonthlyTrend,
  HearingStatus,
  AssignedRep,
  RepStatusRow,
  StatCard,
} from "./action";

Chart.register(...registerables, ChartDataLabels);

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLS = ["rep", "Continued", "Dismissal", "Favorable", "Good Cause", "OTR", "Pending", "Post HRG", "Scheduled", "Unfavorable", "Withdrawal", "Total"];

// ─── Shared chart styles ──────────────────────────────────────────────────────

const tickStyle   = { color: "#94a3b8", font: { size: 11 } };
const tooltipBase = {
  backgroundColor: "#fff",
  borderColor: "#e2e8f0",
  borderWidth: 1,
  titleColor: "#111827",
  bodyColor: "#6b7280",
  padding: 10,
  cornerRadius: 8,
};

// ─── Charts ───────────────────────────────────────────────────────────────────

function MonthlyTrendChart({ monthly }: { monthly: MonthlyTrend[] }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      data: {
        labels: monthly.map((d) => d.month),
        datasets: [
          {
            type: "bar",
            label: "Total Hearings",
            data: monthly.map((d) => d.count),
            backgroundColor: "rgba(99,102,241,0.75)",
            borderWidth: 0,
            borderRadius: 3,
            order: 3,
          },
          {
            type: "line",
            label: "Favorable",
            data: monthly.map((d) => d.favorable),
            borderColor: "#22c55e",
            backgroundColor: "transparent",
            pointRadius: 3,
            pointBackgroundColor: "#22c55e",
            borderWidth: 2,
            tension: 0.3,
            order: 1,
          },
          {
            type: "line",
            label: "Unfavorable",
            data: monthly.map((d) => d.unfavorable),
            borderColor: "#f87171",
            backgroundColor: "transparent",
            pointRadius: 3,
            pointBackgroundColor: "#f87171",
            borderWidth: 2,
            tension: 0.3,
            order: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { ticks: { ...tickStyle, maxRotation: 45 }, grid: { color: "rgba(0,0,0,0.04)" } },
          y: { beginAtZero: true, ticks: tickStyle, grid: { color: "rgba(0,0,0,0.04)" } },
        },
        plugins: {
          legend: {
            position: "top",
            align: "start",
            labels: { color: "#6b7280", font: { size: 11 }, boxWidth: 10, boxHeight: 10, padding: 12 },
          },
          tooltip: tooltipBase,
          datalabels: {
            display: (ctx) => ctx.dataset.type === "bar",
            anchor: "end",
            align: "end",
            color: "#94a3b8",
            font: { size: 9 },
            formatter: (v) => v,
          },
        },
      },
      plugins: [ChartDataLabels],
    });
    return () => chartRef.current?.destroy();
  }, [monthly]);

  return <canvas ref={canvasRef} />;
}

function StatusDonutChart({ hearingStatus }: { hearingStatus: HearingStatus[] }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: {
        labels: hearingStatus.map((d) => d.status),
        datasets: [{
          data: hearingStatus.map((d) => d.count),
          backgroundColor: hearingStatus.map((d) => d.color),
          borderWidth: 2,
          borderColor: "#fff",
          hoverOffset: 6,
        }],
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
    return () => chartRef.current?.destroy();
  }, [hearingStatus]);

  return <canvas ref={canvasRef} />;
}

// ─── Reusable sub-components ──────────────────────────────────────────────────

function CardHeader({ icon: Icon, iconBg, iconColor, title, subtitle, children }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {children}
        <div className={cn("p-2 rounded-lg", iconBg)}>
          <Icon size={16} className={iconColor} />
        </div>
      </div>
    </div>
  );
}

function GhostBtn({ icon: Icon, label }) {
  return (
    <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border hover:bg-muted text-xs text-muted-foreground transition-colors">
      <Icon size={12} />
      {label}
    </button>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  monthly: MonthlyTrend[];
  hearingStatus: HearingStatus[];
  assignedReps: AssignedRep[];
  repStatusRows: RepStatusRow[];
  statCards: StatCard[];
}

// ─── Client Component ─────────────────────────────────────────────────────────

export function ReportsClient({
  monthly,
  hearingStatus,
  assignedReps,
  repStatusRows,
  statCards,
}: Props) {
  const maxHearings = Math.max(...assignedReps.map((r) => r.hearings));

  const [quickSel, setQuickSel] = useState("All Time");
  const [month,    setMonth]    = useState("All Months");
  const [rep,      setRep]      = useState("All Representatives");

  return (
    <>
      <AppHeader title="Reports" subtitle="Hearing analytics and performance metrics" />

      {/* ── Filter Bar ─────────────────────────────────────────── */}
      <div className="border-b border-border bg-card px-6 py-3">
        <div className="flex items-end gap-4 flex-wrap">

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Date Range</label>
            <div className="px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground min-w-[180px]">
              2002-04-07 to 2028-07-30
            </div>
          </div>

          {[
            { label: "Quick Select",   value: quickSel, set: setQuickSel, opts: ["All Time", "Last 30 Days", "Last 90 Days", "This Year"] },
            { label: "Month",          value: month,    set: setMonth,    opts: ["All Months", "January", "February", "March"] },
            { label: "Representative", value: rep,      set: setRep,      opts: ["All Representatives", "Sarah Johnson", "Michael Chen"] },
          ].map((f) => (
            <div key={f.label} className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">{f.label}</label>
              <div className="relative">
                <select
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {f.opts.map((o) => <option key={o}>{o}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          ))}

          <div className="flex items-end gap-2 ml-auto">
            <button className="flex items-center gap-2 px-4 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors">
              <Filter size={13} /> Apply Filters
            </button>
            <button className="flex items-center gap-2 px-4 py-1.5 border border-border hover:bg-muted rounded-lg text-sm text-muted-foreground transition-colors">
              <RefreshCw size={13} /> Reset
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">

        {/* ── Stat Cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-8 gap-3">
          {statCards.map((c) => (
            <div key={c.label} className={cn("rounded-xl p-4 text-white", c.bg)}>
              <p className="text-[10px] font-semibold tracking-widest uppercase opacity-80 mb-1">{c.label}</p>
              <p className="text-3xl font-bold tabular-nums leading-none">{c.value}</p>
            </div>
          ))}
          {/* Win Rate uses the standard card token */}
          <div className="rounded-xl p-4 bg-card border border-border">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mb-1">Win Rate</p>
            <p className="text-3xl font-bold tabular-nums text-foreground leading-none">45.9%</p>
            <p className="text-[10px] text-muted-foreground mt-1">Favorable / (Fav + Unfav)</p>
          </div>
        </div>

        {/* ── Three-panel row ────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">

          {/* Monthly Trend */}
          <div className="bg-card border border-border rounded-xl p-5">
            <CardHeader
              icon={TrendingUp} iconBg="bg-blue-50" iconColor="text-blue-600"
              title="Monthly Hearing Trend" subtitle="Volume + outcomes by month"
            >
              <GhostBtn icon={Eye}      label="View Details" />
              <GhostBtn icon={Download} label="Export"       />
            </CardHeader>
            <div className="h-64">
              <MonthlyTrendChart monthly={monthly} />
            </div>
          </div>

          {/* Assigned Cases */}
          <div className="bg-card border border-border rounded-xl p-5">
            <CardHeader
              icon={Users} iconBg="bg-emerald-50" iconColor="text-emerald-600"
              title="Assigned Cases" subtitle="Cases per representative"
            >
              <GhostBtn icon={Eye} label="View All" />
            </CardHeader>
            <div className="space-y-2 overflow-y-auto max-h-64">
              {assignedReps.map((r) => (
                <div key={r.name} className="group px-3 py-2 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-foreground">{r.name}</p>
                    <span className="text-xs tabular-nums text-muted-foreground">{r.hearings}</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all group-hover:bg-blue-600"
                      style={{ width: `${(r.hearings / maxHearings) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Status Distribution */}
          <div className="bg-card border border-border rounded-xl p-5">
            <CardHeader
              icon={PieIcon} iconBg="bg-purple-50" iconColor="text-purple-600"
              title="Status Distribution" subtitle="Outcome breakdown"
            >
              <GhostBtn icon={Eye} label="View Details" />
            </CardHeader>
            <div className="flex gap-5 items-center">
              <div className="w-56 h-56 flex-shrink-0">
                <StatusDonutChart hearingStatus={hearingStatus} />
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                {hearingStatus.map((d) => (
                  <div key={d.status} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: d.color }}
                      />
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {d.status}
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-foreground tabular-nums">
                      {d.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Rep × Status Matrix ────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Representative × Status Matrix</h3>
              <p className="text-xs text-muted-foreground">Full breakdown by outcome</p>
            </div>
            <div className="flex items-center gap-2">
              <GhostBtn icon={Eye}      label="View Details" />
              <GhostBtn icon={Download} label="Export CSV"   />
              <div className="p-2 rounded-lg bg-amber-50">
                <Grid3x3 size={16} className="text-amber-600" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                    Rep HRG Status
                  </th>
                  <th
                    colSpan={STATUS_COLS.length - 2}
                    className="px-3 py-1.5 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-widest"
                  >
                    Status
                  </th>
                  <th className="px-3 py-1.5 text-center text-[10px] font-semibold text-amber-600 uppercase tracking-widest">
                    Total
                  </th>
                </tr>
                <tr className="border-b border-border">
                  {STATUS_COLS.map((col) => (
                    <th
                      key={col}
                      className={cn(
                        "px-3 py-2 text-left text-[10px] font-semibold whitespace-nowrap uppercase tracking-wide",
                        col === "rep"   ? "text-foreground"       : "text-muted-foreground",
                        col === "Total" ? "text-amber-600 text-center" : "",
                      )}
                    >
                      {col === "rep" ? "Representative" : col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {repStatusRows.map((row) => (
                  <tr key={row.rep} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                    {STATUS_COLS.map((col) => {
                      const val     = row[col];
                      const isRep   = col === "rep";
                      const isTotal = col === "Total";
                      const isFav   = col === "Favorable"   && val > 0;
                      const isUnfav = col === "Unfavorable" && val > 0;
                      const isHigh  = !isRep && !isTotal && typeof val === "number" && val >= 50;
                      const isMed   = !isRep && !isTotal && typeof val === "number" && val >= 15 && val < 50;

                      return (
                        <td
                          key={col}
                          className={cn(
                            "px-3 py-2.5 tabular-nums",
                            isRep   && "font-medium text-foreground",
                            isTotal && "font-bold text-amber-600 text-center bg-amber-50",
                            isFav   && "text-emerald-600 font-semibold",
                            isUnfav && "text-red-500 font-semibold",
                            isHigh  && !isFav && !isUnfav && "text-blue-600 font-semibold",
                            isMed   && !isFav && !isUnfav && "text-foreground/80",
                            !isRep && !isTotal && !isFav && !isUnfav && !isHigh && !isMed && "text-muted-foreground",
                            val === 0 && !isRep && "text-muted-foreground/40",
                          )}
                        >
                          {val === 0 && !isRep ? "—" : val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

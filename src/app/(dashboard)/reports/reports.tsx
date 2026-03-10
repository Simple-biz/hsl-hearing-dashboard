"use client";

import { useEffect, useRef, useState, useTransition, useCallback, forwardRef, useImperativeHandle } from "react";
import { Chart, registerables } from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { AppHeader } from "@/components/layout/app-header";
import {
  TrendingUp,
  PieChart as PieIcon,
  Users,
  Grid3x3,
  Download,
  Eye,
  RefreshCw,
  Filter,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getReportsData } from "./action";
import type {
  MonthlyTrend,
  HearingStatus,
  AssignedRep,
  RepStatusRow,
  StatCard,
  ReportsData,
  ReportsFilters,
} from "./action";
import { ReportMonthlyDetailsModal  } from "@/components/modals/report-monthly-details-modal";
import { ReportStatusSummaryModal   } from "@/components/modals/report-status-summary-modal";
import { ReportAssignedCasesModal   } from "@/components/modals/report-assigned-cases-modal";
import { ReportMatrixModal          } from "@/components/modals/report-matrix-modal";

Chart.register(...registerables, ChartDataLabels);

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLS = [
  "rep",
  "Continued",
  "Dismissal",
  "Favorable",
  "Good Cause",
  "OTR",
  "Pending",
  "Post HRG",
  "Scheduled",
  "Unfavorable",
  "Withdrawal",
  "Total",
] as const;

const QUICK_SELECT_OPTIONS = [
  "All Time",
  "Last 30 Days",
  "Last 90 Days",
  "This Year",
] as const;

const EMPTY_FILTERS: ReportsFilters = {
  quickSelect: "",
  month: "",
  rep: "",
};

// ─── Shared chart styles ──────────────────────────────────────────────────────

const tickStyle = { color: "#94a3b8", font: { size: 11 } } as const;
const tooltipBase = {
  backgroundColor: "#fff",
  borderColor: "#e2e8f0",
  borderWidth: 1,
  titleColor: "#111827",
  bodyColor: "#6b7280",
  padding: 10,
  cornerRadius: 8,
} as const;

// ─── Charts ───────────────────────────────────────────────────────────────────

export interface MonthlyTrendChartHandle {
  exportChart: () => void;
}

const MonthlyTrendChart = forwardRef<MonthlyTrendChartHandle, { monthly: MonthlyTrend[] }>(
  function MonthlyTrendChart({ monthly }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef  = useRef<Chart | null>(null);

  useImperativeHandle(ref, () => ({
    exportChart() {
      const chart = chartRef.current;
      if (!chart) return;
      const link     = document.createElement("a");
      link.download  = `monthly-trend-${new Date().toISOString().slice(0, 10)}.png`;
      link.href      = chart.toBase64Image();
      link.click();
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    chartRef.current?.destroy();

    chartRef.current = new Chart(canvas, {
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
          x: {
            ticks: { ...tickStyle, maxRotation: 45 },
            grid: { color: "rgba(0,0,0,0.04)" },
          },
          y: {
            beginAtZero: true,
            ticks: tickStyle,
            grid: { color: "rgba(0,0,0,0.04)" },
          },
        },
        plugins: {
          legend: {
            position: "top",
            align: "start",
            labels: {
              color: "#6b7280",
              font: { size: 11 },
              boxWidth: 10,
              boxHeight: 10,
              padding: 12,
            },
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

    return () => {
      chartRef.current?.destroy();
    };
  }, [monthly]);

  return <canvas ref={canvasRef} />;
});

function StatusDonutChart({ hearingStatus }: { hearingStatus: HearingStatus[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef  = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    chartRef.current?.destroy();

    chartRef.current = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: hearingStatus.map((d) => d.status),
        datasets: [
          {
            data: hearingStatus.map((d) => d.count),
            backgroundColor: hearingStatus.map((d) => d.color),
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

    return () => {
      chartRef.current?.destroy();
    };
  }, [hearingStatus]);

  return <canvas ref={canvasRef} />;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CardHeaderProps {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

function CardHeader({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  children,
}: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
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

interface GhostBtnProps {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
}

function GhostBtn({ icon: Icon, label, onClick }: GhostBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border hover:bg-muted text-xs text-muted-foreground transition-colors"
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
  disabled?: boolean;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: FilterSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="appearance-none pl-3 pr-8 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
      </div>
    </div>
  );
}

// ─── CSV export helper ────────────────────────────────────────────────────────

function exportRepMatrixCsv(repStatusRows: RepStatusRow[]) {
  const cols = STATUS_COLS.filter((c) => c !== "rep");
  const header = ["Representative", ...cols].join(",");
  const rows = repStatusRows.map((row) =>
    [
      `"${row.rep}"`,
      ...cols.map((c) =>
        String(row[c as keyof RepStatusRow] ?? 0)
      ),
    ].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `rep-status-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Win rate helper ──────────────────────────────────────────────────────────

function computeWinRate(statCards: StatCard[]): string {
  const parse = (label: string) => {
    const card = statCards.find((c) => c.label === label);
    return parseInt((card?.value ?? "0").replace(/,/g, ""), 10);
  };
  const fav   = parse("Favorable");
  const unfav = parse("Unfavorable");
  const denom = fav + unfav;
  if (denom === 0) return "—";
  return `${((fav / denom) * 100).toFixed(1)}%`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = Omit<ReportsData, never>; // all fields from ReportsData

// ─── Client Component ─────────────────────────────────────────────────────────

export function ReportsClient({
  monthly:       initialMonthly,
  hearingStatus: initialHearingStatus,
  assignedReps:  initialAssignedReps,
  repStatusRows: initialRepStatusRows,
  statCards:     initialStatCards,
  allMonths,
  allReps,
}: Props) {
  // ── Data state (updated on Apply / Reset) ──────────────────────────────────
  const [data, setData] = useState<ReportsData>({
    monthly:       initialMonthly,
    hearingStatus: initialHearingStatus,
    assignedReps:  initialAssignedReps,
    repStatusRows: initialRepStatusRows,
    statCards:     initialStatCards,
    allMonths,
    allReps,
  });

  // ── Pending filter state (what the user has selected but not yet applied) ──
  const [pending, setPending] = useState<ReportsFilters>(EMPTY_FILTERS);

  // ── Whether any filter is active (controls "active" indicator) ─────────────
  const [activeFilters, setActiveFilters] = useState<ReportsFilters>(EMPTY_FILTERS);

  const [isPending, startTransition] = useTransition();

  // ── Modal open state ────────────────────────────────────────────────────────
  const [monthlyModalOpen,  setMonthlyModalOpen]  = useState(false);
  const [statusModalOpen,   setStatusModalOpen]   = useState(false);
  const [assignedModalOpen, setAssignedModalOpen] = useState(false);
  const [matrixModalOpen,   setMatrixModalOpen]   = useState(false);

  // ── Monthly chart ref  ──────────────────────────────────────────────────────
  const monthlyChartRef = useRef<MonthlyTrendChartHandle>(null);

  const isFiltered =
    !!activeFilters.quickSelect ||
    !!activeFilters.month ||
    !!activeFilters.rep;

  // ── Derived values ──────────────────────────────────────────────────────────
  const maxHearings = Math.max(1, ...data.assignedReps.map((r) => r.hearings));
  const winRate     = computeWinRate(data.statCards);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleApply = useCallback(() => {
    startTransition(async () => {
      const result = await getReportsData(pending);
      setData(result);
      setActiveFilters(pending);
    });
  }, [pending]);

  const handleReset = useCallback(() => {
    setPending(EMPTY_FILTERS);
    startTransition(async () => {
      const result = await getReportsData({});
      setData(result);
      setActiveFilters(EMPTY_FILTERS);
    });
  }, []);

  const updatePending = useCallback(
    (key: keyof ReportsFilters, value: string) =>
      setPending((prev) => ({ ...prev, [key]: value })),
    []
  );

  return (
    <>
      <AppHeader
        title="Reports"
        subtitle="Hearing analytics and performance metrics"
      />

      {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
      <div className="border-b border-border bg-card px-6 py-3">
        <div className="flex items-end gap-4 flex-wrap">

          {/* Quick Select */}
          <FilterSelect
            label="Quick Select"
            value={pending.quickSelect ?? ""}
            onChange={(v) => updatePending("quickSelect", v)}
            options={QUICK_SELECT_OPTIONS}
            placeholder="All Time"
            disabled={isPending}
          />

          {/* Month — options derived from live data */}
          <FilterSelect
            label="Month"
            value={pending.month ?? ""}
            onChange={(v) => updatePending("month", v)}
            options={allMonths}
            placeholder="All Months"
            disabled={isPending}
          />

          {/* Representative — options derived from live data */}
          <FilterSelect
            label="Representative"
            value={pending.rep ?? ""}
            onChange={(v) => updatePending("rep", v)}
            options={allReps}
            placeholder="All Representatives"
            disabled={isPending}
          />

          {/* Active filter badge */}
          {isFiltered && (
            <div className="flex items-end pb-0.5">
              <span className="text-[10px] font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5">
                Filters active
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-end gap-2 ml-auto">
            <button
              type="button"
              onClick={handleApply}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Filter size={13} />
              )}
              Apply Filters
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-1.5 border border-border hover:bg-muted rounded-lg text-sm text-muted-foreground transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw size={13} className={isPending ? "animate-spin" : ""} />
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className={cn("p-6 space-y-4", isPending && "opacity-60 pointer-events-none")}>

        {/* ── Stat Cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-8 gap-3">
          {data.statCards.map((c) => (
            <div
              key={c.label}
              className={cn(
                "relative overflow-hidden rounded-xl p-4 text-white",
                c.bg
              )}
            >
              <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
              <div className="relative z-10">
                <p className="text-[10px] font-semibold tracking-widest uppercase opacity-80 mb-1">
                  {c.label}
                </p>
                <p className="text-3xl font-bold tabular-nums leading-none">
                  {c.value}
                </p>
              </div>
            </div>
          ))}

          {/* Win Rate — computed from live stat cards */}
          <div className="rounded-xl p-4 bg-card border border-border">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mb-1">
              Win Rate
            </p>
            <p className="text-3xl font-bold tabular-nums text-foreground leading-none">
              {winRate}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Favorable / (Fav + Unfav)
            </p>
          </div>
        </div>

        {/* ── Three-panel row ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">

          {/* Monthly Trend */}
          <div className="bg-card border border-border rounded-xl p-5">
            <CardHeader
              icon={TrendingUp}
              iconBg="bg-blue-50"
              iconColor="text-blue-600"
              title="Monthly Hearing Trend"
              subtitle="Volume + outcomes by month"
            >
              <GhostBtn icon={Eye}      label="View Details" onClick={() => setMonthlyModalOpen(true)}  />
              <GhostBtn icon={Download} label="Export"       onClick={() => monthlyChartRef.current?.exportChart()} />
            </CardHeader>
            <div className="h-64">
              <MonthlyTrendChart ref={monthlyChartRef} monthly={data.monthly} />
            </div>
          </div>

          {/* Assigned Cases */}
          <div className="bg-card border border-border rounded-xl p-5">
            <CardHeader
              icon={Users}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
              title="Assigned Cases"
              subtitle="Cases per representative"
            >
              <GhostBtn icon={Eye} label="View All" onClick={() => setAssignedModalOpen(true)} />
            </CardHeader>
            <div className="space-y-2 overflow-y-auto max-h-64">
              {data.assignedReps.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  No reps match the current filters.
                </p>
              ) : (
                data.assignedReps.map((r) => (
                  <div
                    key={r.name}
                    className="group px-3 py-2 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-foreground">
                        {r.name}
                      </p>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {r.hearings}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all group-hover:bg-blue-600"
                        style={{
                          width: `${(r.hearings / maxHearings) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Status Distribution */}
          <div className="bg-card border border-border rounded-xl p-5">
            <CardHeader
              icon={PieIcon}
              iconBg="bg-purple-50"
              iconColor="text-purple-600"
              title="Status Distribution"
              subtitle="Outcome breakdown"
            >
              <GhostBtn icon={Eye} label="View Details" onClick={() => setStatusModalOpen(true)} />
            </CardHeader>
            <div className="flex gap-5 items-center">
              <div className="w-56 h-56 flex-shrink-0">
                <StatusDonutChart hearingStatus={data.hearingStatus} />
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                {data.hearingStatus.map((d) => (
                  <div
                    key={d.status}
                    className="flex items-center justify-between gap-3"
                  >
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

        {/* ── Rep × Status Matrix ─────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Representative × Status Matrix
              </h3>
              <p className="text-xs text-muted-foreground">
                Full breakdown by outcome
              </p>
            </div>
            <div className="flex items-center gap-2">
              <GhostBtn icon={Eye}      label="View Details" onClick={() => setMatrixModalOpen(true)} />
              <GhostBtn
                icon={Download}
                label="Export CSV"
                onClick={() => exportRepMatrixCsv(data.repStatusRows)}
              />
              <div className="p-2 rounded-lg bg-amber-50">
                <Grid3x3 size={16} className="text-amber-600" />
              </div>
            </div>
          </div>

          {data.repStatusRows.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              No data matches the current filters.
            </p>
          ) : (
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
                          col === "rep"   ? "text-foreground"              : "text-muted-foreground",
                          col === "Total" ? "text-amber-600 text-center"   : ""
                        )}
                      >
                        {col === "rep" ? "Representative" : col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.repStatusRows.map((row) => (
                    <tr
                      key={row.rep}
                      className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                    >
                      {STATUS_COLS.map((col) => {
                        const val     = row[col as keyof RepStatusRow];
                        const isRep   = col === "rep";
                        const isTotal = col === "Total";
                        const numVal  = typeof val === "number" ? val : 0;
                        const isFav   = col === "Favorable"   && numVal > 0;
                        const isUnfav = col === "Unfavorable" && numVal > 0;
                        const isHigh  = !isRep && !isTotal && numVal >= 50;
                        const isMed   = !isRep && !isTotal && numVal >= 15 && numVal < 50;

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
                              numVal === 0 && !isRep && "text-muted-foreground/40"
                            )}
                          >
                            {numVal === 0 && !isRep ? "—" : val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      <ReportMonthlyDetailsModal
        open={monthlyModalOpen}
        onClose={() => setMonthlyModalOpen(false)}
        monthly={data.monthly}
      />
      <ReportStatusSummaryModal
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        hearingStatus={data.hearingStatus}
      />
      <ReportAssignedCasesModal
        open={assignedModalOpen}
        onClose={() => setAssignedModalOpen(false)}
        assignedReps={data.assignedReps}
        monthly={data.monthly}
      />
      <ReportMatrixModal
        open={matrixModalOpen}
        onClose={() => setMatrixModalOpen(false)}
        repStatusRows={data.repStatusRows}
      />
    </>
  );
}

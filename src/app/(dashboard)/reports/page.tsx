"use client";

import { AppHeader } from "@/components/layout/app-header";
// import { BarChart3, TrendingUp, PieChart, Calendar } from "lucide-react";
import { BarChart3, TrendingUp, PieChart } from "lucide-react";

import { cn } from "@/lib/utils";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Mock monthly hearing counts
const MONTHLY_DATA = [42, 38, 55, 47, 62, 51, 44, 58, 49, 63, 52, 41];
const maxVal = Math.max(...MONTHLY_DATA);

// Mock decision breakdown
const DECISION_DATA = [
  { label: "Fully Favorable", count: 142, color: "bg-emerald-500", pct: 38 },
  { label: "Partially Favorable", count: 67, color: "bg-teal-400", pct: 18 },
  { label: "Unfavorable", count: 89, color: "bg-red-400", pct: 24 },
  { label: "Dismissed", count: 31, color: "bg-amber-400", pct: 8 },
  { label: "Pending", count: 45, color: "bg-blue-400", pct: 12 },
];

// Mock rep performance
const REP_PERF = [
  { name: "Sarah Johnson", total: 68, favorable: 42, rate: 62 },
  { name: "Michael Chen", total: 55, favorable: 30, rate: 55 },
  { name: "Emily Rodriguez", total: 38, favorable: 24, rate: 63 },
  { name: "James Wilson", total: 29, favorable: 15, rate: 52 },
];

export default function ReportsPage() {
  return (
    <>
      <AppHeader
        title="Reports"
        subtitle="Hearing analytics and performance metrics"
      />

      <div className="p-6 space-y-4">
        {/* Row 1: Monthly trend + Decision breakdown */}
        <div className="grid grid-cols-3 gap-4">
          {/* Monthly Hearings */}
          <div className="col-span-2 bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Monthly Hearings
                </h3>
                <p className="text-xs text-muted-foreground">
                  2025 hearing volume by month
                </p>
              </div>
              <div className="p-2 rounded-lg bg-blue-50">
                <BarChart3 size={16} className="text-blue-600" />
              </div>
            </div>

            {/* Simple bar chart */}
            <div className="flex items-end gap-2 h-40">
              {MONTHLY_DATA.map((val, i) => (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {val}
                  </span>
                  <div
                    className="w-full bg-accent/80 rounded-t-sm transition-all hover:bg-accent"
                    style={{ height: `${(val / maxVal) * 100}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground/70">
                    {MONTHS[i]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Decision Breakdown */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Decisions
                </h3>
                <p className="text-xs text-muted-foreground">
                  Outcome breakdown
                </p>
              </div>
              <div className="p-2 rounded-lg bg-purple-50">
                <PieChart size={16} className="text-purple-600" />
              </div>
            </div>

            <div className="space-y-3">
              {DECISION_DATA.map((d) => (
                <div key={d.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-foreground/70">{d.label}</span>
                    <span className="text-foreground font-medium tabular-nums">
                      {d.count}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        d.color,
                      )}
                      style={{ width: `${d.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Rep performance */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Representative Performance
              </h3>
              <p className="text-xs text-muted-foreground">
                Hearing outcomes by representative
              </p>
            </div>
            <div className="p-2 rounded-lg bg-emerald-50">
              <TrendingUp size={16} className="text-emerald-600" />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {REP_PERF.map((rep) => (
              <div key={rep.name} className="bg-muted rounded-lg p-4">
                <p className="text-sm font-medium text-foreground truncate">
                  {rep.name}
                </p>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-3xl font-bold text-foreground tabular-nums">
                    {rep.rate}%
                  </span>
                  <span className="text-xs text-muted-foreground mb-1">
                    win rate
                  </span>
                </div>
                <div className="mt-2 w-full h-2 border rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      rep.rate >= 60
                        ? "bg-emerald-500"
                        : rep.rate >= 50
                          ? "bg-amber-500"
                          : "bg-red-400",
                    )}
                    style={{ width: `${rep.rate}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                  <span>{rep.favorable} favorable</span>
                  <span>{rep.total} total</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

"use client";

import {
  Calendar,
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Hearing, Representative } from "@/lib/database.types";

interface DashboardStatsProps {
  hearings: Hearing[];
  representatives: Representative[];
}

export default function DashboardStats({
  hearings,
  representatives,
}: DashboardStatsProps) {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  // Calculate stats
  const thisMonth = hearings.filter((h) => {
    const d = new Date(h.hearing_date + "T00:00:00");
    return (
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    );
  });

  const upcoming = hearings.filter((h) => h.hearing_date >= today);
  const unassigned = upcoming.filter(
    (h) => !h.assigned_rep_id && !h.assignment_status,
  );
  const pendingDecision = hearings.filter(
    (h) =>
      h.hearing_decision_status === "Pending" ||
      (!h.hearing_decision_status && h.hearing_date < today),
  );

  const favorable = hearings.filter(
    (h) =>
      h.hearing_decision_status === "Fully Favorable" ||
      h.hearing_decision_status === "Partially Favorable",
  );
  const withDecision = hearings.filter(
    (h) => h.hearing_decision_status && h.hearing_decision_status !== "Pending",
  );
  const winRate =
    withDecision.length > 0
      ? Math.round((favorable.length / withDecision.length) * 100)
      : 0;

  const stats = [
    {
      label: "This Month",
      value: thisMonth.length,
      icon: Calendar,
      color: "text-blue-600 bg-blue-50",
      detail: `${upcoming.length} upcoming`,
    },
    {
      label: "Active Reps",
      value: representatives.filter((r) => r.is_active).length,
      icon: Users,
      color: "text-emerald-600 bg-emerald-50",
      detail: `${representatives.length} total`,
    },
    {
      label: "Unassigned",
      value: unassigned.length,
      icon: AlertTriangle,
      color:
        unassigned.length > 0
          ? "text-amber-600 bg-amber-50"
          : "text-emerald-600 bg-emerald-50",
      detail: "need assignment",
    },
    {
      label: "Pending Decision",
      value: pendingDecision.length,
      icon: Clock,
      color: "text-purple-600 bg-purple-50",
      detail: "awaiting outcome",
    },
    {
      label: "Win Rate",
      value: `${winRate}%`,
      icon: TrendingUp,
      color:
        winRate >= 50
          ? "text-emerald-600 bg-emerald-50"
          : "text-amber-600 bg-amber-50",
      detail: `${favorable.length}/${withDecision.length} favorable`,
    },
  ];

  return (
    <div className="grid grid-cols-5 gap-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="bg-white border border-navy-200 rounded-xl px-4 py-3
                       hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-500">
                  {stat.label}
                </p>
                <p className="text-2xl font-bold text-navy-900 mt-0.5 tabular-nums">
                  {stat.value}
                </p>
                <p className="text-[11px] text-navy-400 mt-0.5">
                  {stat.detail}
                </p>
              </div>
              <div className={cn("p-2 rounded-lg", stat.color)}>
                <Icon size={16} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

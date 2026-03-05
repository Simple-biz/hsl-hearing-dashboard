"use client";

import { cn } from "@/lib/utils";

// Status color mapping for hearing decision statuses
const DECISION_COLORS: Record<string, string> = {
  "Fully Favorable": "bg-emerald-100 text-emerald-800",
  "Partially Favorable": "bg-teal-100 text-teal-800",
  Unfavorable: "bg-red-100 text-red-800",
  Dismissed: "bg-amber-100 text-amber-800",
  Remand: "bg-purple-100 text-purple-800",
  Pending: "bg-blue-100 text-blue-800",
  Scheduled: "bg-sky-100 text-sky-800",
  Postponed: "bg-orange-100 text-orange-800",
};

// Assignment status colors
const ASSIGNMENT_COLORS: Record<string, string> = {
  wd_never_assigned: "bg-slate-100 text-slate-600",
  withdrawal: "bg-amber-100 text-amber-700",
};

// Medical record status colors
const MR_COLORS: Record<string, string> = {
  Complete: "bg-emerald-100 text-emerald-800",
  "In Progress": "bg-blue-100 text-blue-800",
  Pending: "bg-amber-100 text-amber-800",
  "Not Started": "bg-slate-100 text-slate-600",
  Missing: "bg-red-100 text-red-800",
};

interface StatusBadgeProps {
  value: string | null;
  type?: "decision" | "assignment" | "medical_record" | "custom";
  customColor?: string;
  size?: "sm" | "md";
}

export default function StatusBadge({
  value,
  type = "decision",
  customColor,
  size = "sm",
}: StatusBadgeProps) {
  if (!value) return <span className="text-sm text-navy-400">—</span>;

  let colorClass = "bg-navy-100 text-navy-600"; // default

  if (customColor) {
    colorClass = customColor;
  } else if (type === "decision") {
    colorClass = DECISION_COLORS[value] || colorClass;
  } else if (type === "assignment") {
    colorClass = ASSIGNMENT_COLORS[value] || colorClass;
  } else if (type === "medical_record") {
    colorClass = MR_COLORS[value] || colorClass;
  }

  const displayValue =
    type === "assignment"
      ? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : value;

  return (
    <span
      className={cn(
        "badge",
        colorClass,
        size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1",
      )}
    >
      {displayValue}
    </span>
  );
}

// MR Team color badge
export function TeamBadge({
  name,
  color,
}: {
  name: string;
  color: string | null;
}) {
  const teamColors: Record<string, string> = {
    blue: "bg-blue-100 text-blue-800 border-blue-200",
    orange: "bg-orange-100 text-orange-800 border-orange-200",
    green: "bg-emerald-100 text-emerald-800 border-emerald-200",
    yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
    purple: "bg-purple-100 text-purple-800 border-purple-200",
  };

  return (
    <span
      className={cn(
        "badge border",
        color && teamColors[color]
          ? teamColors[color]
          : "bg-navy-100 text-navy-700 border-navy-200",
      )}
    >
      {name}
    </span>
  );
}

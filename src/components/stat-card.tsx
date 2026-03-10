import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// ── Gradient style (dashboard) ──────────────────────────────────────────────
// Usage: <StatCard variant="gradient" label="Total" value={1234} gradient="from-indigo-500 to-purple-600" />

// ── Solid color style (reports) ─────────────────────────────────────────────
// Usage: <StatCard variant="solid" label="Total Hearings" value="5,484" bg="bg-violet-600" />

// ── Icon style (admin) ──────────────────────────────────────────────────────
// Usage: <StatCard variant="icon" label="Total Users" value={42} icon={Users} iconColor="text-primary" iconBg="bg-primary/10" />

interface GradientProps {
  variant?: "gradient";
  label: string;
  value: number | string;
  gradient: string;
}

interface SolidProps {
  variant: "solid";
  label: string;
  value: number | string;
  bg: string;
}

interface IconProps {
  variant: "icon";
  label: string;
  value: number | string;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  cardBg?: string;
}

type StatCardProps = GradientProps | SolidProps | IconProps;

export function StatCard(props: StatCardProps) {
  const displayValue =
    typeof props.value === "number"
      ? props.value.toLocaleString()
      : props.value;

  if (props.variant === "icon") {
    const Icon = props.icon;
    return (
      <div
        className={cn(
          "relative overflow-hidden flex items-center gap-3 rounded-xl border p-4",
          props.cardBg || "bg-card",
        )}
      >
        <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-black/3 dark:bg-white/3" />
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg shrink-0",
            props.iconBg || "bg-primary/10",
          )}
        >
          <Icon className={cn("h-5 w-5", props.iconColor || "text-primary")} />
        </div>
        <div className="relative z-10">
          <p className="text-2xl font-bold tabular-nums leading-none">
            {displayValue}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{props.label}</p>
        </div>
      </div>
    );
  }

  if (props.variant === "solid") {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-xl p-4 text-white",
          props.bg,
        )}
      >
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
        <div className="relative z-10">
          <p className="text-[10px] font-semibold tracking-widest uppercase opacity-80 mb-1">
            {props.label}
          </p>
          <p className="text-3xl font-bold tabular-nums leading-none">
            {displayValue}
          </p>
        </div>
      </div>
    );
  }

  // Default: gradient
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-linear-to-br p-5 text-white",
        props.gradient,
      )}
    >
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
      <p className="text-[13px] font-medium uppercase opacity-90">
        {props.label}
      </p>
      <p className="mt-2 text-3xl font-bold tabular-nums leading-none">
        {displayValue}
      </p>
    </div>
  );
}

// ── Grid helper ─────────────────────────────────────────────────────────────
// Wraps stat cards in a responsive grid. Adjusts columns based on count.

export function StatCardGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("grid gap-3", className)}>{children}</div>;
}

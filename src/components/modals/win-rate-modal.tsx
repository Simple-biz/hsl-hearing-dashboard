"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Download,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchWinRateData,
  type WinRateRow,
  type WinRateData,
} from "@/app/(dashboard)/reports/action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SEL =
  "h-8 rounded-md border border-input bg-card px-2 text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring";

type SortKey = "rep" | "favorable" | "partiallyFavorable" | "unfavorable" | "total" | "winRate";
type SortDir = "asc" | "desc";
type QuickMode = "all" | "30d" | "90d" | "custom";

function WinRateBar({ rate }: { rate: number }) {
  const color =
    rate >= 70
      ? "bg-emerald-500"
      : rate >= 50
        ? "bg-blue-500"
        : rate >= 30
          ? "bg-amber-500"
          : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-16">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            color,
          )}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
      <span
        className={cn(
          "text-xs font-bold tabular-nums shrink-0 w-12 text-right",
          rate >= 70
            ? "text-emerald-600 dark:text-emerald-400"
            : rate >= 50
              ? "text-blue-600 dark:text-blue-400"
              : rate >= 30
                ? "text-amber-600 dark:text-amber-400"
                : "text-red-600 dark:text-red-400",
        )}
      >
        {rate.toFixed(1)}%
      </span>
    </div>
  );
}

function OverallCard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl p-4 text-white relative overflow-hidden",
        color,
      )}
    >
      <div className="absolute -right-3 -top-3 h-20 w-20 rounded-full bg-white/10" />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-[10px] font-semibold uppercase tracking-widest opacity-80">
            {label}
          </span>
        </div>
        <p className="text-3xl font-bold tabular-nums leading-none">{value}</p>
        {sub && <p className="text-[11px] opacity-70 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function exportWinRateCsv(
  rows: WinRateRow[],
  overall: WinRateData["overall"],
  quickMode: QuickMode,
  dateFrom: string,
  dateTo: string,
) {
  const filterLabel =
    quickMode === "30d" ? "30d" :
    quickMode === "90d" ? "90d" :
    quickMode === "custom" && dateFrom && dateTo ? `${dateFrom}-to-${dateTo}` :
    quickMode === "custom" && dateFrom ? `from-${dateFrom}` :
    quickMode === "custom" && dateTo ? `to-${dateTo}` :
    "All-Time";
  const header = [
    "Representative",
    "Favorable (FFD)",
    "Partially Favorable (PFD)",
    "Unfavorable (UFD)",
    "Total Decided",
    "Win Rate %",
  ];
  const data = rows.map((r) => [
    r.rep,
    r.favorable,
    r.partiallyFavorable,
    r.unfavorable,
    r.total,
    r.winRate.toFixed(1),
  ]);
  data.push([
    "OVERALL",
    overall.favorable,
    overall.partiallyFavorable,
    overall.unfavorable,
    overall.total,
    overall.winRate.toFixed(1),
  ]);
  const csv = [header, ...data]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `HSL-Win-Rate-Report-${filterLabel}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

interface Props {
  open: boolean;
  onClose: () => void;
  allReps: string[];
}

export function WinRateModal({ open, onClose, allReps }: Props) {
  const [data, setData] = useState<WinRateData | null>(null);
  const [isPending, startTransition] = useTransition();
  const [rep, setRep] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("winRate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [quickMode, setQuickMode] = useState<QuickMode>("all");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = (r: string, df: string, dt: string) => {
    startTransition(async () => {
      const result = await fetchWinRateData({
        rep: r || undefined,
        dateFrom: df || undefined,
        dateTo: dt || undefined,
      });
      setData(result);
    });
  };

  // Load on open
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setRep("");
      setDateFrom("");
      setDateTo("");
      setSearch("");
      setSortKey("winRate");
      setSortDir("desc");
      setQuickMode("all");
      load("", "", "");
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);

  // Debounced filter change
  const triggerLoad = (r: string, df: string, dt: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(r, df, dt), 300);
  };

  const handleQuickMode = (mode: QuickMode) => {
    setQuickMode(mode);
    if (mode === "all") {
      setDateFrom("");
      setDateTo("");
      load(rep, "", "");
    } else if (mode === "30d" || mode === "90d") {
      const days = mode === "30d" ? 30 : 90;
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - days);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      setDateFrom(fmt(from));
      setDateTo(fmt(to));
      load(rep, fmt(from), fmt(to));
    }
    // "custom" — just reveal the inputs, user fills them
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "rep" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      sortDir === "asc" ? (
        <ChevronUp className="h-3 w-3" />
      ) : (
        <ChevronDown className="h-3 w-3" />
      )
    ) : (
      <ChevronDown className="h-3 w-3 opacity-20" />
    );

  const sortedRows = data
    ? [...data.rows]
        .filter(
          (r) => !search || r.rep.toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) => {
          const av = a[sortKey];
          const bv = b[sortKey];
          const cmp =
            typeof av === "string"
              ? av.localeCompare(bv as string)
              : (av as number) - (bv as number);
          return sortDir === "asc" ? cmp : -cmp;
        })
    : [];

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border bg-card shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Win Rate Calculator</h2>
              <p className="text-[11px] text-muted-foreground">
                Favorable vs. Unfavorable outcomes per representative
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => exportWinRateCsv(sortedRows, data.overall, quickMode, dateFrom, dateTo)}
              >
                <Download className="h-3 w-3" />
                Export
              </Button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="border-b px-6 py-3 shrink-0 bg-muted/20 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <select
                className={SEL + " min-w-40"}
                value={rep}
                onChange={(e) => {
                  setRep(e.target.value);
                  triggerLoad(e.target.value, dateFrom, dateTo);
                }}
              >
                <option value="">All Representatives</option>
                {allReps.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {isPending && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
            {/* Segmented quick-filter */}
            <div className="flex items-center rounded-md border border-input bg-background p-0.5 gap-0.5">
              {(["all", "30d", "90d", "custom"] as QuickMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleQuickMode(mode)}
                  className={cn(
                    "h-7 px-3 text-xs rounded font-medium transition-colors select-none",
                    quickMode === mode
                      ? "bg-orange-500 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode === "all" ? "All time" : mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {/* Custom date range — only visible when Custom is active */}
          <div className={cn(
            "-mx-6 border-t border-border/60 transition-all",
            quickMode === "custom" ? "opacity-100" : "opacity-0 pointer-events-none",
          )} />
          <div className={cn(
            "flex items-center gap-3 transition-all overflow-hidden",
            quickMode === "custom" ? "max-h-12 opacity-100" : "max-h-0 opacity-0 pointer-events-none",
          )}>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0 w-10">
              Range
            </span>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  triggerLoad(rep, e.target.value, dateTo);
                }}
                className="h-7 w-36 text-xs"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  triggerLoad(rep, dateFrom, e.target.value);
                }}
                className="h-7 w-36 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Overall cards */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-6 py-4 shrink-0 border-b">
            <div className="rounded-xl p-4 border-2 border-dashed border-border bg-muted/20 relative overflow-hidden">
              <div className="absolute -right-3 -top-3 h-20 w-20 rounded-full bg-muted/30" />
              <div className="relative z-10">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                  Formula
                </p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums leading-none">
                  {(data.overall.favorable + data.overall.partiallyFavorable).toLocaleString()}
                </p>
                <div className="my-1 h-px w-full bg-border" />
                <p className="text-lg font-bold text-foreground tabular-nums leading-none">
                  {data.overall.total.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  (FFD + PFD) ÷ Decided
                </p>
              </div>
            </div>
            <OverallCard
              label="Favorable (FFD)"
              value={data.overall.favorable.toLocaleString()}
              sub="Fully favorable"
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              color="bg-emerald-600"
            />
            <OverallCard
              label="Part. Favorable"
              value={data.overall.partiallyFavorable.toLocaleString()}
              sub="Partially favorable"
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              color="bg-teal-600"
            />
            <OverallCard
              label="Unfavorable (UFD)"
              value={data.overall.unfavorable.toLocaleString()}
              sub="Lost decisions"
              icon={<TrendingDown className="h-3.5 w-3.5" />}
              color="bg-red-500"
            />
            <OverallCard
              label="Total Decided"
              value={data.overall.total.toLocaleString()}
              sub="FFD + PFD + UFD"
              icon={<Minus className="h-3.5 w-3.5" />}
              color="bg-zinc-600"
            />
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* Search */}
          <div className="px-6 py-2 shrink-0">
            <Input
              placeholder="Search representative..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs max-w-56"
            />
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-4">
            {isPending && !data ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : sortedRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Trophy className="h-8 w-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No data matches the current filters.
                </p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border">
                    {(
                      [
                        { key: "rep", label: "Representative", align: "left" },
                        { key: "favorable", label: "FFD", align: "center" },
                        { key: "partiallyFavorable", label: "PFD", align: "center" },
                        { key: "unfavorable", label: "UFD", align: "center" },
                        { key: "total", label: "Decided", align: "center" },
                        { key: "winRate", label: "Win Rate", align: "left" },
                      ] as { key: SortKey; label: string; align: string }[]
                    ).map((col) => (
                      <th
                        key={col.key}
                        className={cn(
                          "h-9 px-3 font-semibold text-[10px] uppercase tracking-wide text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap",
                          col.align === "center" ? "text-center" : "text-left",
                        )}
                        onClick={() => handleSort(col.key)}
                      >
                        <div
                          className={cn(
                            "flex items-center gap-1",
                            col.align === "center" && "justify-center",
                          )}
                        >
                          {col.label}
                          <SortIcon k={col.key} />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={cn(isPending && "opacity-50")}>
                  {sortedRows.map((row, i) => (
                    <tr
                      key={row.rep}
                      className={cn(
                        "border-b border-border/40 hover:bg-muted/30 transition-colors",
                        i % 2 === 0
                          ? "bg-white dark:bg-zinc-950"
                          : "bg-zinc-50/50 dark:bg-zinc-900/50",
                      )}
                    >
                      <td className="px-3 py-2.5 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          {/* Rank badge */}
                          {sortKey === "winRate" && sortDir === "desc" && (
                            <span
                              className={cn(
                                "inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[9px] font-bold shrink-0",
                                i === 0
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                  : i === 1
                                    ? "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                                    : i === 2
                                      ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                                      : "bg-muted text-muted-foreground",
                              )}
                            >
                              {i + 1}
                            </span>
                          )}
                          {row.rep}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {row.favorable}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-semibold text-teal-600 dark:text-teal-400 tabular-nums">
                          {row.partiallyFavorable}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-semibold text-red-500 dark:text-red-400 tabular-nums">
                          {row.unfavorable}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-muted-foreground tabular-nums">
                          {row.total}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 min-w-40">
                        <WinRateBar rate={row.winRate} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t bg-muted/20 px-6 py-2.5 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            Win rate = Favorable ÷ (Favorable + Unfavorable) · excludes
            pending/scheduled
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums">
            {sortedRows.length} rep{sortedRows.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

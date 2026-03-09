"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Loader2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchRepStats } from "@/app/(dashboard)/actions";
import type { RepStatRow } from "@/app/(dashboard)/actions";

const TYPE_COLORS: Record<string, string> = {
  internal_advocates:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "in-house":
    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  external_advocates:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  contract: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};
const TYPE_SHORT: Record<string, string> = {
  internal_advocates: "Internal",
  external_advocates: "External",
  "in-house": "In-House",
  contract: "Contract",
};

export function RepStatsModal({ onClose }: { onClose: () => void }) {
  const [dateRange, setDateRange] = useState("total");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<RepStatRow[] | null>(null);
  const [totals, setTotals] = useState({
    total: 0,
    internal: 0,
    external: 0,
    repCount: 0,
  });
  const [fetchId, setFetchId] = useState(1);
  const [lastFetchId, setLastFetchId] = useState(0);

  const loading = fetchId !== lastFetchId;

  useEffect(() => {
    let cancelled = false;
    const currentFetchId = fetchId;
    fetchRepStats({
      dateRange: dateRange === "total" ? undefined : dateRange,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }).then((res) => {
      if (!cancelled) {
        setStats(res.stats);
        setTotals(res.totals);
        setLastFetchId(currentFetchId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeDateRange = (dr: string) => {
    setDateRange(dr);
    setFetchId((n) => n + 1);
  };
  const changeDateFrom = (v: string) => {
    setDateFrom(v);
    setFetchId((n) => n + 1);
  };
  const changeDateTo = (v: string) => {
    setDateTo(v);
    setFetchId((n) => n + 1);
  };

  const filtered = stats
    ? search
      ? stats.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
      : stats
    : [];
  const maxCount = Math.max(1, ...filtered.map((r) => r.assigned_count));

  const handleExport = () => {
    let csv = "Representative,Type,Assigned\n";
    filtered.forEach((r) => {
      csv += `"${r.name}","${TYPE_SHORT[r.rep_type] || r.rep_type}",${r.assigned_count}\n`;
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "rep_stats.csv";
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-175 max-h-[85vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <h2 className="text-sm font-semibold">
            📊 Rep Assignment Statistics
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3 shrink-0">
            <select
              className="h-8 rounded border bg-card px-2 text-xs"
              value={dateRange}
              onChange={(e) => changeDateRange(e.target.value)}
            >
              <option value="total">All Time</option>
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="custom">Custom Range...</option>
            </select>
            {dateRange === "custom" && (
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => changeDateFrom(e.target.value)}
                  className="h-8 w-31.25 text-xs"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => changeDateTo(e.target.value)}
                  className="h-8 w-31.25 text-xs"
                />
              </div>
            )}
            <Input
              placeholder="🔍 Filter by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ml-auto h-8 w-45 text-xs"
            />
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3 px-5 py-3 border-b shrink-0">
            <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/30 p-3 text-center">
              <p className="text-xl font-bold tabular-nums text-indigo-700 dark:text-indigo-400">
                {totals.total}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Total Assigned
              </p>
            </div>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
              <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {totals.internal}
              </p>
              <p className="text-[10px] text-muted-foreground">Internal</p>
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
              <p className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                {totals.external}
              </p>
              <p className="text-[10px] text-muted-foreground">External</p>
            </div>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 text-center">
              <p className="text-xl font-bold tabular-nums text-blue-700 dark:text-blue-400">
                {totals.repCount}
              </p>
              <p className="text-[10px] text-muted-foreground">Active Reps</p>
            </div>
          </div>

          {/* Rep list */}
          <div className="flex-1 overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center gap-3 bg-card px-5 py-2 border-b text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <span className="flex-1">Representative</span>
              <span className="w-20 text-center">Type</span>
              <span className="w-16 text-right">Assigned</span>
              <span className="w-32">Distribution</span>
            </div>

            {loading && stats === null ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No representatives found.
              </div>
            ) : (
              <div className={cn(loading && "opacity-50 pointer-events-none")}>
                {filtered.map((rep) => (
                  <div
                    key={rep.id}
                    className="flex items-center gap-3 px-5 py-2 border-b border-border/50 hover:bg-muted/30"
                  >
                    <span className="flex-1 text-sm font-medium truncate">
                      {rep.name}
                    </span>
                    <span
                      className={cn(
                        "w-20 text-center rounded-md px-2 py-0.5 text-[10px] font-semibold",
                        TYPE_COLORS[rep.rep_type] || "bg-muted",
                      )}
                    >
                      {TYPE_SHORT[rep.rep_type] || rep.rep_type}
                    </span>
                    <span className="w-16 text-right text-sm font-bold tabular-nums">
                      {rep.assigned_count}
                    </span>
                    <div className="w-32">
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-purple-500 transition-all"
                          style={{
                            width: `${(rep.assigned_count / maxCount) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t bg-muted/50 px-5 py-3 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onClose}
          >
            Close
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleExport}
            disabled={filtered.length === 0}
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>
    </div>
  );
}

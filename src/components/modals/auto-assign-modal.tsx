"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Zap, Loader2 } from "lucide-react";
import {
  autoAssignAll,
  getUnassignedCount,
  getUnassignedHearingIds,
  autoAssignChunk,
} from "@/app/(dashboard)/actions";
import type { RepRow } from "@/app/(dashboard)/actions";

const SEL =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function getMonthOptions() {
  const months: { value: string; label: string }[] = [
    { value: "all", label: "All Unassigned Hearings" },
    { value: "future", label: "All Future Hearings" },
  ];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    });
  }
  return months;
}

function formatMonthLabel(value: string) {
  if (value === "all") return "all time";
  if (value === "future") return "future dates";
  const [year, month] = value.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );
}

interface RepState {
  id: number;
  name: string;
  rep_type: string;
  selected: boolean;
}

export function AutoAssignModal({
  representatives,
  onClose,
  onSuccess,
}: {
  representatives: RepRow[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [monthFilter, setMonthFilter] = useState("future");
  const [distributionMode, setDistributionMode] = useState<
    "priority" | "balanced" | "workload"
  >("priority");
  const [totalLimit, setTotalLimit] = useState("");
  const [excludeRescheduled, setExcludeRescheduled] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [unassignedCount, setUnassignedCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    assigned: number;
    total: number;
    internal: number;
    external: number;
    failed: number;
    breakdown: { name: string; rep_type: string; count: number }[];
    failures: { hearing_id: number; reason: string }[];
    emailsSent?: number;
    emailsFailed?: number;
  } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result]);

  const [repStates, setRepStates] = useState<RepState[]>(() =>
    representatives
      .filter((r) => r.is_active)
      .map((r) => ({
        id: r.id,
        name: r.name,
        rep_type: r.rep_type,
        selected: true,
      })),
  );

  const internalReps = repStates.filter(
    (r) => r.rep_type === "in-house" || r.rep_type === "internal_advocates",
  );
  const externalReps = repStates.filter(
    (r) => r.rep_type === "external_advocates" || r.rep_type === "contract",
  );
  const selectedCount = repStates.filter((r) => r.selected).length;

  useEffect(() => {
    setUnassignedCount(null);
    setLoading(true);
    setResult(null);
    getUnassignedCount(monthFilter, excludeRescheduled).then((count) => {
      setUnassignedCount(count);
      setLoading(false);
    });
  }, [monthFilter, excludeRescheduled]);

  const toggleRep = (id: number) =>
    setRepStates((p) =>
      p.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)),
    );
  const toggleAll = (v: boolean) =>
    setRepStates((p) => p.map((r) => ({ ...r, selected: v })));
  const maxLimitRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const effectiveCount = useMemo(() => {
    if (unassignedCount === null) return 0;
    const limit = totalLimit ? parseInt(totalLimit) : 0;
    return limit > 0 && limit < unassignedCount ? limit : unassignedCount;
  }, [unassignedCount, totalLimit]);

  // Live progress state
  const [progress, setProgress] = useState<{
    total: number;
    processed: number;
    assigned: number;
    failed: number;
    currentRep: string;
    log: { claimant: string; repName?: string; success: boolean }[];
  } | null>(null);
  const abortRef = useRef(false);

  const handleRun = async () => {
    if (selectedCount === 0) return;
    setRunning(true);
    abortRef.current = false;

    const selRepIds = repStates.filter((r) => r.selected).map((r) => r.id);
    const limit = totalLimit ? parseInt(totalLimit) : null;

    try {
      // Get all unassigned hearing IDs
      let hearingIds = await getUnassignedHearingIds(
        monthFilter,
        excludeRescheduled,
      );
      if (limit && limit > 0 && limit < hearingIds.length)
        hearingIds = hearingIds.slice(0, limit);

      setProgress({
        total: hearingIds.length,
        processed: 0,
        assigned: 0,
        failed: 0,
        currentRep: "",
        log: [],
      });

      const CHUNK_SIZE = 5;
      const allBreakdown: Record<string, { count: number; type: string }> = {};
      const allFailures: { hearingId: number; reason: string }[] = [];
      let totalAssigned = 0;
      let totalFailed = 0;

      for (let i = 0; i < hearingIds.length; i += CHUNK_SIZE) {
        if (abortRef.current) break;
        const chunk = hearingIds.slice(i, i + CHUNK_SIZE);
        const results = await autoAssignChunk(
          chunk,
          selRepIds,
          distributionMode,
        );

        const newLog: {
          claimant: string;
          repName?: string;
          success: boolean;
        }[] = [];
        for (const r of results) {
          if (r.success && r.repName) {
            totalAssigned++;
            if (!allBreakdown[r.repName])
              allBreakdown[r.repName] = { count: 0, type: r.repType || "" };
            allBreakdown[r.repName].count++;
            newLog.push({
              claimant: r.claimant,
              repName: r.repName,
              success: true,
            });
          } else {
            totalFailed++;
            allFailures.push({
              hearingId: r.hearingId,
              reason: r.reason || "Unknown",
            });
            newLog.push({ claimant: r.claimant, success: false });
          }
        }

        setProgress((p) =>
          p
            ? {
                ...p,
                processed: Math.min(i + CHUNK_SIZE, hearingIds.length),
                assigned: totalAssigned,
                failed: totalFailed,
                currentRep:
                  results.find((r) => r.success)?.repName || p.currentRep,
                log: [...p.log, ...newLog].slice(-20), // Keep last 20 entries
              }
            : null,
        );
      }

      // Build final result matching existing result format
      const breakdown = Object.entries(allBreakdown).map(([name, v]) => ({
        name,
        rep_type: v.type,
        count: v.count,
      }));

      // Send emails if requested
      let emailsSent = 0;
      if (sendEmail && breakdown.length > 0) {
        try {
          const res = await autoAssignAll({
            monthFilter: "__skip__",
            selectedRepIds: selRepIds,
            distributionMode,
            totalLimit: 0,
            excludeRescheduled,
            sendEmail: true,
          });
          emailsSent = res.emailsSent ?? 0;
        } catch {
          /* email send failed, non-critical */
        }
      }

      setResult({
        assigned: totalAssigned,
        failed: totalFailed,
        total: totalAssigned + totalFailed,
        internal: breakdown
          .filter(
            (b) =>
              b.rep_type === "internal_advocates" || b.rep_type === "in-house",
          )
          .reduce((s, b) => s + b.count, 0),
        external: breakdown
          .filter(
            (b) =>
              b.rep_type === "external_advocates" || b.rep_type === "contract",
          )
          .reduce((s, b) => s + b.count, 0),
        breakdown,
        failures: allFailures.map((f) => ({
          hearing_id: f.hearingId,
          reason: f.reason,
        })),
        emailsSent,
        emailsFailed: 0,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const monthLabel = formatMonthLabel(monthFilter);
  const rescheduledNote = excludeRescheduled ? " (excluding rescheduled)" : "";

  // Group failures by category
  const failureGroups = useMemo(() => {
    if (!result?.failures.length) return [];
    const groups: Record<
      string,
      { label: string; icon: string; reps: Set<string> }
    > = {};
    for (const f of result.failures) {
      let cat = "Other";
      let icon = "❓";
      const r = f.reason.toLowerCase();
      if (
        r.includes("schedule") ||
        r.includes("locked") ||
        r.includes("no availability")
      ) {
        cat = "Schedule Not Locked";
        icon = "📅";
      } else if (
        r.includes("unavailable") ||
        r.includes("morning") ||
        r.includes("afternoon") ||
        r.includes("time slot")
      ) {
        cat = "Unavailable";
        icon = "🚫";
      } else if (r.includes("daily limit")) {
        cat = "Daily Limit Reached";
        icon = "📊";
      } else if (r.includes("weekly limit")) {
        cat = "Weekly Limit Reached";
        icon = "📈";
      } else if (r.includes("buffer") || r.includes("too close")) {
        cat = "Time Buffer Conflict";
        icon = "⏰";
      } else if (
        r.includes("restriction") ||
        r.includes("2×2") ||
        r.includes("3×3")
      ) {
        cat = "Hearing Restriction";
        icon = "⚠️";
      } else if (r.includes("past")) {
        cat = "Past Hearing Date";
        icon = "📅";
      } else if (r.includes("holiday")) {
        cat = "Federal Holiday";
        icon = "🏛️";
      } else if (r.includes("no eligible") || r.includes("no active")) {
        cat = "No Eligible Representatives";
        icon = "👥";
      }
      if (!groups[cat]) groups[cat] = { label: cat, icon, reps: new Set() };
      // Extract rep names from the reason if possible
      groups[cat].reps.add(f.reason);
    }
    return Object.values(groups).map((g) => ({
      ...g,
      count: g.reps.size,
      reps: Array.from(g.reps),
    }));
  }, [result]);

  // ── Rep item component matching old dashboard colors ──
  function RepItem({
    rep,
    isInternal,
  }: {
    rep: RepState;
    isInternal: boolean;
  }) {
    const checkedBorder = isInternal
      ? "border-green-300 dark:border-green-700"
      : "border-purple-300 dark:border-purple-700";
    const checkedHover = isInternal
      ? "hover:border-green-500 hover:bg-green-50 dark:hover:border-green-500 dark:hover:bg-green-950"
      : "hover:border-purple-500 hover:bg-purple-50 dark:hover:border-purple-500 dark:hover:bg-purple-950";

    return (
      <div
        className={`flex items-center gap-2 rounded-md border px-2.5 py-2 transition-all ${rep.selected ? `bg-card ${checkedBorder} ${checkedHover}` : "bg-muted/50 opacity-50 border-border"}`}
      >
        <input
          type="checkbox"
          checked={rep.selected}
          onChange={() => toggleRep(rep.id)}
          className={`h-4.5 w-4.5 cursor-pointer shrink-0 rounded ${isInternal ? "accent-green-600" : "accent-purple-600"}`}
        />
        <span
          className="flex-1 truncate text-[13px] font-medium text-foreground"
          title={rep.name}
        >
          {rep.name}
        </span>
        <input
          type="number"
          ref={(el) => {
            maxLimitRefs.current[rep.id] = el;
          }}
          defaultValue=""
          placeholder="Max"
          min={0}
          className="h-7 w-14 rounded border bg-muted/50 text-[11px] text-center px-1 focus:outline-none focus:ring-1 focus:ring-ring"
          disabled={!rep.selected}
        />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-170 rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — gray bg like old dashboard */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-6 py-5">
          <h2 className="text-lg font-semibold">⚡ Auto-Assign All Hearings</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-5">
          {/* Config sections — hidden after result */}
          {!result && (
            <>
              <p className="text-sm text-muted-foreground">
                Automatically assign representatives to unassigned hearings
                based on availability and workload.
              </p>

              {/* Month Filter */}
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Filter by Month
                </label>
                <select
                  className={SEL}
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                >
                  {getMonthOptions().map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Rep Selection */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-semibold flex items-center gap-1.5">
                    👥 Representative Selection
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => toggleAll(true)}
                      className="rounded px-2.5 py-1 text-[11px] font-semibold bg-green-600 text-white hover:bg-green-700"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => toggleAll(false)}
                      className="rounded px-2.5 py-1 text-[11px] font-semibold bg-zinc-500 text-white hover:bg-zinc-600"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  {internalReps.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-green-600 flex items-center gap-1.5">
                        🏢 Internal Advocates
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {internalReps.map((r) => (
                          <RepItem key={r.id} rep={r} isInternal />
                        ))}
                      </div>
                    </div>
                  )}
                  {externalReps.length > 0 && (
                    <div
                      className={internalReps.length > 0 ? "border-t pt-3" : ""}
                    >
                      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-purple-600 flex items-center gap-1.5">
                        🏛️ External Advocates
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {externalReps.map((r) => (
                          <RepItem key={r.id} rep={r} isInternal={false} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Limit + Distribution */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    🎯 Total Hearing Limit
                  </label>
                  <Input
                    type="number"
                    value={totalLimit}
                    onChange={(e) => setTotalLimit(e.target.value)}
                    placeholder="No limit"
                    min={0}
                    className="h-10 text-sm"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Leave empty to assign all available hearings
                  </p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    ⚖️ Distribution Mode
                  </label>
                  <select
                    className={SEL}
                    value={distributionMode}
                    onChange={(e) =>
                      setDistributionMode(
                        e.target.value as "priority" | "balanced" | "workload",
                      )
                    }
                  >
                    <option value="priority">
                      ⚡ Priority (Internal first, then external)
                    </option>
                    <option value="balanced">
                      📊 Balanced (Even distribution)
                    </option>
                    <option value="workload">
                      📈 Workload (Least busy first)
                    </option>
                  </select>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    How to distribute hearings among selected reps
                  </p>
                </div>
              </div>

              {/* Email Notifications — purple accent checkbox */}
              <div className="rounded-lg border bg-muted/30 p-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                    className="h-4.5 w-4.5 cursor-pointer accent-purple-600 rounded"
                  />
                  <div>
                    <p className="text-sm font-semibold">
                      📧 Send notification emails
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Notify representatives of their new assignments
                    </p>
                  </div>
                </label>
              </div>

              {/* Rescheduled — purple accent checkbox */}
              <div className="rounded-lg border bg-muted/30 p-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={excludeRescheduled}
                    onChange={(e) => setExcludeRescheduled(e.target.checked)}
                    className="h-4.5 w-4.5 cursor-pointer accent-purple-600 rounded"
                  />
                  <div>
                    <p className="text-sm font-semibold">
                      🔄 Exclude rescheduled hearings
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Skip hearings with &quot;(Rescheduled)&quot;,
                      &quot;(Rescheduled 2)&quot;, etc.
                    </p>
                  </div>
                </label>
              </div>
            </>
          )}

          {/* Preview / Summary Result */}
          <div ref={resultRef}>
            {loading ? (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : result ? (
              <div className="space-y-5">
                {/* Title */}
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  ✅ Auto-Assignment Complete
                </h3>

                {/* 4 Summary Stat Boxes — matching old dashboard colors */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3 text-center dark:bg-zinc-800">
                    <p className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
                      {result.assigned}
                    </p>
                    <p className="text-[11px] uppercase text-muted-foreground">
                      Assigned
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center dark:bg-zinc-800">
                    <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
                      {result.failed}
                    </p>
                    <p className="text-[11px] uppercase text-muted-foreground">
                      Failed
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center dark:bg-zinc-800">
                    <p className="text-2xl font-bold tabular-nums text-blue-700 dark:text-blue-400">
                      {result.internal}
                    </p>
                    <p className="text-[11px] uppercase text-muted-foreground">
                      Internal
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center dark:bg-zinc-800">
                    <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                      {result.external}
                    </p>
                    <p className="text-[11px] uppercase text-muted-foreground">
                      External
                    </p>
                  </div>
                </div>

                {/* Per-rep breakdown */}
                <div>
                  <h4 className="mb-3 text-sm font-semibold text-foreground/80 border-b pb-2">
                    📊 Assignments by Representative
                  </h4>
                  {result.breakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      No assignments made
                    </p>
                  ) : (
                    <div className="max-h-75 overflow-y-auto space-y-1">
                      {result.breakdown.map((rep) => (
                        <div
                          key={rep.name}
                          className="flex items-center justify-between py-2 px-3 border-b border-border/50 last:border-0"
                        >
                          <span className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                            {rep.rep_type === "in-house" ||
                            rep.rep_type === "internal_advocates"
                              ? "🏠"
                              : "📋"}{" "}
                            {rep.name}
                          </span>
                          <span className="text-base font-bold tabular-nums text-purple-600 dark:text-purple-400 bg-muted px-3 py-0.5 rounded-full">
                            {rep.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Failure reasons — grouped by category */}
                {failureGroups.length > 0 && (
                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-red-600 dark:text-red-400 border-b border-red-200 dark:border-red-900 pb-2">
                      ⚠️ Failure Reasons
                    </h4>
                    <div className="space-y-2">
                      {failureGroups.map((group) => (
                        <div
                          key={group.label}
                          className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30"
                        >
                          <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                            {group.icon} {group.label}
                          </p>
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                            {group.count} hearing{group.count !== 1 ? "s" : ""}{" "}
                            affected
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-sm">
                  📊 <span className="font-semibold">{unassignedCount}</span>{" "}
                  unassigned hearing{unassignedCount !== 1 ? "s" : ""} for{" "}
                  <span className="font-semibold">{monthLabel}</span>
                  {rescheduledNote}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Live progress overlay — floats on top of modal */}
        {running && progress && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-xl">
            <div className="w-[90%] max-w-sm rounded-xl border bg-card p-5 shadow-2xl space-y-3">
              <div className="text-center">
                <p className="text-sm font-semibold">
                  ⚡ Auto-Assigning Hearings
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {progress.processed} of {progress.total} processed
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-purple-600 transition-all duration-300"
                      style={{
                        width:
                          progress.total > 0
                            ? `${Math.round((progress.processed / progress.total) * 100)}%`
                            : "0%",
                      }}
                    ></div>
                  </div>
                </div>
                <span className="text-xs font-bold tabular-nums">
                  {progress.total > 0
                    ? Math.round((progress.processed / progress.total) * 100)
                    : 0}
                  %
                </span>
              </div>
              <div className="flex items-center justify-center gap-5 text-xs">
                <span className="text-emerald-600 font-semibold">
                  ✓ {progress.assigned}
                </span>
                <span className="text-red-600 font-semibold">
                  ✕ {progress.failed}
                </span>
                <span className="text-muted-foreground">
                  {progress.total - progress.processed} left
                </span>
              </div>
              {progress.log.length > 0 && (
                <div className="max-h-25 overflow-y-auto rounded border bg-muted/30 px-2.5 py-1.5 text-[10px] font-mono leading-relaxed">
                  {progress.log
                    .slice(-10)
                    .reverse()
                    .map((entry, i) => (
                      <div
                        key={i}
                        className={
                          entry.success
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-red-500 dark:text-red-400"
                        }
                      >
                        {entry.success ? "✓" : "✕"} {entry.claimant}{" "}
                        {entry.success ? `→ ${entry.repName}` : ""}
                      </div>
                    ))}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-full text-xs text-red-600 border-red-300 hover:bg-red-50"
                onClick={() => {
                  abortRef.current = true;
                }}
              >
                ⏹ Stop
              </Button>
            </div>
          </div>
        )}

        {/* Footer — gray bg like old dashboard */}
        <div className="flex items-center justify-end gap-3 border-t bg-muted/50 px-6 py-4">
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-4 text-sm"
            onClick={() => {
              if (result) onSuccess();
              onClose();
            }}
          >
            {result ? "Done" : "Cancel"}
          </Button>
          {!result && (
            <Button
              size="sm"
              className="h-9 px-4 gap-2 text-sm bg-purple-600 hover:bg-purple-700"
              onClick={handleRun}
              disabled={running || selectedCount === 0 || effectiveCount === 0}
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Assigning...
                </>
              ) : effectiveCount === 0 ? (
                <>
                  <Zap className="h-4 w-4" /> No Hearings to Assign
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" /> Auto-Assign {effectiveCount}{" "}
                  Hearing{effectiveCount !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

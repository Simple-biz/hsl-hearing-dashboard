"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { unassignAll, getUnassignPreview } from "@/app/(dashboard)/actions";
import type { UnassignPreviewRow } from "@/app/(dashboard)/actions";

function fmtTime(raw: string | null | undefined): string {
  if (!raw) return "";
  const [hStr, mStr] = raw.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  if (isNaN(h)) return raw;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

const SEL =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
function getMonthOptions() {
  const months: { value: string; label: string }[] = [
    { value: "__select__", label: "Select a month..." },
    { value: "all", label: "All Assigned Hearings" },
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

export function UnassignAllModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [monthFilter, setMonthFilter] = useState("__select__");
  const [assignDateFilter, setAssignDateFilter] = useState("__any__");
  const [customAssignDate, setCustomAssignDate] = useState("");
  const [repTypeFilter, setRepTypeFilter] = useState("__all__");
  const [preview, setPreview] = useState<UnassignPreviewRow[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [searchFilter, setSearchFilter] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ unassigned: number } | null>(null);

  // Fetch preview when filters change
  const hasFilter =
    monthFilter !== "__select__" ||
    assignDateFilter !== "__any__" ||
    repTypeFilter !== "__all__";
  const waitingCustomDate = assignDateFilter === "custom" && !customAssignDate;

  useEffect(() => {
    if (!hasFilter || waitingCustomDate) {
      setPreview([]);
      setCheckedIds(new Set());
      return;
    }
    setLoadingPreview(true);
    setResult(null);
    getUnassignPreview({
      monthFilter: monthFilter === "__select__" ? "" : monthFilter,
      assignDateFilter: assignDateFilter === "__any__" ? "" : assignDateFilter,
      customAssignDate: assignDateFilter === "custom" ? customAssignDate : "",
      repTypeFilter: repTypeFilter === "__all__" ? "" : repTypeFilter,
    }).then((rows) => {
      setPreview(rows);
      setCheckedIds(new Set(rows.map((r) => r.id)));
      setLoadingPreview(false);
    });
  }, [
    monthFilter,
    assignDateFilter,
    customAssignDate,
    repTypeFilter,
    hasFilter,
    waitingCustomDate,
  ]);

  // Filtered by search
  const filteredPreview = useMemo(() => {
    if (!searchFilter) return preview;
    const q = searchFilter.toLowerCase();
    return preview.filter(
      (h) =>
        h.claimant.toLowerCase().includes(q) ||
        h.rep_name?.toLowerCase().includes(q),
    );
  }, [preview, searchFilter]);

  const selectedCount = checkedIds.size;
  const excludedCount = preview.length - selectedCount;

  const toggleId = (id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (selectAll: boolean) => {
    if (selectAll) {
      setCheckedIds(new Set(filteredPreview.map((h) => h.id)));
    } else {
      const filteredIds = new Set(filteredPreview.map((h) => h.id));
      setCheckedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const handleUnassign = async () => {
    if (selectedCount === 0) return;
    setRunning(true);
    try {
      const res = await unassignAll({
        monthFilter: monthFilter === "__select__" ? "" : monthFilter,
        repTypeFilter: repTypeFilter === "__all__" ? "" : repTypeFilter,
        assignDateFilter:
          assignDateFilter === "__any__" ? "" : assignDateFilter,
        customAssignDate: assignDateFilter === "custom" ? customAssignDate : "",
        hearingIds: Array.from(checkedIds),
      });
      setResult({ unassigned: res.unassigned });
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-175 rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-6 py-5">
          <h2 className="text-lg font-semibold">🗑️ Unassign All Hearings</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-4">
          {!result ? (
            <>
              <p className="text-sm text-muted-foreground">
                Remove representative assignments from hearings based on
                filters. This will clear the assigned rep and assignment status.
              </p>

              {/* Filters */}
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Filter by Hearing Month
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

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Filter by Assignment Date
                </label>
                <select
                  className={SEL}
                  value={assignDateFilter}
                  onChange={(e) => setAssignDateFilter(e.target.value)}
                >
                  <option value="__any__">🕐 Any assignment date</option>
                  <option value="today">📅 Assigned Today</option>
                  <option value="yesterday">📅 Assigned Yesterday</option>
                  <option value="last_7_days">
                    📅 Assigned in Last 7 Days
                  </option>
                  <option value="custom">📅 Custom Date...</option>
                </select>
                {assignDateFilter === "custom" && (
                  <div className="mt-2">
                    <label className="mb-1 block text-sm font-semibold">
                      Select Assignment Date
                    </label>
                    <Input
                      type="date"
                      value={customAssignDate}
                      onChange={(e) => setCustomAssignDate(e.target.value)}
                      className="h-10 text-sm"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Filter by Rep Type
                </label>
                <select
                  className={SEL}
                  value={repTypeFilter}
                  onChange={(e) => setRepTypeFilter(e.target.value)}
                >
                  <option value="__all__">👥 All Representatives</option>
                  <option value="internal_advocates">
                    🏢 Internal Advocates Only
                  </option>
                  <option value="external_advocates">
                    🌐 External Advocates Only
                  </option>
                </select>
              </div>

              {/* Preview count */}
              <div className="rounded-lg border bg-muted/30 p-3">
                {!hasFilter ? (
                  <span className="text-sm text-muted-foreground">
                    Select filters to see matching hearings...
                  </span>
                ) : waitingCustomDate ? (
                  <span className="text-sm text-muted-foreground">
                    Please select a custom date...
                  </span>
                ) : loadingPreview ? (
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading
                    preview...
                  </span>
                ) : preview.length === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    No matching assigned hearings found
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-red-600">
                    ⚠️ {selectedCount} hearing{selectedCount !== 1 ? "s" : ""}{" "}
                    will be unassigned
                    {excludedCount > 0 ? ` (${excludedCount} excluded)` : ""}
                  </span>
                )}
              </div>

              {/* Hearing preview list with checkboxes */}
              {preview.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-semibold">
                      📋 Hearings to Unassign{" "}
                      <span className="font-normal text-muted-foreground">
                        (uncheck to keep assigned)
                      </span>
                    </label>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => toggleAll(true)}
                        className="rounded px-2.5 py-1 text-[11px] font-semibold bg-zinc-600 text-white hover:bg-zinc-700"
                      >
                        ✓ Select All
                      </button>
                      <button
                        onClick={() => toggleAll(false)}
                        className="rounded px-2.5 py-1 text-[11px] font-semibold bg-zinc-500 text-white hover:bg-zinc-600"
                      >
                        ✕ Deselect All
                      </button>
                    </div>
                  </div>

                  {/* Search within list */}
                  <Input
                    placeholder="🔍 Filter by claimant name..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="mb-2 h-9 text-sm"
                  />

                  {/* Scrollable list */}
                  <div className="max-h-87.5 overflow-y-auto rounded-lg border bg-card">
                    {filteredPreview.map((h) => {
                      const dateStr = new Date(
                        h.hearing_date + "T12:00:00",
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                      const timeStr =
                        fmtTime(h.converted_time_est) || "";
                      const repIcon =
                        h.rep_type === "internal_advocates" ||
                        h.rep_type === "in-house"
                          ? "🏢"
                          : "🌐";

                      return (
                        <label
                          key={h.id}
                          className="flex items-center px-3 py-2.5 border-b border-border/50 last:border-0 cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={checkedIds.has(h.id)}
                            onChange={() => toggleId(h.id)}
                            className="h-4.5 w-4.5 mr-3 cursor-pointer shrink-0 accent-red-600"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {h.claimant}
                            </p>
                            <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
                              <span>
                                📅 {dateStr}
                                {timeStr ? ` @ ${timeStr}` : ""}
                              </span>
                              <span>
                                {repIcon} {h.rep_name || "Unknown"}
                              </span>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {/* Selection count */}
                  <div className="mt-2 text-xs">
                    {selectedCount === preview.length ? (
                      <span className="text-green-600">
                        ✓ All {preview.length} hearing
                        {preview.length !== 1 ? "s" : ""} will be unassigned
                      </span>
                    ) : selectedCount === 0 ? (
                      <span className="text-muted-foreground">
                        No hearings selected to unassign
                      </span>
                    ) : (
                      <span className="text-blue-600">
                        📌 {excludedCount} hearing
                        {excludedCount !== 1 ? "s" : ""} will be kept (excluded)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Warning */}
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <p className="text-sm text-red-700 dark:text-red-400">
                  <span className="font-semibold">Warning:</span> This action
                  cannot be undone. Representatives will need to be reassigned
                  manually or via Auto-Assign.
                </p>
              </div>
            </>
          ) : (
            /* Summary after action */
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                ✅ Unassignment Complete
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/50 p-4 text-center dark:bg-zinc-800">
                  <p className="text-3xl font-bold tabular-nums text-green-600 dark:text-green-400">
                    {result.unassigned}
                  </p>
                  <p className="text-xs uppercase text-muted-foreground mt-1">
                    Hearings Unassigned
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-4 text-center dark:bg-zinc-800">
                  <p className="text-3xl font-bold tabular-nums">
                    {excludedCount}
                  </p>
                  <p className="text-xs uppercase text-muted-foreground mt-1">
                    Kept / Excluded
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
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
              variant="destructive"
              size="sm"
              className="h-9 px-4 gap-2 text-sm"
              onClick={handleUnassign}
              disabled={running || selectedCount === 0}
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Unassigning...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />{" "}
                  {selectedCount === preview.length
                    ? `Unassign All (${selectedCount})`
                    : `Unassign Selected (${selectedCount})`}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

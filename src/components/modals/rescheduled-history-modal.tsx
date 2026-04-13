"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X as XIcon,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchRescheduledHistory,
  type RescheduledHistoryRow,
} from "@/app/(dashboard)/rescheduled-actions";

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const datePart = d.slice(0, 10);
  try {
    return new Date(datePart + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return datePart;
  }
}

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

export function RescheduledHistoryModal({ onClose }: { onClose: () => void }) {
  const [records, setRecords] = useState<RescheduledHistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback((p: number, s: string) => {
    startTransition(async () => {
      const result = await fetchRescheduledHistory({
        search: s,
        page: p,
        pageSize: 50,
      });
      setRecords(result.records);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    });
  }, []);

  useEffect(() => {
    load(1, "");
  }, [load]);

  const handleSearch = useCallback(
    (val: string) => {
      setSearch(val);
      setPage(1);
      load(1, val);
    },
    [load],
  );

  const goPage = useCallback(
    (p: number) => {
      setPage(p);
      load(p, search);
    },
    [load, search],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[85vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-violet-600" />
              Rescheduled Hearings History
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {total} record{total !== 1 ? "s" : ""} — previous assignments
              preserved for reference
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-3 border-b px-5 py-2.5 shrink-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by claimant or previous rep..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <span className="text-xs text-muted-foreground ml-auto">
            {total} result{total !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : records.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {search
                ? "No rescheduled hearings match your search."
                : "No rescheduled hearings found."}
            </div>
          ) : (
            <div className="divide-y">
              {records.map((rec) => {
                const isExpanded = expandedId === rec.id;
                return (
                  <div
                    key={rec.id}
                    className={cn(
                      "px-5 py-3 transition-colors hover:bg-muted/30",
                      isExpanded && "bg-violet-50/50 dark:bg-violet-950/10",
                    )}
                  >
                    {/* Main row — always visible */}
                    <div
                      className="flex items-start gap-4 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                    >
                      {/* Left: claimant info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-foreground">
                            {rec.original_claimant}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            →
                          </span>
                          <span className="text-xs font-semibold text-violet-700 dark:text-violet-400">
                            {rec.new_claimant}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
                          <span>
                            Date: {fmtDate(rec.original_hearing_date)} →{" "}
                            <span className="text-foreground font-medium">
                              {fmtDate(rec.new_hearing_date)}
                            </span>
                          </span>
                          {rec.previous_rep_name && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-[10px] font-medium text-blue-800 dark:text-blue-300">
                              Prev Rep: {rec.previous_rep_name}
                            </span>
                          )}
                          {rec.previous_assignment_status &&
                            !rec.previous_rep_name && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">
                                {rec.previous_assignment_status.replace(
                                  /_/g,
                                  " ",
                                )}
                              </span>
                            )}
                        </div>
                      </div>

                      {/* Right: date + who */}
                      <div className="text-right shrink-0">
                        <div className="text-[11px] text-muted-foreground">
                          {fmtDateTime(rec.rescheduled_at)}
                        </div>
                        {rec.rescheduled_by && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            by{" "}
                            <span className="font-medium text-foreground">
                              {rec.rescheduled_by}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-3 rounded-lg border bg-card p-4 space-y-3">
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Previous Assignments (before reschedule)
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <DetailItem
                            label="Representative"
                            value={rec.previous_rep_name}
                          />
                          <DetailItem
                            label="Decision"
                            value={rec.previous_decision}
                          />
                          <DetailItem
                            label="MR Team"
                            value={rec.previous_mr_team}
                          />
                          <DetailItem
                            label="Brief"
                            value={rec.previous_brief}
                          />
                          <DetailItem
                            label="MR Status"
                            value={rec.previous_mr_status}
                          />
                          <DetailItem label="ALJ" value={rec.previous_alj} />
                          <DetailItem
                            label="Assignment Status"
                            value={
                              rec.previous_assignment_status
                                ? rec.previous_assignment_status.replace(
                                    /_/g,
                                    " ",
                                  )
                                : null
                            }
                          />
                        </div>
                        <div className="text-[10px] text-muted-foreground pt-1 border-t">
                          Hearing ID: {rec.hearing_id} • Rescheduled{" "}
                          {fmtDateTime(rec.rescheduled_at)}
                          {rec.rescheduled_by && ` by ${rec.rescheduled_by}`}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between border-t px-5 py-2.5 shrink-0">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page <= 1 || loading}
              onClick={() => goPage(page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page >= totalPages || loading}
              onClick={() => goPage(page + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Small helper for the expanded detail view
function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div
        className={cn(
          "text-xs mt-0.5",
          value
            ? "font-medium text-foreground"
            : "text-muted-foreground/50 italic",
        )}
      >
        {value || "—"}
      </div>
    </div>
  );
}

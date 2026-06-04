"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X as XIcon, Loader2, History, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchHearingHistory,
  type HearingHistoryEntry,
} from "@/app/(dashboard)/hearing-history-actions";
import {
  avatarColor,
  getInitials,
  titleCaseAction,
} from "@/lib/activity-avatar";

// Fallback chip color for any action without an explicit entry in
// `actionColors`. Keeps unknown action types readable.
const DEFAULT_CHIP =
  "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type DatePreset = "all" | "7d" | "30d" | "month" | "custom";

// Resolve the active date preset / custom inputs to an inclusive ms range.
// Returns null when no date filtering applies ("all time").
function dateRangeBounds(
  preset: DatePreset,
  from: string,
  to: string,
): { min: number; max: number } | null {
  if (preset === "all") return null;
  const now = Date.now();
  if (preset === "7d") return { min: now - 7 * 86400000, max: now };
  if (preset === "30d") return { min: now - 30 * 86400000, max: now };
  if (preset === "month") {
    const d = new Date();
    return { min: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), max: now };
  }
  // custom — open-ended on either side if the matching input is blank
  const min = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
  const max = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
  return { min, max };
}

export interface HearingHistoryModalProps {
  /** Hearing scope. Required unless `customFetcher` is provided (in which
   *  case the caller handles entity scoping and this may be 0). */
  hearingId: number;
  /** Entity name shown under the title (claimant, portal client, etc.). */
  claimant: string;
  /** Modal heading, e.g. "Rep History" / "Decision History". */
  title: string;
  /** Action allow-list passed to fetchHearingHistory. Omit for full trail.
   *  Ignored when `customFetcher` is provided. */
  actions?: string[];
  /** Optional description ILIKE filter, e.g. "Decision:%". Ignored when
   *  `customFetcher` is provided. */
  descriptionLike?: string;
  /** Override the default fetchHearingHistory call. When provided, the
   *  modal uses this to load entries — useful for entities that don't live
   *  in the hearings table (e.g. patient-portal). Must return an array of
   *  HearingHistoryEntry-shaped objects, sorted newest first. */
  customFetcher?: () => Promise<HearingHistoryEntry[]>;
  /** Per-action chip color classes. */
  actionColors?: Record<string, string>;
  /** Per-action human label for the chip. Falls back to the raw action. */
  actionLabels?: Record<string, string>;
  /** Footer note. Defaults to the hybrid-match disclaimer. */
  footerNote?: string;
  /** Show a client-side search box that filters the loaded entries. */
  searchable?: boolean;
  /** Show a date-range filter (preset dropdown + custom range). */
  dateFilterable?: boolean;
  /** Use a wider modal — handy for the full audit trail. */
  wide?: boolean;
  onClose: () => void;
}

export function HearingHistoryModal({
  hearingId,
  claimant,
  title,
  actions,
  descriptionLike,
  customFetcher,
  actionColors,
  actionLabels,
  footerNote,
  searchable = false,
  dateFilterable = false,
  wide = false,
  onClose,
}: HearingHistoryModalProps) {
  const [entries, setEntries] = useState<HearingHistoryEntry[] | null>(null);
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    let cancelled = false;
    const fetcher = customFetcher
      ? customFetcher()
      : fetchHearingHistory(hearingId, { actions, descriptionLike });
    fetcher.then((res) => {
      if (!cancelled) setEntries(res);
    });
    return () => {
      cancelled = true;
    };
    // actions / descriptionLike / customFetcher are config props — stable
    // per caller, so the hearingId-only dep is intentional (avoids
    // array-identity / function-identity refetch loops).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hearingId]);

  // Client-side filter over the loaded set — search (description / action
  // label / user) AND the date range. Both compose.
  const filtered = useMemo(() => {
    if (!entries) return null;
    const q = search.trim().toLowerCase();
    const bounds = dateFilterable
      ? dateRangeBounds(datePreset, dateFrom, dateTo)
      : null;
    return entries.filter((e) => {
      if (q) {
        const label = (actionLabels?.[e.action] ?? e.action).toLowerCase();
        const matches =
          e.description.toLowerCase().includes(q) ||
          label.includes(q) ||
          (e.userName ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (bounds) {
        const t = new Date(e.createdAt).getTime();
        if (isNaN(t) || t < bounds.min || t > bounds.max) return false;
      }
      return true;
    });
  }, [
    entries,
    search,
    actionLabels,
    dateFilterable,
    datePreset,
    dateFrom,
    dateTo,
  ]);

  return createPortal(
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        // Stop the click from bubbling through the React tree to a parent
        // modal's backdrop (this modal is often opened from inside another
        // modal, e.g. the PHD DetailsModal). Without this, dismissing the
        // history modal would also close the modal underneath it.
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className={cn(
          "w-full max-h-[80vh] flex flex-col rounded-xl border bg-card shadow-2xl",
          wide ? "max-w-2xl" : "max-w-lg",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">{title}</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-xs">
                {claimant}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {(searchable || dateFilterable) && (
          <div className="border-b px-5 py-2 shrink-0 space-y-2">
            {searchable && (
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search action, description, user..."
                  className="w-full rounded-md border bg-background pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
            )}
            {dateFilterable && (
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={datePreset}
                  onChange={(e) =>
                    setDatePreset(e.target.value as DatePreset)
                  }
                  className="h-7 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  <option value="all">All time</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="month">This month</option>
                  <option value="custom">Custom range...</option>
                </select>
                {datePreset === "custom" && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-7 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      to
                    </span>
                    <input
                      type="date"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-7 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto px-5 py-3">
          {filtered === null ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-6 text-center">
              {search.trim() || datePreset !== "all"
                ? "No entries match the current filters."
                : "No history found for this hearing."}
            </p>
          ) : (
            <div className="divide-y divide-border/50">
              {filtered.map((e) => {
                const author = e.userName ?? "System";
                return (
                  <div
                    key={e.id}
                    className="flex items-start gap-3 px-2 py-3 hover:bg-muted/30"
                  >
                    {/* Avatar — colored circle with initials. */}
                    <div
                      className={cn(
                        "h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white mt-0.5",
                        avatarColor(author),
                      )}
                    >
                      {getInitials(author)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-xs font-semibold text-foreground">
                          {author}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                            actionColors?.[e.action] ?? DEFAULT_CHIP,
                          )}
                        >
                          {actionLabels?.[e.action] ?? titleCaseAction(e.action)}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                          {formatTimestamp(e.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {e.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t px-5 py-2 text-[10px] text-muted-foreground bg-muted/30 shrink-0 flex items-center justify-between gap-2">
          <span>
            {footerNote ??
              "New entries match directly to this hearing. Older entries (before the audit-trail upgrade) fall back to claimant-name match and may include same-named hearings — disambiguate by date."}
          </span>
          {filtered && filtered.length > 0 && (
            <span className="shrink-0 tabular-nums">
              {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

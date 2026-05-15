"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X as XIcon, Loader2, History } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchRepHistoryForHearing,
  type RepHistoryEntry,
} from "@/app/(dashboard)/representative-docs/actions";

const ACTION_STYLES: Record<string, string> = {
  rep_assigned:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  rep_unassigned:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  rep_auto_assigned:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

const ACTION_LABELS: Record<string, string> = {
  rep_assigned: "Assigned",
  rep_unassigned: "Unassigned",
  rep_auto_assigned: "Auto-assigned",
};

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

export function RepHistoryModal({
  hearingId,
  claimant,
  onClose,
}: {
  hearingId: number;
  claimant: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<RepHistoryEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRepHistoryForHearing(hearingId).then((res) => {
      if (!cancelled) setEntries(res);
    });
    return () => {
      cancelled = true;
    };
  }, [hearingId]);

  return createPortal(
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">Rep History</h2>
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

        <div className="flex-1 overflow-auto px-5 py-3">
          {entries === null ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-6 text-center">
              No representative assignment history found for this hearing.
            </p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="rounded-md border bg-background px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold",
                        ACTION_STYLES[e.action] ??
                          "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
                      )}
                    >
                      {ACTION_LABELS[e.action] ?? e.action}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {formatTimestamp(e.createdAt)}
                    </span>
                    {e.userName && (
                      <span className="text-[10px] text-muted-foreground ml-auto truncate">
                        by {e.userName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-foreground leading-snug">
                    {e.description}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t px-5 py-2 text-[10px] text-muted-foreground bg-muted/30 shrink-0">
          New entries are matched directly to this hearing. Older entries
          (before the audit-trail upgrade) fall back to claimant-name match
          and may include same-named hearings — disambiguate by date.
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import { X as XIcon, Search, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClaimantCopyButton } from "@/components/ui/claimant-copy-button";
import {
  fetchPostHrgCompletedRecords,
  reopenPostHrgDevRecord,
  type PostHrgDevRow,
  type PostHrgRecordType,
} from "@/app/(dashboard)/post-hrg-development/actions";

// ─── PostHrgCompletedModal ─────────────────────────────────────────────────
// Lists every PHD row at a given terminal status ("Completed" or
// "Records Closed"). Per-row "Reopen" sets status back to "In Progress" and
// removes the entry from this list (the main grid will pick it up on the next
// refetch). Generalized via the `status` prop so a single modal serves both
// terminal-status buckets.

type TerminalStatus = "Completed" | "Records Closed";

// Per-status presentation — title icon, body copy, the "…At" column label.
const STATUS_META: Record<
  TerminalStatus,
  { icon: string; noun: string; atLabel: string }
> = {
  Completed: { icon: "✅", noun: "completed", atLabel: "Completed At" },
  "Records Closed": {
    icon: "📁",
    noun: "records-closed",
    atLabel: "Closed At",
  },
};

interface Props {
  open: boolean;
  recordType: PostHrgRecordType | "all";
  /** Which terminal status this modal lists. Defaults to "Completed". */
  status?: TerminalStatus;
  onClose: () => void;
  // Called after a successful reopen so the parent can refetch the main grid
  // and decrement its count badge.
  onReopen?: (id: number) => void;
}

export function PostHrgCompletedModal({
  open,
  recordType,
  status = "Completed",
  onClose,
  onReopen,
}: Props) {
  const [records, setRecords] = useState<PostHrgDevRow[]>([]);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [loading, startTransition] = useTransition();

  const meta = STATUS_META[status];

  const load = useCallback(() => {
    startTransition(async () => {
      const rows = await fetchPostHrgCompletedRecords(recordType, status);
      setRecords(rows);
    });
  }, [recordType, status]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!open) return null;

  const handleReopen = async (id: number) => {
    setBusyId(id);
    try {
      const r = await reopenPostHrgDevRecord(id);
      if (r.success) {
        setRecords((prev) => prev.filter((rec) => rec.id !== id));
        onReopen?.(id);
      }
    } finally {
      setBusyId(null);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? records.filter((r) => {
        const haystack = [
          r.claimant,
          r.assigned_rep,
          r.person_responsible,
          r.type_of_docs_needed,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
    : records;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-sm font-semibold">
              {meta.icon} {status} Records ({records.length})
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Hidden from the main grid. Click <strong>Reopen</strong> to
              restore a record (status switches to In Progress).
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 border-b px-5 py-2.5 shrink-0">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search claimant, rep, responsible, docs needed..."
            className="flex-1 h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading {meta.noun} records...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {records.length === 0
                ? `No ${meta.noun} records yet.`
                : "No matches for your search."}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">
                    Claimant
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">Type</th>
                  <th className="px-3 py-2 text-left font-semibold">
                    Hearing Date
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">Rep</th>
                  <th className="px-3 py-2 text-left font-semibold">
                    Responsible
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">
                    Docs Needed
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">
                    {meta.atLabel}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 min-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        {r.claimant_link ? (
                          <a
                            href={r.claimant_link}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {r.claimant}
                          </a>
                        ) : (
                          <span className="truncate text-xs font-medium text-foreground">
                            {r.claimant}
                          </span>
                        )}
                        <ClaimantCopyButton
                          name={r.claimant}
                          link={r.claimant_link}
                        />
                      </div>
                      {(r.claim_type || r.chronicle_link) && (
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                          {r.claim_type && (
                            <span className="truncate">{r.claim_type}</span>
                          )}
                          {r.chronicle_link && (
                            <a
                              href={r.chronicle_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-violet-600 hover:underline dark:text-violet-400"
                            >
                              Chronicle
                            </a>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide",
                          r.record_type === "MR"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                            : r.record_type === "REP"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                              : "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
                        )}
                      >
                        {r.record_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.hearing_date || "—"}
                    </td>
                    <td className="px-3 py-2">{r.assigned_rep || "—"}</td>
                    <td className="px-3 py-2">{r.person_responsible || "—"}</td>
                    <td className="px-3 py-2">
                      <span className="text-muted-foreground">
                        {r.type_of_docs_needed || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums text-[10px]">
                      {/* Prefer completed_at — set by the DB trigger when
                          status moved to Completed. Falls back to updated_at
                          for rows that pre-date the migration or didn't get
                          backfilled (defensive; should be rare). */}
                      {(() => {
                        const at = r.completed_at ?? r.updated_at;
                        return at
                          ? new Date(at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "—";
                      })()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleReopen(r.id)}
                        disabled={busyId === r.id}
                        className={cn(
                          "inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-semibold border transition-colors",
                          "border-blue-300 text-blue-700 hover:bg-blue-100",
                          "dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/40",
                          "disabled:opacity-50 disabled:cursor-not-allowed",
                        )}
                      >
                        {busyId === r.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3" />
                        )}
                        Reopen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-5 py-3 shrink-0 bg-muted/30">
          <p className="text-[11px] text-muted-foreground">
            {filtered.length === records.length
              ? `${records.length} record${records.length === 1 ? "" : "s"}`
              : `${filtered.length} of ${records.length} match`}
          </p>
          <button
            onClick={onClose}
            className="h-8 px-4 rounded-md border text-xs hover:bg-muted transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

import { useState } from "react";
import { ClipboardList, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "./modal-shell";
import {
  bulkCreatePostHrgFromHearings,
  type PostHrgRecordType,
  type BulkCreatePostHrgResult,
} from "@/app/(dashboard)/post-hrg-development/actions";

interface AddToPostHrgModalProps {
  open: boolean;
  onClose: () => void;
  hearingIds: number[];
  userId: number | null;
  onDone?: (result: BulkCreatePostHrgResult) => void;
}

const TYPE_OPTIONS: {
  value: PostHrgRecordType;
  label: string;
  description: string;
}[] = [
  { value: "MR", label: "MR", description: "Medical Records" },
  { value: "POST_HRG", label: "Post HRG", description: "Post-hearing dev" },
  { value: "REP", label: "REP", description: "Representative work" },
];

const MAX_PER_TYPE = 20;

export function AddToPostHrgModal({
  open,
  onClose,
  hearingIds,
  userId,
  onDone,
}: AddToPostHrgModalProps) {
  // Count of records to create per record_type, per hearing.
  // Multiple records of the same type (e.g. 2 REP rows for one hearing) are
  // first-class — the unique index on (hearing_id, record_type) was relaxed.
  const [counts, setCounts] = useState<Record<PostHrgRecordType, number>>({
    MR: 0,
    POST_HRG: 0,
    REP: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const setCount = (t: PostHrgRecordType, n: number) => {
    const clamped = Math.max(0, Math.min(MAX_PER_TYPE, Math.floor(n) || 0));
    setCounts((prev) => ({ ...prev, [t]: clamped }));
  };

  const totalPerHearing =
    counts.MR + counts.POST_HRG + counts.REP;
  const totalRows = hearingIds.length * totalPerHearing;

  const handleConfirm = async () => {
    if (totalPerHearing === 0 || hearingIds.length === 0) return;
    setSubmitting(true);
    try {
      // Expand counts into a flat array of types — one entry per row to create.
      // CROSS JOIN with hearings on the server then yields N rows per (hearing, type).
      const types: PostHrgRecordType[] = [];
      (Object.keys(counts) as PostHrgRecordType[]).forEach((t) => {
        for (let i = 0; i < counts[t]; i++) types.push(t);
      });
      const result = await bulkCreatePostHrgFromHearings(
        hearingIds,
        types,
        userId,
      );
      onDone?.(result);
      setCounts({ MR: 0, POST_HRG: 0, REP: 0 });
      onClose();
    } catch (e) {
      console.error("[bulk-add-post-hrg] failed:", e);
      alert(e instanceof Error ? e.message : "Failed to add to Post HRG");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      title="Add to Post HRG Page"
      icon={ClipboardList}
      onClose={submitting ? () => {} : onClose}
      maxWidth="max-w-md"
    >
      <div className="px-5 py-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Choose how many records of each type to create for{" "}
          <span className="font-semibold text-foreground">
            {hearingIds.length}
          </span>{" "}
          selected hearing{hearingIds.length === 1 ? "" : "s"}. Multiple
          records of the same type are allowed (e.g. two REP workflows on the
          same hearing).
        </p>

        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          {TYPE_OPTIONS.map((opt) => {
            const value = counts[opt.value];
            return (
              <div
                key={opt.value}
                className="flex items-center justify-between gap-3 rounded-sm px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{opt.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {opt.description}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCount(opt.value, value - 1)}
                    disabled={submitting || value <= 0}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-background text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label={`Decrease ${opt.label}`}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_PER_TYPE}
                    value={value}
                    onChange={(e) =>
                      setCount(opt.value, parseInt(e.target.value || "0", 10))
                    }
                    disabled={submitting}
                    className="h-7 w-12 rounded-md border bg-background px-1 text-center text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-40"
                  />
                  <button
                    type="button"
                    onClick={() => setCount(opt.value, value + 1)}
                    disabled={submitting || value >= MAX_PER_TYPE}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-background text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label={`Increase ${opt.label}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-xs text-muted-foreground">
          {totalPerHearing === 0 ? (
            <span>No records will be created — set a count above.</span>
          ) : (
            <>
              Will create{" "}
              <span className="font-semibold text-foreground">
                {totalRows}
              </span>{" "}
              record{totalRows === 1 ? "" : "s"} total
              {hearingIds.length > 1 && (
                <>
                  {" "}
                  ({totalPerHearing} per hearing × {hearingIds.length}{" "}
                  hearings)
                </>
              )}
              .
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={submitting || totalPerHearing === 0}
          >
            {submitting ? "Adding..." : "Add to Post HRG"}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

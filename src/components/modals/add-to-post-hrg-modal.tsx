"use client";

import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

const TYPE_OPTIONS: { value: PostHrgRecordType; label: string }[] = [
  { value: "MR", label: "MR" },
  { value: "POST_HRG", label: "Post HRG" },
  { value: "REP", label: "REP" },
];

export function AddToPostHrgModal({
  open,
  onClose,
  hearingIds,
  userId,
  onDone,
}: AddToPostHrgModalProps) {
  const [selected, setSelected] = useState<Set<PostHrgRecordType>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const toggle = (t: PostHrgRecordType) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0 || hearingIds.length === 0) return;
    setSubmitting(true);
    try {
      const types = Array.from(selected);
      const result = await bulkCreatePostHrgFromHearings(
        hearingIds,
        types,
        userId,
      );
      onDone?.(result);
      setSelected(new Set());
      onClose();
    } catch (e) {
      console.error("[bulk-add-post-hrg] failed:", e);
      alert(e instanceof Error ? e.message : "Failed to add to Post HRG");
    } finally {
      setSubmitting(false);
    }
  };

  const totalRows = hearingIds.length * selected.size;

  return (
    <ModalShell
      title="Add to Post HRG Page"
      icon={ClipboardList}
      onClose={submitting ? () => {} : onClose}
      maxWidth="max-w-md"
    >
      <div className="px-5 py-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Create post-hearing records for{" "}
          <span className="font-semibold text-foreground">
            {hearingIds.length}
          </span>{" "}
          selected hearing{hearingIds.length === 1 ? "" : "s"}. Pick one or
          more categories — one record will be created per (hearing × type)
          combination.
        </p>

        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          {TYPE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-3 cursor-pointer select-none rounded-sm px-2 py-1.5 hover:bg-muted/60"
            >
              <Checkbox
                checked={selected.has(opt.value)}
                onCheckedChange={() => toggle(opt.value)}
                disabled={submitting}
              />
              <span className="text-sm font-medium">{opt.label}</span>
            </label>
          ))}
        </div>

        {selected.size > 0 && (
          <div className="text-xs text-muted-foreground">
            Will create up to{" "}
            <span className="font-semibold text-foreground">{totalRows}</span>{" "}
            record{totalRows === 1 ? "" : "s"}. Existing (hearing, type)
            combinations are skipped automatically.
          </div>
        )}

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
            disabled={submitting || selected.size === 0}
          >
            {submitting ? "Adding..." : "Add to Post HRG"}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

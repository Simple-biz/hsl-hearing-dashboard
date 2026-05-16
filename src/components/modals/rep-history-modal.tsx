"use client";

// Rep History — a thin config wrapper around the generic HearingHistoryModal.
// Pattern: each per-hearing history view is one small file like this that
// pins the action allow-list + chip styling, so call sites stay one-liners.

import { HearingHistoryModal } from "@/components/modals/hearing-history-modal";

const REP_ACTIONS = ["rep_assigned", "rep_unassigned", "rep_auto_assigned"];

const REP_ACTION_COLORS: Record<string, string> = {
  rep_assigned:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  rep_unassigned:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  rep_auto_assigned:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

const REP_ACTION_LABELS: Record<string, string> = {
  rep_assigned: "Assigned",
  rep_unassigned: "Unassigned",
  rep_auto_assigned: "Auto-assigned",
};

export function RepHistoryModal({
  hearingId,
  claimant,
  onClose,
}: {
  hearingId: number;
  claimant: string;
  onClose: () => void;
}) {
  return (
    <HearingHistoryModal
      hearingId={hearingId}
      claimant={claimant}
      title="Rep History"
      actions={REP_ACTIONS}
      actionColors={REP_ACTION_COLORS}
      actionLabels={REP_ACTION_LABELS}
      onClose={onClose}
    />
  );
}

"use client";

// Full Hearing Audit Trail — every activity_log entry tied to one hearing,
// newest first, searchable. A thin config wrapper around HearingHistoryModal
// with NO action filter (so it captures everything) plus a comprehensive
// color/label map. Unknown action types still render via the modal's
// default chip + raw action name.

import { HearingHistoryModal } from "@/components/modals/hearing-history-modal";

const EMERALD =
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
const AMBER =
  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
const VIOLET =
  "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400";
const BLUE = "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
const SKY = "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400";
const TEAL = "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400";
const ROSE = "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400";
const INDIGO =
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400";
const CYAN = "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400";
const ORANGE =
  "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";

const AUDIT_ACTION_COLORS: Record<string, string> = {
  // Rep assignment
  rep_assigned: EMERALD,
  rep_unassigned: AMBER,
  rep_auto_assigned: VIOLET,
  // Dashboard hearing edits
  field_updated: BLUE,
  status_assigned: ORANGE,
  // Dashboard post-HRG notes
  post_hrg_note_added: TEAL,
  post_hrg_note_edited: TEAL,
  post_hrg_note_deleted: ROSE,
  post_hrg_dev_phstatus_synced: SKY,
  // PHD record lifecycle
  post_hrg_dev_created: EMERALD,
  post_hrg_dev_auto_created: EMERALD,
  post_hrg_dev_updated: BLUE,
  post_hrg_dev_field_updated: BLUE,
  post_hrg_dev_deleted: ROSE,
  post_hrg_dev_reopened: AMBER,
  post_hrg_dev_cascade: VIOLET,
  post_hrg_dev_note_added: TEAL,
  post_hrg_dev_note_deleted: ROSE,
  // Rep docs
  rep_docs_field_updated: INDIGO,
  rep_docs_acknowledged: EMERALD,
  hearing_link_updated_from_repdocs: CYAN,
  // Hearing lifecycle
  hearing_created: EMERALD,
  hearing_deleted: ROSE,
  hearing_unarchived: SKY,
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  rep_assigned: "Rep Assigned",
  rep_unassigned: "Rep Unassigned",
  rep_auto_assigned: "Rep Auto-Assigned",
  field_updated: "Field Update",
  status_assigned: "Assignment Status",
  post_hrg_note_added: "Post-HRG Note +",
  post_hrg_note_edited: "Post-HRG Note Edit",
  post_hrg_note_deleted: "Post-HRG Note −",
  post_hrg_dev_phstatus_synced: "PH Status Sync",
  post_hrg_dev_created: "PHD Created",
  post_hrg_dev_auto_created: "PHD Auto-Created",
  post_hrg_dev_updated: "PHD Updated",
  post_hrg_dev_field_updated: "PHD Field Update",
  post_hrg_dev_deleted: "PHD Deleted",
  post_hrg_dev_reopened: "PHD Reopened",
  post_hrg_dev_cascade: "PHD Cascade",
  post_hrg_dev_note_added: "PHD Note +",
  post_hrg_dev_note_deleted: "PHD Note −",
  rep_docs_field_updated: "Rep Docs",
  rep_docs_acknowledged: "Rep Docs Ack",
  hearing_link_updated_from_repdocs: "Link Update",
  hearing_created: "Hearing Created",
  hearing_deleted: "Hearing Deleted",
  hearing_unarchived: "Hearing Unarchived",
};

export function HearingAuditTrailModal({
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
      title="Hearing Audit Trail"
      // No `actions` filter — show every tracked activity for this hearing.
      actionColors={AUDIT_ACTION_COLORS}
      actionLabels={AUDIT_ACTION_LABELS}
      searchable
      dateFilterable
      wide
      onClose={onClose}
    />
  );
}

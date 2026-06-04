"use client";

// Per-row audit trail for a single patient-portal entry. Thin wrapper around
// HearingHistoryModal — same UX (search, date filter, avatar + chip + body)
// but the fetcher calls getPortalActivityLog so the data comes from the
// portal-scoped activity_log query (which matches entries via the client
// name in the description, since the portal doesn't carry a hearing_id).
//
// Mirrors HearingAuditTrailModal's role for the dashboard.

import {
  HearingHistoryModal,
  type HearingHistoryEntry,
} from "@/components/modals/hearing-history-modal";
import { getPortalActivityLog } from "@/app/(dashboard)/patient-portal/action";

const EMERALD =
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
const ROSE = "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400";
const BLUE = "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
const TEAL = "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400";
const VIOLET =
  "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400";
const CYAN = "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400";
const ORANGE =
  "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
const SKY = "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400";

const ACTION_COLORS: Record<string, string> = {
  portal_entry_created: EMERALD,
  portal_entry_deleted: ROSE,
  portal_field_updated: BLUE,
  portal_specialist_assigned: VIOLET,
  portal_bulk_import: CYAN,
  portal_note_added: TEAL,
  portal_note_deleted: ROSE,
  portal_note_edited: ORANGE,
  // Cross-page sync echoes that mention this client also show up here.
  field_updated: SKY,
};

const ACTION_LABELS: Record<string, string> = {
  portal_entry_created: "Entry Created",
  portal_entry_deleted: "Entry Deleted",
  portal_field_updated: "Field Edit",
  portal_specialist_assigned: "Specialist Assigned",
  portal_bulk_import: "Bulk Import",
  portal_note_added: "Note Added",
  portal_note_deleted: "Note Deleted",
  portal_note_edited: "Note Edited",
};

export function PortalEntryAuditTrailModal({
  entryId,
  clientName,
  onClose,
}: {
  entryId: number;
  clientName: string;
  onClose: () => void;
}) {
  return (
    <HearingHistoryModal
      // Required by the shared modal but unused when customFetcher is provided.
      hearingId={0}
      claimant={clientName}
      title="Entry Activity Log"
      customFetcher={async () => {
        // First page only — getPortalActivityLog caps at 50/page. Most entries
        // have at most a handful of log rows, so this is enough for the
        // common case; if the entry has > 50 events the user sees the most
        // recent and we'd extend with pagination later.
        const res = await getPortalActivityLog({ page: 1, entry_id: entryId });
        return res.entries.map<HearingHistoryEntry>((e) => ({
          id: e.id,
          action: e.action,
          description: e.details,
          userName: e.user_name,
          createdAt: e.created_at,
        }));
      }}
      actionColors={ACTION_COLORS}
      actionLabels={ACTION_LABELS}
      searchable
      dateFilterable
      wide
      onClose={onClose}
    />
  );
}

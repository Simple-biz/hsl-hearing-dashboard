// Shared helpers for the activity-log / audit-trail row visual treatment
// (colored circle with user initials, name-first layout, badge + timestamp).
//
// Used by:
//   - components/modals/activity-log-modal.tsx          — dashboard/rep-docs/MR/etc.
//   - components/modals/post-hrg-activity-modal.tsx     — PHD page
//   - components/modals/hearing-history-modal.tsx       — per-hearing audit
//   - components/modals/rep-docs-changes-modal.tsx      — rep-docs change feed
//
// Keeping the hash + palette in one file guarantees a given user gets the
// same avatar color everywhere their actions appear.

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
] as const;

/** Deterministic name → color hash. Same input always returns the same color. */
export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** Up to two uppercase initials from a full name. Handles single names too. */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Title-case fallback for action keys not present in ACTIVITY_ACTION_LABELS.
 * Turns "snake_case_action" into "Snake Case Action".
 */
export function titleCaseAction(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Friendly display labels for action keys. Used by every activity-log /
 * audit-trail surface in the app so a given action shows the same human
 * label everywhere (e.g. `field_updated` → "Field Edit", not "FIELD UPDATED"
 * in one place and "Field Updated" in another).
 *
 * Falls back to titleCaseAction() via labelForAction() for unknown keys.
 */
export const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  user_login: "Login",
  user_logout: "Logout",
  rep_assigned: "Rep Assigned",
  rep_unassigned: "Rep Unassigned",
  rep_auto_assigned: "Auto-Assigned",
  batch_auto_assign: "Batch Auto-Assign",
  bulk_unassign: "Bulk Unassign",
  status_assigned: "Assignment Status",
  email_sent: "Email Sent",
  email_failed: "Email Failed",
  bulk_email: "Bulk Email",
  field_updated: "Field Edit",
  rep_docs_field_updated: "Field Edit",
  post_hrg_dev_field_updated: "Field Edit",
  post_hrg_note_added: "Note Added",
  post_hrg_note_deleted: "Note Deleted",
  post_hrg_deadline_updated: "Deadline Updated",
  post_hrg_dev_created: "Created",
  post_hrg_dev_auto_created: "Auto-Created",
  post_hrg_dev_acknowledged: "Acknowledged",
  post_hrg_dev_deleted: "Deleted",
  post_hrg_dev_import: "Imported",
  post_hrg_dev_phstatus_synced: "PH Status Synced",
  post_hrg_dev_status_synced: "Dev Status Synced",
  hearing_updated: "Hearing Updated",
  hearing_created: "Hearing Created",
  hearing_deleted: "Hearing Deleted",
  hearing_imported: "Hearing Imported",
  bulk_delete: "Bulk Delete",
  bulk_migrate: "Bulk Migrate",
  schedule_updated: "Schedule Updated",
  schedule_lock_override: "Schedule Lock Override",
  rep_created: "Rep Created",
  rep_updated: "Rep Updated",
  rep_deleted: "Rep Deleted",
  token_revoked: "Token Revoked",
  api_key_created: "API Key Created",
  api_key_revoked: "API Key Revoked",
  archive_chronicles: "Archive Chronicles",
  unarchive_chronicles: "Unarchive Chronicles",
  hearing_archived: "Hearing Archived",
  hearing_unarchived: "Hearing Unarchived",
  rep_docs_acknowledged: "Acknowledged",
  // Patient Portal
  portal_entry_created: "Entry Created",
  portal_entry_deleted: "Entry Deleted",
  portal_field_updated: "Field Edit",
  portal_specialist_assigned: "MR Specialist Assigned",
  portal_bulk_import: "Bulk Import",
  portal_note_added: "Note Added",
  portal_note_deleted: "Note Deleted",
};

/** Look up a friendly label; falls back to title-cased snake_case. */
export function labelForAction(action: string): string {
  return ACTIVITY_ACTION_LABELS[action] ?? titleCaseAction(action);
}

/**
 * Per-page allowlist of action keys to scope each page's Activity Log to
 * the work that page actually does. Admin is intentionally absent — the
 * admin activity log is the global view that shows every action.
 *
 * Cross-cutting syncs (e.g. post_hrg_dev_phstatus_synced fires when a
 * dashboard edit propagates to PHD) appear in BOTH the originating page's
 * scope and the target page's dedicated log — set membership is inclusive,
 * not mutually exclusive.
 */
export const PAGE_ACTION_SCOPES: Record<string, readonly string[]> = {
  dashboard: [
    // Hearing field edits + assignment lifecycle
    "field_updated",
    "rep_assigned",
    "rep_unassigned",
    "rep_auto_assigned",
    "batch_auto_assign",
    "bulk_unassign",
    "status_assigned",
    // Hearing-row lifecycle
    "hearing_created",
    "hearing_updated",
    "hearing_deleted",
    "hearing_archived",
    "hearing_unarchived",
    "hearing_rescheduled",
    // Bulk hearing operations
    "bulk_update",
    "bulk_import",
    "bulk_email",
    "bulk_migrate",
    "bulk_migrate_to_raw",
    "import_raw_hearings",
    "clear_raw_hearings",
    // Post HRG notes / deadline edited from the dashboard side
    "post_hrg_note_added",
    "post_hrg_note_deleted",
    "post_hrg_note_edited",
    "post_hrg_deadline_updated",
    // Cross-page syncs initiated from dashboard
    "post_hrg_dev_phstatus_synced",
    "post_hrg_dev_status_synced",
    // Email + scheduling (dashboard is the hearings hub)
    "email_sent",
    "email_failed",
    "hearing_reminder_sent",
    "schedule_updated",
    "schedule_lock",
    "schedule_unlock",
    "schedule_save",
    "schedule_reset",
    "schedule_lock_override",
    "schedule_token_created",
    "schedule_token_revoked",
    "schedule_link_emailed",
    // Archive
    "archive_chronicles",
    "unarchive_chronicles",
  ],
  representative_docs: [
    "rep_docs_field_updated",
    "rep_docs_acknowledged",
    "rep_docs_imported",
  ],
  medical_records: [
    "mr_link_updated",
    "mr_status_updated",
    "mr_team_assigned",
    "task_assigned_updated",
    "five_day_notice_updated",
  ],
  rfc: [
    "rfc_field_updated",
    "rfc_import",
    "rfc_entry_created",
    "rfc_entry_deleted",
  ],
  patient_portal: [
    "portal_bulk_import",
    "portal_field_updated",
    "portal_specialist_assigned",
    "portal_entry_created",
    "portal_entry_deleted",
  ],
};

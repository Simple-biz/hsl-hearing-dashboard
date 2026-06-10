// types.ts — interfaces and sync helpers for the Patient Portal page.
// Kept separate from action.ts so "use server" only exports async functions.

/** All action keys this page emits — used to scope the activity log modal. */
export const PORTAL_ACTIONS = [
  "portal_entry_created",
  "portal_field_updated",
  "portal_specialist_assigned",
  "portal_entry_deleted",
  "portal_bulk_import",
  "portal_note_added",
  "portal_note_deleted",
];

export type PortalUserRole =
  | "system_admin"
  | "admin"
  | "manager"
  | "mr_admin"
  | "mr_lead"
  | "mr_agent"
  | "hearings_admin";

export interface PortalPermissions {
  canManage: boolean; // system_admin | admin | manager | mr_admin | mr_lead | hearings_admin
  canEdit: boolean; // system_admin | admin | manager | mr_admin | mr_lead | mr_agent | hearings_admin
  canAssignSpecialist: boolean; // system_admin | admin | manager | mr_admin | mr_lead | mr_agent
  /** Approved by TL flip — tighter than canEdit by design. Only the highest
   *  admin tier can mark entries as TL-approved (or un-approve them). */
  canSetApproval: boolean; // system_admin | admin | mr_admin
  // ── Per-action gates (admin-overridable via Field Access modal) ────────
  // These default to the broader canEdit / canManage flags above, so the
  // existing UX is preserved when no override exists. Admin overrides
  // (user_field_access rows with page_key="patient_portal") flip each
  // independently — e.g. an mr_agent can be denied "Create Portal Entry"
  // while keeping "Edit Portal Entry".
  /** Add Entry button + addPortalEntry mutation. Defaults to canEdit. */
  canCreateEntry: boolean;
  /** Pencil edit + updatePortalEntry mutation. Defaults to canEdit. */
  canEditEntry: boolean;
  /** Trash delete + deletePortalEntry mutation. Defaults to canManage. */
  canDeleteEntry: boolean;
}

/** Source of truth for `canSetApproval` — kept as a const so the server
 *  guards in action.ts and the UI gates in the client agree on the list. */
export const APPROVAL_ROLES = ["system_admin", "admin", "mr_admin"] as const;

export function derivePortalPermissions(
  role: PortalUserRole,
): PortalPermissions {
  return {
    canManage: [
      "system_admin",
      "admin",
      "manager",
      "mr_admin",
      "mr_lead",
      "hearings_admin",
    ].includes(role),
    canEdit: [
      "system_admin",
      "admin",
      "manager",
      "mr_admin",
      "mr_lead",
      "mr_agent",
      "hearings_admin",
    ].includes(role),
    canAssignSpecialist: [
      "system_admin",
      "admin",
      "manager",
      "mr_admin",
      "mr_lead",
      "mr_agent",
    ].includes(role),
    canSetApproval: (APPROVAL_ROLES as readonly string[]).includes(role),
    // Per-action defaults — recomputed locally so they don't depend on
    // property order. Admin overrides flip these in getPortalPageData().
    canCreateEntry: [
      "system_admin",
      "admin",
      "manager",
      "mr_admin",
      "mr_lead",
      "mr_agent",
      "hearings_admin",
    ].includes(role),
    canEditEntry: [
      "system_admin",
      "admin",
      "manager",
      "mr_admin",
      "mr_lead",
      "mr_agent",
      "hearings_admin",
    ].includes(role),
    canDeleteEntry: [
      "system_admin",
      "admin",
      "manager",
      "mr_admin",
      "mr_lead",
      "hearings_admin",
    ].includes(role),
  };
}

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface MrSpecialist {
  id: number;
  name: string;
  bg_color: string | null;
  display_order: number;
  is_active: boolean;
}

export interface PortalNote {
  user: string;
  date: string; // ISO datetime
  note: string;
}

export interface PortalEntry {
  id: number;
  entry_date: string | null;
  hearing_date: string | null;
  client_name: string;
  provider: string | null;
  mycase_link: string | null;
  portal_link: string | null;
  portal_username: string | null;
  portal_password: string | null;
  got_mr: boolean;
  approved_by_tl: boolean;
  /** ISO timestamp stamped when approved_by_tl was toggled to true; cleared
   *  (null) when toggled back to false. NULL for legacy rows approved before
   *  the column was added. */
  approved_by_tl_at: string | null;
  mr_specialist_id: number | null;
  hearing_id: number | null;
  username_notes: PortalNote[];
  password_notes: PortalNote[];
  approved_notes: PortalNote[];
  created_at: string;
  updated_at: string;
  created_by: number | null;
  // Joined from mr_specialists
  specialist_name: string | null;
  specialist_color: string | null;
  got_mr_notes: PortalNote[];
  // Joined live from hearings (when hearing_id is set) — chronicle_link mirrors
  // the dashboard's value, so edits there flow through to the patient portal.
  chronicle_link: string | null;
  claim_type: string | null;
}

export interface PortalStats {
  total: number;
  with_portal: number;
  got_mr: number;
  approved: number;
}

export interface PortalFilters {
  search?: string;
  mr_status?: "got" | "pending" | "";
  /** Month abbreviation: "Jan" | "Feb" | ... | "Dec" or "". Filters on
   *  `created_at`. Independent of year, so "Jan" alone matches every January. */
  month?: string;
  /** 4-digit year string. Filters on `created_at`. */
  year?: string;
  /** Date-range preset matching the post-hrg-development pattern:
   *  "" | "yesterday" | "today" | "tomorrow" | "this-week" | "next-week"
   *  | "this-month" | "next-30" | "specific" | "custom". */
  date_preset?: string;
  /** ISO YYYY-MM-DD — used by `specific` (date_from holds the day) and
   *  `custom` (date_from is the start). */
  date_from?: string;
  /** ISO YYYY-MM-DD — used by `custom` (end of range). */
  date_to?: string;
  specialist?: string;
  /** "asc" / "desc" sort by created_at (Newest / Oldest First).
   *  "specialist_asc" / "specialist_desc" group rows by MR Specialist
   *  alphabetically (A→Z / Z→A) so entries with the same specialist appear
   *  consecutively. Unassigned rows always go to the bottom. Secondary sort
   *  is created_at DESC for stability. */
  sort_order?: "asc" | "desc" | "specialist_asc" | "specialist_desc";
  page?: number;
  per_page?: number | "all";
}

// ─── Report (per-MR-Specialist breakdown) ────────────────────────────────────

/** One row in the report modal's table — one per specialist plus an
 *  "unassigned" row (specialist_id IS NULL). Counts respect whatever filters
 *  are currently applied on the main page, EXCEPT the specialist filter
 *  (which would defeat the purpose of a per-specialist breakdown). */
export interface PortalReportRow {
  /** null = the (Unassigned) row. */
  specialist_id: number | null;
  /** null when specialist_id is null OR when the FK references a deleted
   *  specialist (defensive against historical orphans). */
  specialist_name: string | null;
  specialist_color: string | null;
  /** is_active flag from mr_specialists — surfaces inactive specialists who
   *  still have entries assigned. null when unassigned. */
  specialist_active: boolean | null;
  total: number;
  /** got_mr = true. */
  got_mr: number;
  /** got_mr = false. */
  pending_mr: number;
  /** Both portal_username AND portal_password are set (non-null, non-empty). */
  portal_set: number;
  /** approved_by_tl = true. */
  approved: number;
}

export interface PortalReportData {
  rows: PortalReportRow[];
}

export interface PortalPaginatedResult {
  entries: PortalEntry[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface PortalPageData {
  stats: PortalStats;
  specialists: MrSpecialist[];
  availableMonths: Array<{ val: string; label: string }>;
  permissions: PortalPermissions;
}

export interface PortalAddEntryInput {
  entry_date?: string | null;
  hearing_date?: string | null;
  client_name: string;
  provider?: string;
  mycase_link?: string;
  portal_link?: string;
  portal_username?: string;
  portal_password?: string;
  got_mr?: boolean;
  approved_by_tl?: boolean;
  /** Optional MR specialist assignment at creation time. Server-gated to the
   *  same roles allowed to assign via the inline dropdown. */
  mr_specialist_id?: number | null;
  /** FK to hearings.id when the entry was created from a claimant search.
   *  Enables live read of chronicle_link / claim_type via JOIN. */
  hearing_id?: number | null;
}

export interface ClaimantSearchResult {
  hearing_id: number;
  claimant: string;
  hearing_date: string | null;
  claim_type: string | null;
  claimant_link: string | null;
  chronicle_link: string | null;
}

export interface PortalActivityEntry {
  id: number;
  user_id: number;
  user_name: string | null;
  action: string;
  details: string;
  created_at: string;
}

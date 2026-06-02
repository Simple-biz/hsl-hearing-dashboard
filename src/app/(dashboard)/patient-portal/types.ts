// types.ts — interfaces and sync helpers for the Patient Portal page.
// Kept separate from action.ts so "use server" only exports async functions.

/** All action keys this page emits — used to scope the activity log modal. */
export const PORTAL_ACTIONS = [
  "portal_entry_created",
  "portal_field_updated",
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
}

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
  month?: string;
  specialist?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  per_page?: number | "all";
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

// types.ts — interfaces and sync helpers for the Patient Portal page.
// Kept separate from action.ts so "use server" only exports async functions.

export type PortalUserRole =
  | "admin" | "manager" | "mr_admin" | "mr_lead" | "mr_agent" | "hearings_admin";

export interface PortalPermissions {
  canManage: boolean;           // admin | manager | mr_admin | mr_lead | hearings_admin
  canEdit: boolean;             // admin | manager | mr_admin | mr_lead | mr_agent | hearings_admin
  canAssignSpecialist: boolean; // admin | mr_admin only
}

export function derivePortalPermissions(role: PortalUserRole): PortalPermissions {
  return {
    canManage: ["admin","manager","mr_admin","mr_lead","hearings_admin"].includes(role),
    canEdit: ["admin","manager","mr_admin","mr_lead","mr_agent","hearings_admin"].includes(role),
    canAssignSpecialist: ["admin","mr_admin"].includes(role),
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
  date: string;   // ISO datetime
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
  username_notes: PortalNote[];
  password_notes: PortalNote[];
  approved_notes: PortalNote[];
  created_at: string;
  updated_at: string;
  created_by: number | null;
  // Joined
  specialist_name: string | null;
  specialist_color: string | null;
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
}

export interface PortalActivityEntry {
  id: number;
  user_id: number;
  user_name: string | null;
  action: string;
  details: string;
  created_at: string;
}

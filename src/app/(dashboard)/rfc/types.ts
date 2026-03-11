// types.ts — interfaces and sync helpers for the RFC Documents page.
// Kept separate from action.ts because "use server" only allows async function exports.

// ─── Roles & Permissions ──────────────────────────────────────────────────────

export type RfcUserRole =
  | "admin" | "manager" | "mr_admin" | "mr_lead" | "mr_agent"
  | "hearings_admin" | "hearings_agent" | "post_hearing_admin" | "post_hearing_staff";

export interface RfcPermissions {
  canManage: boolean;     // admin | manager | mr_admin | mr_lead | hearings_admin
  canEdit: boolean;       // admin | manager | mr_admin | mr_lead | mr_agent | hearings_admin
  canAssignTeam: boolean; // admin | mr_admin only
}

export function deriveRfcPermissions(role: RfcUserRole): RfcPermissions {
  return {
    canManage:     ["admin", "manager", "mr_admin", "mr_lead", "hearings_admin"].includes(role),
    canEdit:       ["admin", "manager", "mr_admin", "mr_lead", "mr_agent", "hearings_admin"].includes(role),
    canAssignTeam: ["admin", "mr_admin"].includes(role),
  };
}

// ─── Entity Types ─────────────────────────────────────────────────────────────

export interface RfcEntry {
  id: number;
  entry_date: string | null;
  mr_team_id: number | null;
  hearing_date: string | null;
  client_name: string;
  document_type: string | null;
  provider_name: string | null;
  date_signed: string | null;
  mycase_link: string | null;
  method_received: string | null;
  date_received: string | null;
  filed_to_oho: boolean;
  approved_by_tl: boolean;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  // Joined from mr_teams
  team_name: string | null;
  team_color: string | null;
}

export interface RfcStats {
  total: number;
  filed: number;
  approved: number;
  pending: number;
}

export interface RfcDocumentType {
  value: string;
  label: string;
  color: string | null;
}

export interface RfcMethodOption {
  value: string;
  label: string;
  color: string | null;
}

export interface RfcMrTeam {
  id: number;
  team_name: string;
  team_color: string | null;
}

export interface RfcFilters {
  search?: string;
  status?: "filed" | "pending" | "approved" | "";
  month?: string;
  team?: string;
  doc_type?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  per_page?: number | "all";
}

export interface RfcPaginatedResult {
  entries: RfcEntry[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  stats: RfcStats;
}

export interface RfcPageData {
  stats: RfcStats;
  documentTypes: RfcDocumentType[];
  methodOptions: RfcMethodOption[];
  mrTeams: RfcMrTeam[];
  availableMonths: Array<{ val: string; label: string }>;
  permissions: RfcPermissions;
}

export interface RfcAddEntryInput {
  entry_date?: string | null;
  mr_team_id?: number | null;
  hearing_date?: string | null;
  client_name: string;
  document_type?: string;
  provider_name?: string;
  date_signed?: string | null;
  mycase_link?: string;
  method_received?: string;
  date_received?: string | null;
  filed_to_oho?: boolean;
  approved_by_tl?: boolean;
}

export interface RfcActivityLogEntry {
  id: number;
  user_id: number;
  user_name: string | null;
  action: string;
  details: string;
  created_at: string;
}

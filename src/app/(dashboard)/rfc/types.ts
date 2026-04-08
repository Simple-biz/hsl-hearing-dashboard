// types.ts — interfaces and sync helpers for the RFC Documents page.
// Kept separate from action.ts because "use server" only allows async function exports.

// ─── Roles & Permissions ──────────────────────────────────────────────────────

// Matches the canonical UserRole union in @/lib/roles.ts
export type RfcUserRole =
  | "system_admin"
  | "admin"
  | "manager"
  | "staff"
  | "rep"
  | "pre_hearing_staff"
  | "brief_agent"
  | "mr_admin"
  | "mr_agent"
  | "mr_lead"
  | "hearings_admin"
  | "hearings_agent"
  | "hearings_status_moa"
  | "hearings_docs_fee"
  | "hearings_docs"
  | "hearings_mc"
  | "hearings_brief"
  | "post_hearing_admin"
  | "post_hearing_staff";

// RFC page permissions (see PDF Part 3 / roles.ts RFC_PAGE_ACTIONS)
export interface RfcPermissions {
  canView: boolean; // system_admin | admin | manager | mr_admin | mr_lead | mr_agent
  canCreate: boolean; // system_admin | admin | manager | mr_admin | mr_lead
  canEdit: boolean; // system_admin | admin | manager | mr_admin | mr_lead | mr_agent
  canDelete: boolean; // system_admin | admin | manager
  canExport: boolean; // system_admin | admin | manager | mr_admin | mr_lead
  canManage: boolean; // system_admin | admin | manager | mr_admin | mr_lead (bulk/assign)
  canAssignTeam: boolean; // system_admin | admin | manager | mr_admin | mr_lead
}

export function deriveRfcPermissions(role: RfcUserRole): RfcPermissions {
  return {
    canView: [
      "system_admin",
      "admin",
      "manager",
      "mr_admin",
      "mr_lead",
      "mr_agent",
    ].includes(role),
    canCreate: [
      "system_admin",
      "admin",
      "manager",
      "mr_admin",
      "mr_lead",
    ].includes(role),
    canEdit: [
      "system_admin",
      "admin",
      "manager",
      "mr_admin",
      "mr_lead",
      "mr_agent",
    ].includes(role),
    canDelete: ["system_admin", "admin", "manager"].includes(role),
    canExport: [
      "system_admin",
      "admin",
      "manager",
      "mr_admin",
      "mr_lead",
    ].includes(role),
    canManage: [
      "system_admin",
      "admin",
      "manager",
      "mr_admin",
      "mr_lead",
    ].includes(role),
    canAssignTeam: [
      "system_admin",
      "admin",
      "manager",
      "mr_admin",
      "mr_lead",
    ].includes(role),
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
  comments: string | null;
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
  comments?: string;
}

export interface RfcComment {
  author: string;
  date: string;
  content: string;
}

export interface RfcActivityLogEntry {
  id: number;
  user_id: number;
  user_name: string | null;
  action: string;
  details: string;
  created_at: string;
}

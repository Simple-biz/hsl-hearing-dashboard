// types.ts — interfaces and synchronous helpers for the Medical Records page.
// Kept separate from action.ts because "use server" files may only export async functions.

// ─── Roles & Permissions ──────────────────────────────────────────────────────

// Matches the canonical UserRole union in @/lib/roles.ts
export type UserRole =
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

// MR Pivot field-level permissions (see PDF Part 2.2 — differ from dashboard)
export interface Permissions {
  canManage: boolean; // sys_admin | admin | manager | mr_admin | mr_lead
  canEditMrTeam: boolean; // sys_admin | admin | manager | mr_admin  (mr_lead = view only on pivot)
  canEditMrStatus: boolean; // sys_admin | admin | manager | mr_admin | mr_lead | mr_agent
  canEditWorksheet: boolean; // sys_admin | admin | manager | mr_admin | mr_lead | mr_agent
  canEditFiveDay: boolean; // sys_admin | admin | manager | mr_admin | mr_lead | mr_agent
  canEditDecisionStatus: boolean; // sys_admin | admin | manager | mr_admin
  canEditMoa: boolean; // sys_admin | admin | manager  (most restricted)
  canEditTask: boolean; // sys_admin | admin | mr_admin  (no manager on pivot)
  canEditCredited: boolean; // sys_admin | admin only
}

/** Synchronous helper — lives here, NOT in action.ts */
export function derivePermissions(role: UserRole): Permissions {
  return {
    canManage: [
      "system_admin",
      "admin",
      "manager",
      "mr_admin",
      "mr_lead",
    ].includes(role),
    canEditMrTeam: ["system_admin", "admin", "manager", "mr_admin"].includes(
      role,
    ),
    canEditMrStatus: [
      "system_admin",
      "admin",
      "manager",
      "mr_admin",
      "mr_lead",
      "mr_agent",
    ].includes(role),
    canEditWorksheet: [
      "system_admin",
      "admin",
      "manager",
      "mr_admin",
      "mr_lead",
      "mr_agent",
    ].includes(role),
    canEditFiveDay: [
      "system_admin",
      "admin",
      "manager",
      "mr_admin",
      "mr_lead",
      "mr_agent",
    ].includes(role),
    canEditDecisionStatus: [
      "system_admin",
      "admin",
      "manager",
      "mr_admin",
    ].includes(role),
    canEditMoa: ["system_admin", "admin", "manager"].includes(role),
    canEditTask: ["system_admin", "admin", "mr_admin"].includes(role),
    canEditCredited: ["system_admin", "admin"].includes(role),
  };
}

/**
 * Same as derivePermissions but also applies per-user field-access
 * overrides (from the `user_field_access` table). Each Permissions flag
 * is independently overridable. REP role bypasses overrides per
 * resolveFieldAccess.
 */
export function derivePermissionsWithOverrides(
  role: UserRole,
  overrides: Record<string, boolean> | null,
): Permissions {
  const base = derivePermissions(role);
  if (!overrides) return base;
  // Map each Permissions flag to the corresponding catalog field_key.
  const lookup = (
    flag: keyof Permissions,
    fieldKey: string | null,
  ): boolean => {
    if (!fieldKey) return base[flag];
    if (Object.prototype.hasOwnProperty.call(overrides, fieldKey)) {
      return overrides[fieldKey] === true;
    }
    return base[flag];
  };
  return {
    canManage: base.canManage, // page-level, not in catalog
    canEditMrTeam: lookup("canEditMrTeam", "mr_team_id"),
    canEditMrStatus: lookup("canEditMrStatus", "medical_record_status"),
    canEditWorksheet: lookup("canEditWorksheet", "medical_record_link"),
    canEditFiveDay: lookup("canEditFiveDay", "five_day_notice"),
    canEditDecisionStatus: lookup(
      "canEditDecisionStatus",
      "hearing_decision_status",
    ),
    canEditMoa: lookup("canEditMoa", "manner_of_appearance"),
    canEditTask: lookup("canEditTask", "task_assigned"),
    canEditCredited: lookup("canEditCredited", "credited"),
  };
}

// ─── Entity Types ─────────────────────────────────────────────────────────────

export interface MrTeam {
  id: number;
  team_name: string;
  team_color: string;
  team_type: "regular" | "leadership_lead" | "leadership_asst";
  is_active: boolean;
  is_assignable: boolean;
  display_order: number;
}

export interface Hearing {
  id: number;
  claimant: string;
  hearing_date: string;
  converted_time_est: string | null;
  assigned_rep_id: number | null;
  rep_name: string | null;
  mr_team_id: number | null;
  mr_team_name: string | null;
  mr_team_color: string | null;
  mr_team_type: string | null;
  medical_record_status: string | null;
  hearing_decision_status: string | null;
  manner_of_appearance: string | null;
  task_assigned: boolean;
  five_day_notice: boolean;
  /** ISO timestamp stamped when five_day_notice was toggled to true;
   *  cleared (null) when toggled back to false. Mirrors the dashboard's
   *  CHECKBOX_STAMP_FIELDS pattern. */
  five_day_notice_at: string | null;
  /** null = unverified, true = credited, false = verified-and-not-credited. */
  credited: boolean | null;
  post_hrg_review: string | null;
  post_hrg_deadline: string | null;
  post_hrg_requirements: string | null;
  medical_record_link: string | null;
  claimant_link: string | null;
  chronicle_link: string | null;
  claim_type: string | null;
  mr_team_assigned_at: string | null;
  /** Status of the linked MR-type post_hrg_development row. NULL when the
   *  hearing has no MR PHD row (e.g. POST_HRG/REP-only, or no PHD yet). */
  phd_mr_status: string | null;
}

export interface MrStatusByTeam {
  team: string;
  color: string | null;
  display_order: number;
  statuses: Record<string, number>;
}

export interface TeamAssignment {
  team_name: string;
  team_color: string | null;
  total: number;
}

export interface MonthlyTeamStat {
  label: string;
  teams: Array<{
    team_name: string;
    team_color: string | null;
    total_cases: number;
    complete: number;
    in_progress: number;
    ready: number;
    not_started: number;
    urgent: number;
  }>;
  totals: {
    total: number;
    complete: number;
    in_progress: number;
    ready: number;
    not_started: number;
    urgent: number;
  };
}

export interface AssignedByMonthRow {
  month_key: string;
  month_label: string;
  teams: Array<{
    team_name: string;
    team_color: string | null;
    case_count: number;
  }>;
  total: number;
}

export interface RoundRobinState {
  lastColor: string;
  lastTeamName: string;
  nextColor: string;
  nextTeamName: string;
  rotationOrder: string[];
  nextUnassignedHearing: {
    id: number;
    claimant: string;
    hearing_date: string;
  } | null;
  urgentUnassignedCount: number;
}

export interface NotificationItem {
  id: number;
  notification_type: "withdrawal" | "status_change" | "mr_update";
  hearing_id: number | null;
  claimant_name: string | null;
  message: string;
  created_by: number | null;
  created_at: string;
  expires_at: string | null;
  created_by_name?: string;
}

export interface ActivityLogItem {
  id: number;
  user_id: number;
  action: string;
  details: string;
  created_at: string;
  user_name: string;
  user_role: string;
}

export interface PostHrgNote {
  id: number;
  hearing_id: number;
  author_name: string;
  content: string;
  created_at: string;
}

export interface MrPivotStatCards {
  totalHearings: number;
  complete: number;
  inProgress: number;
  ready: number;
  notStarted: number;
  urgent: number;
  noSpecialistCount: number;
  noTaskCount: number;
  nextUnassignedHearing: {
    id: number;
    claimant: string;
    hearing_date: string;
  } | null;
  nextUnassignedTask: {
    id: number;
    claimant: string;
    hearing_date: string;
  } | null;
}

export interface MrPivotPageData {
  statCards: MrPivotStatCards;
  teamGrandTotals: TeamAssignment[];
  mrStatusByTeam: MrStatusByTeam[];
  groupedAssigned: AssignedByMonthRow[];
  roundRobin: RoundRobinState;
  availableMonths: Array<{ month_value: string; month_label: string }>;
  availableYears: number[];
  medical_teams: MrTeam[];
  medical_record_status_options: string[];
  hearing_decision_status_options: string[];
  manner_options: string[];
  jeromeTeamInfo: { id: number; team_name: string; team_color: string } | null;
  permissions: Permissions;
  withdrawnCount: number;
  postHrgCount: number;
}

export interface HearingFilters {
  search?: string;
  month_filter?: string;
  team_filter?: string;
  status_filter?: string;
  assignment_filter?: string;
  date_range?: string;
  date_from?: string;
  date_to?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  per_page?: number | "all";
}

export interface PaginatedHearingsResult {
  hearings: Hearing[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  stats: {
    total: number;
    complete: number;
    in_progress: number;
    ready: number;
    not_started: number;
    urgent: number;
  };
}

export interface TeamStatsData {
  weekly: MonthlyTeamStat[];
  monthly: MonthlyTeamStat[];
}

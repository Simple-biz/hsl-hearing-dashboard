// types.ts — interfaces and synchronous helpers for the MR Pivot page.
// Kept separate from action.ts because "use server" files may only export async functions.

// ─── Roles & Permissions ──────────────────────────────────────────────────────

export type UserRole =
  | "admin"
  | "manager"
  | "mr_admin"
  | "mr_lead"
  | "mr_agent"
  | "hearings_admin"
  | "hearings_agent"
  | "post_hearing_admin"
  | "post_hearing_staff";

export interface Permissions {
  canManage: boolean;       // admin | manager | mr_admin | mr_lead
  canEditMrTeam: boolean;   // admin | manager | mr_admin
  canEditMoa: boolean;      // admin | manager
  canEditTask: boolean;     // admin | mr_admin
  canEditCredited: boolean; // admin only
}

/** Synchronous helper — lives here, NOT in action.ts */
export function derivePermissions(role: UserRole): Permissions {
  return {
    canManage:       ["admin", "manager", "mr_admin", "mr_lead"].includes(role),
    canEditMrTeam:   ["admin", "manager", "mr_admin"].includes(role),
    canEditMoa:      ["admin", "manager"].includes(role),
    canEditTask:     ["admin", "mr_admin"].includes(role),
    canEditCredited: role === "admin",
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
  manner_of_hearing: string | null;
  task_assigned: boolean;
  five_day_letter: boolean;
  credited: boolean;
  post_hrg_status: string | null;
  post_hrg_deadline: string | null;
  mr_worksheet_link: string | null;
  mr_team_assigned_at: string | null;
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
  teams: Array<{ team_name: string; team_color: string | null; case_count: number }>;
  total: number;
}

export interface RoundRobinState {
  lastColor: string;
  lastTeamName: string;
  nextColor: string;
  nextTeamName: string;
  rotationOrder: string[];
  nextUnassignedHearing: { id: number; claimant: string; hearing_date: string } | null;
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
  nextUnassignedHearing: { id: number; claimant: string; hearing_date: string } | null;
  nextUnassignedTask: { id: number; claimant: string; hearing_date: string } | null;
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

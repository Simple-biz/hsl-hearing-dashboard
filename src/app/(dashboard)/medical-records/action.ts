"use server";

// ─── Permission Roles ─────────────────────────────────────────────────────────

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

export function derivePermissions(role: UserRole): Permissions {
  return {
    canManage:       ["admin","manager","mr_admin","mr_lead"].includes(role),
    canEditMrTeam:   ["admin","manager","mr_admin"].includes(role),
    canEditMoa:      ["admin","manager"].includes(role),
    canEditTask:     ["admin","mr_admin"].includes(role),
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
  hearing_date: string;          // "YYYY-MM-DD"
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
  week_key?: string;
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

// ─── Page-level aggregates ────────────────────────────────────────────────────

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

// ─── Paginated Hearings ───────────────────────────────────────────────────────

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

// ─── Weekly/Monthly Stats ─────────────────────────────────────────────────────

export interface TeamStatsData {
  weekly: MonthlyTeamStat[];
  monthly: MonthlyTeamStat[];
}

// ─── Stub data helpers (replace with db.query() when live) ────────────────────

const MR_STATUS_OPTIONS = [
  "Complete",
  "In Progress",
  "Not Started",
  "Ready",
  "URGENT! NEEDS ATTENTION",
  "Overpayment",
  "c/o Franciso's Team",
  "WITHDRAWAL",
];

const HEARING_DECISION_OPTIONS = [
  "Scheduled",
  "Favorable",
  "Unfavorable",
  "Post HRG Review/ Dev",
  "Continued",
  "Pending Decision",
  "OTR at Hrg",
  "Good Cause Ltr",
  "WD CLMT DECEASED",
  "Dismissal",
  "Withdrawal - No Contact",
  "Withdrawal - SGA",
  "Withdrawal - Terminated",
  "Withdrawal - In Person",
  "Withdrawal - Working",
  "Withdrawal - UFD",
  "Withdrawal - Benefits",
  "Withdrawal - Misc",
];

const MANNER_OPTIONS = ["Video", "Phone", "In-Person", "OVH"];

const STUB_TEAMS: MrTeam[] = [
  { id: 1, team_name: "Blue Team",   team_color: "blue",   team_type: "regular",          is_active: true, is_assignable: true, display_order: 1 },
  { id: 2, team_name: "Orange Team", team_color: "orange", team_type: "regular",          is_active: true, is_assignable: true, display_order: 2 },
  { id: 3, team_name: "Green Team",  team_color: "green",  team_type: "regular",          is_active: true, is_assignable: true, display_order: 3 },
  { id: 4, team_name: "Yellow Team", team_color: "yellow", team_type: "regular",          is_active: true, is_assignable: true, display_order: 4 },
  { id: 5, team_name: "Purple Team", team_color: "purple", team_type: "regular",          is_active: true, is_assignable: true, display_order: 5 },
  { id: 6, team_name: "Jerome's Team", team_color: "red",  team_type: "leadership_lead",  is_active: true, is_assignable: false,display_order: 6 },
];

// ─── Public Server Actions ────────────────────────────────────────────────────

/**
 * Loads all bootstrap data for the MR Pivot page.
 * Replace stubs below with real db.query() calls.
 */
export async function getMrPivotPageData(): Promise<MrPivotPageData> {
  // TODO: replace with DB queries
  const permissions = derivePermissions("admin");

  return {
    statCards: {
      totalHearings: 5484,
      complete: 1240,
      inProgress: 830,
      ready: 670,
      notStarted: 2500,
      urgent: 244,
      noSpecialistCount: 312,
      noTaskCount: 189,
      nextUnassignedHearing: { id: 101, claimant: "Smith, John", hearing_date: "2026-03-15" },
      nextUnassignedTask:    { id: 204, claimant: "Doe, Jane",   hearing_date: "2026-03-16" },
    },
    teamGrandTotals: [
      { team_name: "Blue Team",    team_color: "#3b82f6", total: 980 },
      { team_name: "Orange Team",  team_color: "#f97316", total: 870 },
      { team_name: "Green Team",   team_color: "#22c55e", total: 760 },
      { team_name: "Yellow Team",  team_color: "#eab308", total: 650 },
      { team_name: "Purple Team",  team_color: "#a855f7", total: 540 },
      { team_name: "Jerome's Team",team_color: "#ef4444", total: 220 },
      { team_name: "Unassigned",   team_color: null,      total: 464 },
    ],
    mrStatusByTeam: [
      { team: "Blue Team",    color: "#3b82f6", display_order: 1, statuses: { "Complete": 240, "In Progress": 180, "Not Started": 310, "Ready": 170, "URGENT! NEEDS ATTENTION": 50, "Overpayment": 20, "c/o Franciso's Team": 10 } },
      { team: "Orange Team",  color: "#f97316", display_order: 2, statuses: { "Complete": 210, "In Progress": 150, "Not Started": 280, "Ready": 160, "URGENT! NEEDS ATTENTION": 40, "Overpayment": 20, "c/o Franciso's Team": 10 } },
      { team: "Green Team",   color: "#22c55e", display_order: 3, statuses: { "Complete": 190, "In Progress": 130, "Not Started": 240, "Ready": 140, "URGENT! NEEDS ATTENTION": 35, "Overpayment": 15, "c/o Franciso's Team": 10 } },
      { team: "Yellow Team",  color: "#eab308", display_order: 4, statuses: { "Complete": 160, "In Progress": 100, "Not Started": 230, "Ready": 110, "URGENT! NEEDS ATTENTION": 30, "Overpayment": 10, "c/o Franciso's Team": 10 } },
      { team: "Purple Team",  color: "#a855f7", display_order: 5, statuses: { "Complete": 140, "In Progress":  90, "Not Started": 190, "Ready":  90, "URGENT! NEEDS ATTENTION": 20, "Overpayment":  8, "c/o Franciso's Team":  2 } },
      { team: "Unassigned",   color: null,      display_order: 99,statuses: { "Complete":  20, "In Progress":  40, "Not Started": 290, "Ready":  80, "URGENT! NEEDS ATTENTION": 34, "Overpayment":  0, "c/o Franciso's Team":  0 } },
    ],
    groupedAssigned: [
      { month_key: "2025-12", month_label: "Dec 2025", total: 362, teams: [{ team_name: "Blue Team", team_color: "#3b82f6", case_count: 80 }, { team_name: "Orange Team", team_color: "#f97316", case_count: 75 }, { team_name: "Green Team", team_color: "#22c55e", case_count: 70 }] },
      { month_key: "2026-01", month_label: "Jan 2026", total: 284, teams: [{ team_name: "Blue Team", team_color: "#3b82f6", case_count: 65 }, { team_name: "Orange Team", team_color: "#f97316", case_count: 60 }, { team_name: "Green Team", team_color: "#22c55e", case_count: 55 }] },
      { month_key: "2026-02", month_label: "Feb 2026", total: 132, teams: [{ team_name: "Blue Team", team_color: "#3b82f6", case_count: 30 }, { team_name: "Orange Team", team_color: "#f97316", case_count: 28 }, { team_name: "Green Team", team_color: "#22c55e", case_count: 25 }] },
    ],
    roundRobin: {
      lastColor: "purple",
      lastTeamName: "Purple Team",
      nextColor: "blue",
      nextTeamName: "Blue Team",
      rotationOrder: ["blue","orange","green","yellow","purple"],
      nextUnassignedHearing: { id: 101, claimant: "Smith, John", hearing_date: "2026-03-15" },
      urgentUnassignedCount: 22,
    },
    availableMonths: [
      { month_value: "2026-02", month_label: "February 2026" },
      { month_value: "2026-01", month_label: "January 2026" },
      { month_value: "2025-12", month_label: "December 2025" },
      { month_value: "2025-11", month_label: "November 2025" },
    ],
    availableYears: [2025, 2026],
    medical_teams: STUB_TEAMS,
    medical_record_status_options: MR_STATUS_OPTIONS,
    hearing_decision_status_options: HEARING_DECISION_OPTIONS,
    manner_options: MANNER_OPTIONS,
    jeromeTeamInfo: { id: 6, team_name: "Jerome's Team", team_color: "red" },
    permissions,
    withdrawnCount: 47,
    postHrgCount: 31,
  };
}

/**
 * Paginated hearing list with filters.
 * Replace body with parameterised DB query and WHERE clause builder.
 */
export async function getHearingsPaginated(
  filters: HearingFilters
): Promise<PaginatedHearingsResult> {
  // TODO: replace with DB query
  const page = Math.max(1, filters.page ?? 1);
  const perPage = filters.per_page === "all" ? 50 : Math.min(500, filters.per_page ?? 50);
  const STUB_TOTAL = 48;

  const hearings: Hearing[] = Array.from({ length: Math.min(perPage, STUB_TOTAL - (page - 1) * perPage) }, (_, i) => ({
    id: (page - 1) * perPage + i + 1,
    claimant: `Claimant ${(page - 1) * perPage + i + 1}`,
    hearing_date: `2026-0${(i % 3) + 1}-${String((i % 28) + 1).padStart(2, "0")}`,
    converted_time_est: i % 2 === 0 ? "10:00 AM" : "02:30 PM",
    assigned_rep_id: i % 5 + 1,
    rep_name: ["Sarah Johnson","Michael Chen","Emily Rodriguez","James Wilson","Linda Park"][i % 5],
    mr_team_id: (i % 6) + 1,
    mr_team_name: STUB_TEAMS[i % 6]?.team_name ?? null,
    mr_team_color: STUB_TEAMS[i % 6]?.team_color ?? null,
    mr_team_type: STUB_TEAMS[i % 6]?.team_type ?? null,
    medical_record_status: MR_STATUS_OPTIONS[i % MR_STATUS_OPTIONS.length],
    hearing_decision_status: HEARING_DECISION_OPTIONS[i % 4],
    manner_of_hearing: MANNER_OPTIONS[i % MANNER_OPTIONS.length],
    task_assigned: i % 3 !== 0,
    five_day_letter: i % 4 === 0,
    credited: i % 7 === 0,
    post_hrg_status: i % 4 === 2 ? "Post HRG Review/ Dev" : null,
    post_hrg_deadline: i % 4 === 2 ? "2026-04-01" : null,
    mr_worksheet_link: i % 2 === 0 ? "https://docs.google.com/spreadsheets/stub" : null,
    mr_team_assigned_at: null,
  }));

  return {
    hearings,
    total: STUB_TOTAL,
    page,
    per_page: perPage,
    total_pages: Math.ceil(STUB_TOTAL / perPage),
    stats: { total: STUB_TOTAL, complete: 12, in_progress: 9, ready: 8, not_started: 16, urgent: 3 },
  };
}

/**
 * Update medical_record_status for a single hearing.
 */
export async function updateMrStatus(hearingId: number, status: string): Promise<{ success: boolean; message?: string }> {
  // TODO: db.query("UPDATE hearings SET medical_record_status = ? WHERE id = ?", [status, hearingId])
  console.log("[updateMrStatus]", hearingId, status);
  return { success: true };
}

/**
 * Update hearing_decision_status for a single hearing.
 */
export async function updateHearingDecisionStatus(hearingId: number, status: string): Promise<{ success: boolean }> {
  // TODO: db.query("UPDATE hearings SET hearing_decision_status = ? WHERE id = ?", [status, hearingId])
  console.log("[updateHearingDecisionStatus]", hearingId, status);
  return { success: true };
}

/**
 * Update mr_team for a single hearing.
 */
export async function updateMrTeam(hearingId: number, teamId: number | null): Promise<{ success: boolean }> {
  // TODO: db.query("UPDATE hearings SET mr_team_id = ?, mr_team_assigned_at = NOW() WHERE id = ?", [teamId, hearingId])
  console.log("[updateMrTeam]", hearingId, teamId);
  return { success: true };
}

/**
 * Toggle task_assigned for a single hearing.
 */
export async function toggleTaskAssigned(hearingId: number, value: boolean): Promise<{ success: boolean }> {
  // TODO: db.query("UPDATE hearings SET task_assigned = ? WHERE id = ?", [value, hearingId])
  console.log("[toggleTaskAssigned]", hearingId, value);
  return { success: true };
}

/**
 * Toggle credited for a single hearing.
 */
export async function toggleCredited(hearingId: number, value: boolean): Promise<{ success: boolean }> {
  // TODO: db.query("UPDATE hearings SET credited = ? WHERE id = ?", [value, hearingId])
  console.log("[toggleCredited]", hearingId, value);
  return { success: true };
}

/**
 * Update manner_of_hearing for a single hearing.
 */
export async function updateMoa(hearingId: number, manner: string): Promise<{ success: boolean }> {
  // TODO: db.query("UPDATE hearings SET manner_of_hearing = ? WHERE id = ?", [manner, hearingId])
  console.log("[updateMoa]", hearingId, manner);
  return { success: true };
}

/**
 * Save or update the MR Worksheet link for a hearing.
 */
export async function updateWorksheetLink(hearingId: number, link: string): Promise<{ success: boolean }> {
  // TODO: db.query("UPDATE hearings SET mr_worksheet_link = ? WHERE id = ?", [link, hearingId])
  console.log("[updateWorksheetLink]", hearingId, link);
  return { success: true };
}

/**
 * Bulk update MR status for multiple hearings.
 */
export async function bulkUpdateMrStatus(hearingIds: number[], status: string): Promise<{ success: boolean; message: string }> {
  // TODO: db.query("UPDATE hearings SET medical_record_status = ? WHERE id IN (?)", [status, hearingIds])
  console.log("[bulkUpdateMrStatus]", hearingIds.length, status);
  return { success: true, message: `${hearingIds.length} hearings updated` };
}

/**
 * Assign Jerome's team to all urgent (next 4 weeks) unassigned hearings.
 */
export async function assignJeromeUrgent(): Promise<{ success: boolean; message: string; count: number }> {
  // TODO: db.query(...)
  return { success: true, message: "12 hearing(s) assigned to Jerome's Team", count: 12 };
}

/**
 * Get current round-robin state (live).
 */
export async function getRoundRobinState(): Promise<RoundRobinState> {
  // TODO: query last assigned team from DB
  return {
    lastColor: "purple",
    lastTeamName: "Purple Team",
    nextColor: "blue",
    nextTeamName: "Blue Team",
    rotationOrder: ["blue","orange","green","yellow","purple"],
    nextUnassignedHearing: { id: 101, claimant: "Smith, John", hearing_date: "2026-03-15" },
    urgentUnassignedCount: 22,
  };
}

/**
 * Fetch team weekly + monthly stats for the Stats modal.
 */
export async function getTeamStats(): Promise<TeamStatsData> {
  // TODO: replace with DB aggregate query
  const makeWeek = (label: string, offset: number): MonthlyTeamStat => ({
    label,
    totals: { total: 80 + offset, complete: 20 + offset, in_progress: 15, ready: 12, not_started: 28, urgent: 5 },
    teams: STUB_TEAMS.slice(0, 5).map((t) => ({
      team_name: t.team_name,
      team_color: t.team_color,
      total_cases: 16 + offset,
      complete: 4,
      in_progress: 3,
      ready: 2,
      not_started: 6,
      urgent: 1,
    })),
  });

  return {
    weekly: [
      makeWeek("Mar 3 - Mar 9, 2026", 0),
      makeWeek("Feb 24 - Mar 2, 2026", 5),
      makeWeek("Feb 17 - Feb 23, 2026", 10),
    ],
    monthly: [
      makeWeek("Feb 2026", 50),
      makeWeek("Jan 2026", 80),
      makeWeek("Dec 2025", 100),
    ],
  };
}

/**
 * Fetch notifications for the bell icon.
 */
export async function getNotifications(): Promise<NotificationItem[]> {
  // TODO: db.query("SELECT n.*, u.name as created_by_name FROM sync_notifications n LEFT JOIN users u ON n.created_by = u.id WHERE n.expires_at > NOW() OR n.expires_at IS NULL ORDER BY n.created_at DESC LIMIT 50")
  return [];
}

/**
 * Fetch activity log entries.
 */
export async function getActivityLog(params: {
  type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
}): Promise<{ items: ActivityLogItem[]; total: number }> {
  // TODO: db.query with filters
  void params;
  return { items: [], total: 0 };
}

/**
 * Fetch Post HRG notes for a hearing.
 */
export async function getPostHrgNotes(hearingId: number): Promise<PostHrgNote[]> {
  // TODO: db.query("SELECT * FROM post_hrg_notes WHERE hearing_id = ? ORDER BY created_at DESC", [hearingId])
  void hearingId;
  return [];
}

/**
 * Update Post HRG deadline for a hearing.
 */
export async function updatePostHrgDeadline(hearingId: number, deadline: string): Promise<{ success: boolean }> {
  // TODO: db.query(...)
  void hearingId; void deadline;
  return { success: true };
}

/**
 * Fetch Post HRG hearings list (for modal).
 */
export async function getPostHrgHearings(filters: HearingFilters): Promise<PaginatedHearingsResult> {
  // same shape as getHearingsPaginated but filtered to hearing_decision_status = 'Post HRG Review/ Dev'
  return getHearingsPaginated(filters);
}

/**
 * Get card stats (No Specialist / No Task) filtered by year/month.
 */
export async function getCardStats(type: "no_specialist" | "no_task", year?: string, month?: string): Promise<{ count: number; nextHearing: { claimant: string; hearing_date: string } | null }> {
  void type; void year; void month;
  // TODO: parameterised DB query
  return { count: type === "no_specialist" ? 312 : 189, nextHearing: null };
}

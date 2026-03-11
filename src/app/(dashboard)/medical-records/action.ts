"use server";

// Re-export all types so existing imports (`import type { X } from "./action"`) keep working.
export type {
  UserRole,
  Permissions,
  MrTeam,
  Hearing,
  MrStatusByTeam,
  TeamAssignment,
  MonthlyTeamStat,
  AssignedByMonthRow,
  RoundRobinState,
  NotificationItem,
  ActivityLogItem,
  PostHrgNote,
  MrPivotStatCards,
  MrPivotPageData,
  HearingFilters,
  PaginatedHearingsResult,
  TeamStatsData,
} from "./types";

import { derivePermissions } from "./types";
import type {
  MrTeam,
  Hearing,
  MrPivotPageData,
  HearingFilters,
  PaginatedHearingsResult,
  RoundRobinState,
  MonthlyTeamStat,
  TeamStatsData,
  NotificationItem,
  ActivityLogItem,
  PostHrgNote,
} from "./types";

// ─── Stub constants ───────────────────────────────────────────────────────────

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
  { id: 1, team_name: "Blue Team",     team_color: "blue",   team_type: "regular",         is_active: true, is_assignable: true,  display_order: 1 },
  { id: 2, team_name: "Orange Team",   team_color: "orange", team_type: "regular",         is_active: true, is_assignable: true,  display_order: 2 },
  { id: 3, team_name: "Green Team",    team_color: "green",  team_type: "regular",         is_active: true, is_assignable: true,  display_order: 3 },
  { id: 4, team_name: "Yellow Team",   team_color: "yellow", team_type: "regular",         is_active: true, is_assignable: true,  display_order: 4 },
  { id: 5, team_name: "Purple Team",   team_color: "purple", team_type: "regular",         is_active: true, is_assignable: true,  display_order: 5 },
  { id: 6, team_name: "Jerome's Team", team_color: "red",    team_type: "leadership_lead", is_active: true, is_assignable: false, display_order: 6 },
];

// ─── Server Actions (all must be async) ──────────────────────────────────────

export async function getMrPivotPageData(): Promise<MrPivotPageData> {
  // TODO: replace with real DB queries
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
      nextUnassignedHearing: { id: 101, claimant: "Smith, John",  hearing_date: "2026-03-15" },
      nextUnassignedTask:    { id: 204, claimant: "Doe, Jane",    hearing_date: "2026-03-16" },
    },
    teamGrandTotals: [
      { team_name: "Blue Team",     team_color: "#3b82f6", total: 980 },
      { team_name: "Orange Team",   team_color: "#f97316", total: 870 },
      { team_name: "Green Team",    team_color: "#22c55e", total: 760 },
      { team_name: "Yellow Team",   team_color: "#eab308", total: 650 },
      { team_name: "Purple Team",   team_color: "#a855f7", total: 540 },
      { team_name: "Jerome's Team", team_color: "#ef4444", total: 220 },
      { team_name: "Unassigned",    team_color: null,      total: 464 },
    ],
    mrStatusByTeam: [
      { team: "Blue Team",   color: "#3b82f6", display_order: 1,  statuses: { "Complete": 240, "In Progress": 180, "Not Started": 310, "Ready": 170, "URGENT! NEEDS ATTENTION": 50, "Overpayment": 20, "c/o Franciso's Team": 10 } },
      { team: "Orange Team", color: "#f97316", display_order: 2,  statuses: { "Complete": 210, "In Progress": 150, "Not Started": 280, "Ready": 160, "URGENT! NEEDS ATTENTION": 40, "Overpayment": 20, "c/o Franciso's Team": 10 } },
      { team: "Green Team",  color: "#22c55e", display_order: 3,  statuses: { "Complete": 190, "In Progress": 130, "Not Started": 240, "Ready": 140, "URGENT! NEEDS ATTENTION": 35, "Overpayment": 15, "c/o Franciso's Team": 10 } },
      { team: "Yellow Team", color: "#eab308", display_order: 4,  statuses: { "Complete": 160, "In Progress": 100, "Not Started": 230, "Ready": 110, "URGENT! NEEDS ATTENTION": 30, "Overpayment": 10, "c/o Franciso's Team": 10 } },
      { team: "Purple Team", color: "#a855f7", display_order: 5,  statuses: { "Complete": 140, "In Progress":  90, "Not Started": 190, "Ready":  90, "URGENT! NEEDS ATTENTION": 20, "Overpayment":  8, "c/o Franciso's Team":  2 } },
      { team: "Unassigned",  color: null,      display_order: 99, statuses: { "Complete":  20, "In Progress":  40, "Not Started": 290, "Ready":  80, "URGENT! NEEDS ATTENTION": 34, "Overpayment":  0, "c/o Franciso's Team":  0 } },
    ],
    groupedAssigned: [
      { month_key: "2025-12", month_label: "Dec 2025", total: 362, teams: [{ team_name: "Blue Team", team_color: "#3b82f6", case_count: 80 }, { team_name: "Orange Team", team_color: "#f97316", case_count: 75 }] },
      { month_key: "2026-01", month_label: "Jan 2026", total: 284, teams: [{ team_name: "Blue Team", team_color: "#3b82f6", case_count: 65 }, { team_name: "Orange Team", team_color: "#f97316", case_count: 60 }] },
      { month_key: "2026-02", month_label: "Feb 2026", total: 132, teams: [{ team_name: "Blue Team", team_color: "#3b82f6", case_count: 30 }, { team_name: "Orange Team", team_color: "#f97316", case_count: 28 }] },
    ],
    roundRobin: {
      lastColor: "purple",
      lastTeamName: "Purple Team",
      nextColor: "blue",
      nextTeamName: "Blue Team",
      rotationOrder: ["blue", "orange", "green", "yellow", "purple"],
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

export async function getHearingsPaginated(
  filters: HearingFilters
): Promise<PaginatedHearingsResult> {
  // TODO: replace with parameterised DB query — stub filters in-memory for now

  // Build the full stub dataset (144 rows across 3 months)
  const MONTHS = ["2025-12", "2026-01", "2026-02", "2026-03"];
  const REPS = ["Sarah Johnson", "Michael Chen", "Emily Rodriguez", "James Wilson", "Linda Park"];

  const allHearings: Hearing[] = Array.from({ length: 144 }, (_, i) => {
    const monthIdx = i % MONTHS.length;
    const day = String((i % 28) + 1).padStart(2, "0");
    const teamIdx = i % 6;
    const team = STUB_TEAMS[teamIdx];
    return {
      id: i + 1,
      claimant: `Claimant ${i + 1}`,
      hearing_date: `${MONTHS[monthIdx]}-${day}`,
      converted_time_est: i % 2 === 0 ? "10:00 AM" : "02:30 PM",
      assigned_rep_id: (i % 5) + 1,
      rep_name: REPS[i % 5],
      mr_team_id: team?.id ?? null,
      mr_team_name: team?.team_name ?? null,
      mr_team_color: team?.team_color ?? null,
      mr_team_type: team?.team_type ?? null,
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
    };
  });

  // ── Apply filters ─────────────────────────────────────────────────────────
  let filtered = allHearings;

  if (filters.search?.trim()) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter((h) => h.claimant.toLowerCase().includes(q) || h.rep_name?.toLowerCase().includes(q));
  }
  if (filters.month_filter) {
    filtered = filtered.filter((h) => h.hearing_date.startsWith(filters.month_filter!));
  }
  if (filters.team_filter) {
    if (filters.team_filter === "unassigned") {
      filtered = filtered.filter((h) => !h.mr_team_id);
    } else {
      filtered = filtered.filter((h) => String(h.mr_team_id) === String(filters.team_filter));
    }
  }
  if (filters.status_filter) {
    if (filters.status_filter === "unassigned") {
      filtered = filtered.filter((h) => !h.medical_record_status);
    } else {
      filtered = filtered.filter((h) => h.medical_record_status === filters.status_filter);
    }
  }
  if (filters.assignment_filter) {
    if (filters.assignment_filter === "no_specialist")  filtered = filtered.filter((h) => !h.mr_team_id);
    if (filters.assignment_filter === "no_task")        filtered = filtered.filter((h) => !h.task_assigned);
    if (filters.assignment_filter === "no_both")        filtered = filtered.filter((h) => !h.mr_team_id && !h.task_assigned);
  }
  if (filters.date_from) filtered = filtered.filter((h) => h.hearing_date >= filters.date_from!);
  if (filters.date_to)   filtered = filtered.filter((h) => h.hearing_date <= filters.date_to!);

  // Sort
  filtered.sort((a, b) => filters.sort_order === "desc"
    ? b.hearing_date.localeCompare(a.hearing_date)
    : a.hearing_date.localeCompare(b.hearing_date));

  // Stats on filtered set
  const stats = {
    total:       filtered.length,
    complete:    filtered.filter((h) => h.medical_record_status === "Complete").length,
    in_progress: filtered.filter((h) => h.medical_record_status === "In Progress").length,
    ready:       filtered.filter((h) => h.medical_record_status === "Ready").length,
    not_started: filtered.filter((h) => h.medical_record_status === "Not Started").length,
    urgent:      filtered.filter((h) => h.medical_record_status === "URGENT! NEEDS ATTENTION").length,
  };

  // Paginate
  const page = Math.max(1, filters.page ?? 1);
  const perPage = filters.per_page === "all" ? filtered.length : Math.min(500, (filters.per_page as number) ?? 50);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  return {
    hearings: paginated,
    total: filtered.length,
    page,
    per_page: perPage,
    total_pages: Math.max(1, Math.ceil(filtered.length / perPage)),
    stats,
  };
}

export async function updateMrStatus(hearingId: number, status: string): Promise<{ success: boolean }> {
  void hearingId; void status;
  return { success: true };
}

export async function updateHearingDecisionStatus(hearingId: number, status: string): Promise<{ success: boolean }> {
  void hearingId; void status;
  return { success: true };
}

export async function updateMrTeam(hearingId: number, teamId: number | null): Promise<{ success: boolean }> {
  void hearingId; void teamId;
  return { success: true };
}

export async function toggleTaskAssigned(hearingId: number, value: boolean): Promise<{ success: boolean }> {
  void hearingId; void value;
  return { success: true };
}

export async function toggleCredited(hearingId: number, value: boolean): Promise<{ success: boolean }> {
  void hearingId; void value;
  return { success: true };
}

export async function updateMoa(hearingId: number, manner: string): Promise<{ success: boolean }> {
  void hearingId; void manner;
  return { success: true };
}

export async function updateWorksheetLink(hearingId: number, link: string): Promise<{ success: boolean }> {
  void hearingId; void link;
  return { success: true };
}

export async function bulkUpdateMrStatus(
  hearingIds: number[],
  status: string
): Promise<{ success: boolean; message: string }> {
  void hearingIds; void status;
  return { success: true, message: `${hearingIds.length} hearings updated` };
}

export async function assignJeromeUrgent(): Promise<{ success: boolean; message: string; count: number }> {
  return { success: true, message: "12 hearing(s) assigned to Jerome's Team", count: 12 };
}

export async function getRoundRobinState(): Promise<RoundRobinState> {
  return {
    lastColor: "purple",
    lastTeamName: "Purple Team",
    nextColor: "blue",
    nextTeamName: "Blue Team",
    rotationOrder: ["blue", "orange", "green", "yellow", "purple"],
    nextUnassignedHearing: { id: 101, claimant: "Smith, John", hearing_date: "2026-03-15" },
    urgentUnassignedCount: 22,
  };
}

export async function getTeamStats(): Promise<TeamStatsData> {
  const makeWeek = (label: string, offset: number): MonthlyTeamStat => ({
    label,
    totals: { total: 80 + offset, complete: 20 + offset, in_progress: 15, ready: 12, not_started: 28, urgent: 5 },
    teams: STUB_TEAMS.slice(0, 5).map((t) => ({
      team_name: t.team_name,
      team_color: t.team_color,
      total_cases: 16 + offset,
      complete: 4, in_progress: 3, ready: 2, not_started: 6, urgent: 1,
    })),
  });
  return {
    weekly:  [makeWeek("Mar 3 - Mar 9, 2026", 0), makeWeek("Feb 24 - Mar 2, 2026", 5),  makeWeek("Feb 17 - Feb 23, 2026", 10)],
    monthly: [makeWeek("Feb 2026", 50),            makeWeek("Jan 2026", 80),             makeWeek("Dec 2025", 100)],
  };
}

export async function getNotifications(): Promise<NotificationItem[]> {
  // TODO: SELECT * FROM sync_notifications WHERE expires_at > NOW() ORDER BY created_at DESC LIMIT 50
  return [];
}

export async function getActivityLog(params: {
  type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
}): Promise<{ items: ActivityLogItem[]; total: number }> {
  void params;
  return { items: [], total: 0 };
}

export async function getPostHrgNotes(hearingId: number): Promise<PostHrgNote[]> {
  void hearingId;
  return [];
}

export async function updatePostHrgDeadline(
  hearingId: number,
  deadline: string
): Promise<{ success: boolean }> {
  void hearingId; void deadline;
  return { success: true };
}

export async function getPostHrgHearings(
  filters: HearingFilters
): Promise<PaginatedHearingsResult> {
  return getHearingsPaginated(filters);
}

export async function getCardStats(
  type: "no_specialist" | "no_task",
  year?: string,
  month?: string,
): Promise<{ count: number; nextHearing: { claimant: string; hearing_date: string } | null }> {
  void type; void year; void month;
  return { count: type === "no_specialist" ? 312 : 189, nextHearing: null };
}

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
import type { UserRole } from "./types";
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

import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// ─── Internal helper — writes to activity_log, matching PHP's logActivity() ──
async function logActivity(
  action: string,
  details: string,
): Promise<void> {
  try {
    const session = await getSession();
    const userId = session?.user?.id;
    if (!userId) return;
    await db.query(
      `INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)`,
      [userId, action, details],
    );
  } catch {
    // Never let logging failures break the mutation
  }
}

// ─── Shared SQL fragment — excludes withdrawn/dismissed records ───────────────
const WITHDRAWN_FILTER = `
  (h.medical_record_status != 'WITHDRAWAL' OR h.medical_record_status IS NULL)
  AND (
    h.hearing_decision_status NOT LIKE 'Withdrawal%'
    AND h.hearing_decision_status != 'WD CLMT DECEASED'
    AND h.hearing_decision_status != 'Dismissal'
    OR h.hearing_decision_status IS NULL
  )
`.trim();

// ─── Page data loader — all independent queries run in parallel ───────────────

export async function getMrPivotPageData(
  userRole: UserRole = "mr_agent",
): Promise<MrPivotPageData> {
  const permissions = derivePermissions(userRole);

  const [
    statsRow,
    withdrawnRow,
    postHrgRow,
    noSpecialistRow,
    noTaskRow,
    nextUnassignedHearingRow,
    nextUnassignedTaskRow,
    teamGrandTotalsRows,
    mrStatusPivotRows,
    groupedAssignedRows,
    weeklyStatsRows,
    monthlyStatsRows,
    availableMonthsRows,
    availableYearsRows,
    medicalTeamsRows,
    mrStatusOptions,
    decisionStatusOptions,
    mannerOptions,
    jeromeTeamRow,
    rotationTeamsRows,
    lastAssignedRow,
  ] = await Promise.all([
    // ── Stat cards ────────────────────────────────────────────────────────────
    db.query(`
      SELECT
        COUNT(*)                                                                         AS total,
        SUM(CASE WHEN medical_record_status = 'Complete' THEN 1 ELSE 0 END) AS complete_count,
        SUM(CASE WHEN medical_record_status = 'In Progress' THEN 1 ELSE 0 END) AS progress_count,
        SUM(CASE WHEN medical_record_status = 'Ready' THEN 1 ELSE 0 END) AS ready_count,
        SUM(CASE WHEN medical_record_status IS NULL
                   OR medical_record_status = ''
                   OR medical_record_status = 'Not Started' THEN 1 ELSE 0 END) AS not_started_count,
        SUM(CASE WHEN medical_record_status = 'URGENT! NEEDS ATTENTION' THEN 1 ELSE 0 END) AS urgent_count
      FROM hearings h
      WHERE ${WITHDRAWN_FILTER}
    `),

    // ── Withdrawn / dismissed count ───────────────────────────────────────────
    db.query(`
      SELECT COUNT(*) AS cnt
      FROM hearings
      WHERE medical_record_status = 'WITHDRAWAL'
        OR hearing_decision_status LIKE 'Withdrawal%'
        OR hearing_decision_status = 'WD CLMT DECEASED'
        OR hearing_decision_status = 'Dismissal'
    `),

    // ── Post HRG Review count ─────────────────────────────────────────────────
    db.query(`
      SELECT COUNT(*) AS cnt
      FROM hearings
      WHERE hearing_decision_status = 'Post HRG Review/ Dev'
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
        AND (hearing_decision_status NOT LIKE 'Withdrawal%' OR hearing_decision_status = 'Post HRG Review/ Dev')
    `),

    // ── No specialist count (upcoming, not withdrawn) ─────────────────────────
    db.query(`
      SELECT COUNT(*) AS cnt
      FROM hearings
      WHERE mr_team_id IS NULL
        AND hearing_date >= CURRENT_DATE
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
    `),

    // ── No task assigned count (upcoming, not withdrawn) ─────────────────────
    db.query(`
      SELECT COUNT(*) AS cnt
      FROM hearings
      WHERE (task_assigned IS NULL OR task_assigned = false)
        AND hearing_date >= CURRENT_DATE
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
    `),

    // ── Next upcoming unassigned hearing ─────────────────────────────────────
    db.query(`
      SELECT id, claimant, hearing_date::text
      FROM hearings
      WHERE mr_team_id IS NULL
        AND hearing_date >= CURRENT_DATE
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
      ORDER BY hearing_date ASC
      LIMIT 1
    `),

    // ── Next hearing without task assigned ────────────────────────────────────
    db.query(`
      SELECT id, claimant, hearing_date::text
      FROM hearings
      WHERE (task_assigned IS NULL OR task_assigned = false)
        AND hearing_date >= CURRENT_DATE
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
      ORDER BY hearing_date ASC
      LIMIT 1
    `),

    // ── Team grand totals (sidebar) ───────────────────────────────────────────
    db.query(`
      SELECT
        COALESCE(t.team_name, 'Unassigned') AS team_name,
        t.team_color,
        COALESCE(t.display_order, 9999)      AS display_order,
        COUNT(*)                             AS total
      FROM hearings h
      LEFT JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE ${WITHDRAWN_FILTER}
      GROUP BY t.team_name, t.team_color, t.display_order
      ORDER BY COALESCE(t.display_order, 9999) ASC
    `),

    // ── MR status pivot (status breakdown by team) ────────────────────────────
    db.query(`
      SELECT
        COALESCE(t.team_name, 'Unassigned') AS team,
        t.team_color,
        COALESCE(t.display_order, 9999)      AS display_order,
        h.medical_record_status,
        COUNT(*)                             AS cnt
      FROM hearings h
      LEFT JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE ${WITHDRAWN_FILTER}
      GROUP BY t.team_name, t.team_color, t.display_order, h.medical_record_status
      ORDER BY COALESCE(t.display_order, 9999) ASC
    `),

    // ── Assigned cases by month / team ────────────────────────────────────────
    db.query(`
      SELECT
        TO_CHAR(h.hearing_date, 'YYYY-MM') AS month_key,
        TO_CHAR(h.hearing_date, 'Mon YYYY') AS month_label,
        COALESCE(t.team_name, 'Unassigned') AS team_name,
        t.team_color,
        COALESCE(t.display_order, 9999) AS display_order,
        COUNT(*) AS case_count
      FROM hearings h
      LEFT JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE ${WITHDRAWN_FILTER}
      GROUP BY TO_CHAR(h.hearing_date, 'YYYY-MM'), TO_CHAR(h.hearing_date, 'Mon YYYY'),
               t.team_name, t.team_color, t.display_order
      ORDER BY month_key ASC, COALESCE(t.display_order, 9999) ASC
    `),

    // ── Weekly team stats ─────────────────────────────────────────────────────
    db.query(`
      SELECT
        TO_CHAR(h.hearing_date, 'IYYY-IW') AS week_key,
        TO_CHAR(date_trunc('week', h.hearing_date), 'Mon DD') AS week_start,
        TO_CHAR(date_trunc('week', h.hearing_date) + INTERVAL '6 days', 'Mon DD, YYYY') AS week_end,
        COALESCE(t.team_name, 'Unassigned') AS team_name,
        t.team_color,
        COALESCE(t.display_order, 9999) AS display_order,
        COUNT(*) AS total_cases,
        SUM(CASE WHEN h.medical_record_status = 'Complete' THEN 1 ELSE 0 END) AS complete,
        SUM(CASE WHEN h.medical_record_status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN h.medical_record_status = 'Ready' THEN 1 ELSE 0 END) AS ready,
        SUM(CASE WHEN h.medical_record_status IS NULL
                   OR h.medical_record_status = 'Not Started' THEN 1 ELSE 0 END) AS not_started,
        SUM(CASE WHEN h.medical_record_status = 'URGENT! NEEDS ATTENTION' THEN 1 ELSE 0 END) AS urgent
      FROM hearings h
      LEFT JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE ${WITHDRAWN_FILTER}
      GROUP BY TO_CHAR(h.hearing_date, 'IYYY-IW'),
               TO_CHAR(date_trunc('week', h.hearing_date), 'Mon DD'),
               TO_CHAR(date_trunc('week', h.hearing_date) + INTERVAL '6 days', 'Mon DD, YYYY'),
               t.team_name, t.team_color, t.display_order
      ORDER BY week_key DESC, COALESCE(t.display_order, 9999) ASC
    `),

    // ── Monthly team stats ────────────────────────────────────────────────────
    db.query(`
      SELECT
        TO_CHAR(h.hearing_date, 'YYYY-MM') AS month_key,
        TO_CHAR(h.hearing_date, 'Mon YYYY') AS month_label,
        COALESCE(t.team_name, 'Unassigned') AS team_name,
        t.team_color,
        COALESCE(t.display_order, 9999) AS display_order,
        COUNT(*) AS total_cases,
        SUM(CASE WHEN h.medical_record_status = 'Complete' THEN 1 ELSE 0 END) AS complete,
        SUM(CASE WHEN h.medical_record_status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN h.medical_record_status = 'Ready' THEN 1 ELSE 0 END) AS ready,
        SUM(CASE WHEN h.medical_record_status IS NULL
                   OR h.medical_record_status = 'Not Started' THEN 1 ELSE 0 END) AS not_started,
        SUM(CASE WHEN h.medical_record_status = 'URGENT! NEEDS ATTENTION' THEN 1 ELSE 0 END) AS urgent
      FROM hearings h
      LEFT JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE ${WITHDRAWN_FILTER}
      GROUP BY TO_CHAR(h.hearing_date, 'YYYY-MM'), TO_CHAR(h.hearing_date, 'Mon YYYY'),
               t.team_name, t.team_color, t.display_order
      ORDER BY month_key DESC, COALESCE(t.display_order, 9999) ASC
    `),

    // ── Available months filter ───────────────────────────────────────────────
    db.query(`
      SELECT DISTINCT
        TO_CHAR(hearing_date, 'YYYY-MM') AS month_value,
        TO_CHAR(hearing_date, 'Month YYYY') AS month_label
      FROM hearings
      ORDER BY month_value DESC
    `),

    // ── Available years (for assignment card filters) ─────────────────────────
    db.query(`
      SELECT DISTINCT EXTRACT(YEAR FROM hearing_date)::int AS year
      FROM hearings
      WHERE hearing_date >= CURRENT_DATE
      ORDER BY year ASC
    `),

    // ── Active, assignable MR teams ───────────────────────────────────────────
    db.query(`
      SELECT id, team_name, team_color, team_type, is_active, is_assignable, display_order
      FROM mr_teams
      WHERE is_active = true
      ORDER BY display_order ASC
    `),

    // ── Medical record status options from config ─────────────────────────────
    db.query(`
      SELECT option_value
      FROM config_options
      WHERE option_type = 'medical_record_status' AND is_active = true
      ORDER BY display_order ASC
    `),

    // ── Hearing decision status options from config ───────────────────────────
    db.query(`
      SELECT option_value
      FROM config_options
      WHERE option_type = 'hearing_decision_status' AND is_active = true
      ORDER BY display_order ASC
    `),

    // ── Manner of appearance options from config ──────────────────────────────
    db.query(`
      SELECT option_value
      FROM config_options
      WHERE option_type = 'manner_of_appearance' AND is_active = true
      ORDER BY display_order ASC
    `),

    // ── Jerome's team info ────────────────────────────────────────────────────
    db.query(`
      SELECT id, team_name, team_color
      FROM mr_teams
      WHERE team_name ILIKE '%jerome%' AND is_active = true
      LIMIT 1
    `),

    // ── Round-robin: rotation teams ───────────────────────────────────────────
    db.query(`
      SELECT id, team_name, team_color
      FROM mr_teams
      WHERE team_color IN ('blue', 'orange', 'green', 'yellow', 'purple', 'pink')
        AND is_active = true
        AND is_assignable = true
      ORDER BY
        CASE team_color
          WHEN 'blue' THEN 1
          WHEN 'orange' THEN 2
          WHEN 'green' THEN 3
          WHEN 'yellow' THEN 4
          WHEN 'purple' THEN 5
        END ASC
    `),

    // ── Round-robin: last assigned team ──────────────────────────────────────
    db.query(`
      SELECT t.id, t.team_name, t.team_color
      FROM hearings h
      JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE t.team_color IN ('blue', 'orange', 'green', 'yellow', 'purple', 'pink')
        AND h.mr_team_assigned_at IS NOT NULL
        AND (h.medical_record_status != 'WITHDRAWAL' OR h.medical_record_status IS NULL)
      ORDER BY h.mr_team_assigned_at DESC
      LIMIT 1
    `),
  ]);

  // ── Shape: stat cards ───────────────────────────────────────────────────────
  const s = statsRow.rows[0] ?? {};
  const statCards = {
    totalHearings: Number(s.total           ?? 0),
    complete: Number(s.complete_count   ?? 0),
    inProgress: Number(s.progress_count   ?? 0),
    ready: Number(s.ready_count      ?? 0),
    notStarted: Number(s.not_started_count ?? 0),
    urgent: Number(s.urgent_count      ?? 0),
    noSpecialistCount: Number(noSpecialistRow.rows[0]?.cnt ?? 0),
    noTaskCount: Number(noTaskRow.rows[0]?.cnt ?? 0),
    nextUnassignedHearing: nextUnassignedHearingRow.rows[0] ?? null,
    nextUnassignedTask: nextUnassignedTaskRow.rows[0] ?? null,
  };

  // ── Shape: team grand totals ────────────────────────────────────────────────
  const teamGrandTotals = teamGrandTotalsRows.rows.map((r: Record<string, unknown>) => ({
    team_name:  r.team_name as string,
    team_color: r.team_color as string | null,
    total:      Number(r.total),
  }));

  // ── Shape: MR status by team (pivot) ───────────────────────────────────────
  const mrStatusMap: Record<string, { color: string | null; display_order: number; statuses: Record<string, number> }> = {};
  for (const r of mrStatusPivotRows.rows as Record<string, unknown>[]) {
    const team = r.team as string;
    if (!mrStatusMap[team]) {
      mrStatusMap[team] = { color: r.team_color as string | null, display_order: Number(r.display_order ?? 999), statuses: {} };
    }
    const statusKey = (r.medical_record_status as string | null) ?? "No Status";
    mrStatusMap[team].statuses[statusKey] = Number(r.cnt);
  }
  const mrStatusByTeam = Object.entries(mrStatusMap)
    .sort(([, a], [, b]) => a.display_order - b.display_order)
    .map(([team, data]) => ({ team, ...data }));

  // ── Shape: grouped assigned by month ───────────────────────────────────────
  const assignedMap: Record<string, { month_label: string; teams: { team_name: string; team_color: string | null; case_count: number }[]; total: number }> = {};
  for (const r of groupedAssignedRows.rows as Record<string, unknown>[]) {
    const key = r.month_key as string;
    if (!assignedMap[key]) {
      assignedMap[key] = { month_label: r.month_label as string, teams: [], total: 0 };
    }
    assignedMap[key].teams.push({
      team_name:  r.team_name as string,
      team_color: r.team_color as string | null,
      case_count: Number(r.case_count),
    });
    assignedMap[key].total += Number(r.case_count);
  }
  const groupedAssigned = Object.entries(assignedMap).map(([month_key, v]) => ({ month_key, month_label: v.month_label, teams: v.teams, total: v.total }));

  // ── Shape: weekly stats ─────────────────────────────────────────────────────
  const weeklyMap: Record<string, { label: string; teams: MonthlyTeamStat["teams"]; totals: MonthlyTeamStat["totals"] }> = {};
  for (const r of weeklyStatsRows.rows as Record<string, unknown>[]) {
    const key = r.week_key as string;
    if (!weeklyMap[key]) {
      weeklyMap[key] = { label: `${r.week_start} - ${r.week_end}`, teams: [], totals: { total: 0, complete: 0, in_progress: 0, ready: 0, not_started: 0, urgent: 0 } };
    }
    const tc = Number(r.total_cases);
    const co = Number(r.complete);
    const ip = Number(r.in_progress);
    const re = Number(r.ready);
    const ns = Number(r.not_started);
    const ug = Number(r.urgent);
    weeklyMap[key].teams.push({ team_name: r.team_name as string, team_color: r.team_color as string | null, total_cases: tc, complete: co, in_progress: ip, ready: re, not_started: ns, urgent: ug });
    weeklyMap[key].totals.total      += tc;
    weeklyMap[key].totals.complete   += co;
    weeklyMap[key].totals.in_progress += ip;
    weeklyMap[key].totals.ready      += re;
    weeklyMap[key].totals.not_started += ns;
    weeklyMap[key].totals.urgent     += ug;
  }
  // const weekly = Object.values(weeklyMap);

  // ── Shape: monthly stats ────────────────────────────────────────────────────
  const monthlyMap: Record<string, { label: string; teams: MonthlyTeamStat["teams"]; totals: MonthlyTeamStat["totals"] }> = {};
  for (const r of monthlyStatsRows.rows as Record<string, unknown>[]) {
    const key = r.month_key as string;
    if (!monthlyMap[key]) {
      monthlyMap[key] = { label: r.month_label as string, teams: [], totals: { total: 0, complete: 0, in_progress: 0, ready: 0, not_started: 0, urgent: 0 } };
    }
    const tc = Number(r.total_cases);
    const co = Number(r.complete);
    const ip = Number(r.in_progress);
    const re = Number(r.ready);
    const ns = Number(r.not_started);
    const ug = Number(r.urgent);
    monthlyMap[key].teams.push({ team_name: r.team_name as string, team_color: r.team_color as string | null, total_cases: tc, complete: co, in_progress: ip, ready: re, not_started: ns, urgent: ug });
    monthlyMap[key].totals.total      += tc;
    monthlyMap[key].totals.complete   += co;
    monthlyMap[key].totals.in_progress += ip;
    monthlyMap[key].totals.ready      += re;
    monthlyMap[key].totals.not_started += ns;
    monthlyMap[key].totals.urgent     += ug;
  }
  // const monthly = Object.values(monthlyMap);

  // ── Shape: round-robin state ────────────────────────────────────────────────
  const ROTATION_ORDER = ["blue", "orange", "green", "yellow", "purple", "pink"];
  const colorToTeam: Record<string, { id: number; name: string; color: string }> = {};
  for (const rt of rotationTeamsRows.rows as Record<string, unknown>[]) {
    colorToTeam[rt.team_color as string] = { id: Number(rt.id), name: rt.team_name as string, color: rt.team_color as string };
  }

  // Fallback: if mr_team_assigned_at was null on all rows, try last assigned by id
  let lastRow = lastAssignedRow.rows[0] as Record<string, unknown> | undefined;
  if (!lastRow) {
    const fallback = await db.query(`
      SELECT t.id, t.team_name, t.team_color
      FROM hearings h
      JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE t.team_color IN ('blue', 'orange', 'green', 'yellow', 'purple', 'pink')
      ORDER BY h.id DESC
      LIMIT 1
    `);
    lastRow = fallback.rows[0];
  }

  const lastColor = (lastRow?.team_color as string | undefined) ?? "purple";
  const lastTeamName = (lastRow?.team_name  as string | undefined) ?? "None";
  const lastIndex = ROTATION_ORDER.indexOf(lastColor);
  const nextIndex = (lastIndex + 1) % ROTATION_ORDER.length;
  const nextColor = ROTATION_ORDER[nextIndex];
  const nextTeamObj = colorToTeam[nextColor];
  const nextTeamName = nextTeamObj?.name ?? "Blue Team";

  const [nextUnassignedRRRow, urgentUnassignedRow] = await Promise.all([
    db.query(`
      SELECT id, claimant, hearing_date::text
      FROM hearings
      WHERE mr_team_id IS NULL
        AND hearing_date >= CURRENT_DATE
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
      ORDER BY hearing_date ASC
      LIMIT 1
    `),
    db.query(`
      SELECT COUNT(*) AS cnt
      FROM hearings
      WHERE mr_team_id IS NULL
        AND hearing_date >= CURRENT_DATE
        AND hearing_date <= CURRENT_DATE + INTERVAL '28 days'
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
    `),
  ]);

  const roundRobin: RoundRobinState = {
    lastColor,
    lastTeamName,
    nextColor,
    nextTeamName,
    rotationOrder: ROTATION_ORDER,
    nextUnassignedHearing: nextUnassignedRRRow.rows[0] ?? null,
    urgentUnassignedCount: Number(urgentUnassignedRow.rows[0]?.cnt ?? 0),
  };

  // ── Shape: config options (with fallbacks matching PHP defaults) ────────────
  const medicalTeams = medicalTeamsRows.rows as MrTeam[];

  const mrStatusOptionsList: string[] = mrStatusOptions.rows.length
    ? mrStatusOptions.rows.map((r: Record<string, unknown>) => r.option_value as string)
    : ["Complete", "Incomplete", "In Progress", "Overpayment", "Not Started", "Ready", "URGENT! NEEDS ATTENTION", "c/o Franciso's Team", "WITHDRAWAL", "CLIENT UNREACHABLE"];

  const decisionStatusList: string[] = decisionStatusOptions.rows.length
    ? decisionStatusOptions.rows.map((r: Record<string, unknown>) => r.option_value as string)
    : ["Scheduled", "Post HRG Review/ Dev", "Favorable", "Unfavorable", "Pending Decision", "Continued", "OTR AT HRG", "GOOD CAUSE LTR TO CLMT", "WD CLMT DECEASED", "Dismissal", "Withdrawal - No Contact", "Withdrawal - SGA", "Withdrawal - Client Terminated Rep", "Withdrawal - In-Person", "Withdrawal - Client Working/ Doing Better/WD Hrg Req", "Withdrawal - UFD", "Withdrawal - Receiving Benefits", "Withdrawal - Misc"];

  const mannerOptionsList: string[] = mannerOptions.rows.length
    ? mannerOptions.rows.map((r: Record<string, unknown>) => r.option_value as string)
    : ["Get Phone Permission", "Case is Ready", "In Person Florida", "Phone", "OVH"];

  const jerome = jeromeTeamRow.rows[0] as { id: number; team_name: string; team_color: string } | undefined;

  return {
    statCards,
    teamGrandTotals,
    mrStatusByTeam,
    groupedAssigned,
    roundRobin,
    availableMonths: availableMonthsRows.rows.map((r: Record<string, unknown>) => ({
      month_value: r.month_value as string,
      month_label: (r.month_label as string).trim(),
    })),
    availableYears: availableYearsRows.rows.map((r: Record<string, unknown>) => Number(r.year)),
    medical_teams: medicalTeams,
    medical_record_status_options: mrStatusOptionsList,
    hearing_decision_status_options: decisionStatusList,
    manner_options: mannerOptionsList,
    jeromeTeamInfo: jerome ?? null,
    permissions,
    withdrawnCount: Number(withdrawnRow.rows[0]?.cnt ?? 0),
    postHrgCount:   Number(postHrgRow.rows[0]?.cnt ?? 0),
  };
}

// ─── Paginated hearings query ─────────────────────────────────────────────────

export async function getHearingsPaginated(
  filters: HearingFilters,
): Promise<PaginatedHearingsResult> {
  const params: unknown[] = [];
  const where: string[] = [WITHDRAWN_FILTER];

  // Search
  if (filters.search?.trim()) {
    const idx = params.length + 1;
    params.push(`%${filters.search.trim()}%`);
    where.push(`(h.claimant ILIKE $${idx} OR r.name ILIKE $${idx})`);
  }

  // Date range (takes priority over month_filter)
  if (filters.date_range && filters.date_range !== "custom") {
    const ranges: Record<string, string> = {
      today: `h.hearing_date = CURRENT_DATE`,
      this_week: `h.hearing_date BETWEEN date_trunc('week', CURRENT_DATE) AND date_trunc('week', CURRENT_DATE) + INTERVAL '6 days'`,
      this_month: `h.hearing_date BETWEEN date_trunc('month', CURRENT_DATE) AND (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')`,
      next_week: `h.hearing_date BETWEEN date_trunc('week', CURRENT_DATE) + INTERVAL '7 days' AND date_trunc('week', CURRENT_DATE) + INTERVAL '13 days'`,
      next_month: `h.hearing_date BETWEEN date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' AND date_trunc('month', CURRENT_DATE) + INTERVAL '2 months' - INTERVAL '1 day'`,
    };
    if (ranges[filters.date_range]) where.push(ranges[filters.date_range]);
  } else if (filters.date_range === "custom") {
    if (filters.date_from && filters.date_to) {
      params.push(filters.date_from); where.push(`h.hearing_date >= $${params.length}`);
      params.push(filters.date_to);   where.push(`h.hearing_date <= $${params.length}`);
    } else if (filters.date_from) {
      params.push(filters.date_from); where.push(`h.hearing_date >= $${params.length}`);
    } else if (filters.date_to) {
      params.push(filters.date_to); where.push(`h.hearing_date <= $${params.length}`);
    }
  } else if (filters.month_filter) {
    params.push(filters.month_filter);
    where.push(`TO_CHAR(h.hearing_date, 'YYYY-MM') = $${params.length}`);
  }

  // Team filter
  if (filters.team_filter) {
    if (filters.team_filter === "unassigned") {
      where.push("h.mr_team_id IS NULL");
    } else {
      params.push(filters.team_filter);
      where.push(`h.mr_team_id = $${params.length}`);
    }
  }

  // Status filter
  if (filters.status_filter) {
    if (filters.status_filter === "unassigned") {
      where.push("(h.medical_record_status IS NULL OR h.medical_record_status = '')");
    } else {
      params.push(filters.status_filter);
      where.push(`h.medical_record_status = $${params.length}`);
    }
  }

  // Assignment filter
  if (filters.assignment_filter === "no_specialist") {
    where.push("h.mr_team_id IS NULL");
  } else if (filters.assignment_filter === "no_task") {
    where.push("(h.task_assigned IS NULL OR h.task_assigned = false)");
  } else if (filters.assignment_filter === "no_both") {
    where.push("h.mr_team_id IS NULL");
    where.push("(h.task_assigned IS NULL OR h.task_assigned = false)");
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;
  const sortDir = filters.sort_order === "desc" ? "DESC" : "ASC";

  // Count + stats in one pass
  const statsResult = await db.query(
    `SELECT
       COUNT(*)                                                                         AS total,
       SUM(CASE WHEN h.medical_record_status = 'Complete' THEN 1 ELSE 0 END) AS complete,
       SUM(CASE WHEN h.medical_record_status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
       SUM(CASE WHEN h.medical_record_status = 'Ready' THEN 1 ELSE 0 END) AS ready,
       SUM(CASE WHEN h.medical_record_status IS NULL
                  OR h.medical_record_status = 'Not Started' THEN 1 ELSE 0 END) AS not_started,
       SUM(CASE WHEN h.medical_record_status = 'URGENT! NEEDS ATTENTION' THEN 1 ELSE 0 END) AS urgent
     FROM hearings h
     LEFT JOIN representatives r ON h.assigned_rep_id = r.id
     ${whereClause}`,
    params,
  );

  const totalCount = Number(statsResult.rows[0]?.total ?? 0);
  const page    = Math.max(1, filters.page ?? 1);
  const perPage = filters.per_page === "all"
    ? Math.max(1, Math.min(totalCount, 500))
    : Math.max(1, Math.min(500, Number(filters.per_page ?? 50)));
  const offset  = (page - 1) * perPage;

  params.push(perPage); const limitIdx  = params.length;
  params.push(offset);  const offsetIdx = params.length;

  const hearingsResult = await db.query(
    `SELECT
       h.*,
       r.name AS rep_name,
       t.team_name AS mr_team_name,
       t.team_color AS mr_team_color,
       t.team_type AS mr_team_type,
       t.id AS mr_team_id,
       h.hearing_date::text AS hearing_date
     FROM hearings h
     LEFT JOIN representatives r ON h.assigned_rep_id = r.id
     LEFT JOIN mr_teams t ON h.mr_team_id = t.id
     ${whereClause}
     ORDER BY h.hearing_date ${sortDir}, COALESCE(t.display_order, 9999) ASC, h.converted_time_est ${sortDir}
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );

  const sr = statsResult.rows[0] ?? {};
  return {
    hearings: hearingsResult.rows as Hearing[],
    total: totalCount,
    page,
    per_page: perPage,
    total_pages: Math.max(1, Math.ceil(totalCount / perPage)),
    stats: {
      total: totalCount,
      complete: Number(sr.complete    ?? 0),
      in_progress: Number(sr.in_progress ?? 0),
      ready: Number(sr.ready       ?? 0),
      not_started: Number(sr.not_started ?? 0),
      urgent: Number(sr.urgent      ?? 0),
    },
  };
}

// ─── Mutation actions ─────────────────────────────────────────────────────────

export async function updateMrStatus(
  hearingId: number,
  status: string,
): Promise<{ success: boolean }> {
  await db.query(
    `UPDATE hearings SET medical_record_status = $1 WHERE id = $2`,
    [status, hearingId],
  );
  await logActivity("mr_status_updated", `MR status updated to "${status}" for hearing #${hearingId}`);
  return { success: true };
}

export async function updateHearingDecisionStatus(
  hearingId: number,
  status: string,
): Promise<{ success: boolean }> {
  await db.query(
    `UPDATE hearings SET hearing_decision_status = $1 WHERE id = $2`,
    [status, hearingId],
  );
  await logActivity("decision_status_updated", `Decision status updated to "${status}" for hearing #${hearingId}`);

  // If this is a withdrawal-type decision, push a notification for the MR bell
  const isWithdrawal = status.startsWith("Withdrawal") || status === "WD CLMT DECEASED" || status === "Dismissal";
  if (isWithdrawal) {
    const row = await db.query(`SELECT claimant FROM hearings WHERE id = $1`, [hearingId]);
    const claimant = (row.rows[0]?.claimant as string | undefined) ?? `Hearing #${hearingId}`;
    await createWithdrawalNotification(hearingId, claimant);
  }

  return { success: true };
}

export async function updateMrTeam(
  hearingId: number,
  teamId: number | null,
): Promise<{ success: boolean }> {
  await db.query(
    `UPDATE hearings SET mr_team_id = $1, mr_team_assigned_at = $2 WHERE id = $3`,
    [teamId, teamId ? new Date().toISOString() : null, hearingId],
  );
  await logActivity("mr_team_assigned", teamId
    ? `MR team #${teamId} assigned to hearing #${hearingId}`
    : `MR team unassigned from hearing #${hearingId}`);
  return { success: true };
}

export async function toggleTaskAssigned(
  hearingId: number,
  value: boolean,
): Promise<{ success: boolean }> {
  await db.query(
    `UPDATE hearings SET task_assigned = $1 WHERE id = $2`,
    [value, hearingId],
  );
  await logActivity("five_day_notice_updated", `Task assigned set to ${value} for hearing #${hearingId}`);
  return { success: true };
}

export async function toggleCredited(
  hearingId: number,
  value: boolean,
): Promise<{ success: boolean }> {
  await db.query(
    `UPDATE hearings SET credited = $1 WHERE id = $2`,
    [value, hearingId],
  );
  await logActivity("credited_updated", `Credited set to ${value} for hearing #${hearingId}`);
  return { success: true };
}

export async function updateMoa(
  hearingId: number,
  manner: string,
): Promise<{ success: boolean }> {
  await db.query(
    `UPDATE hearings SET manner_of_appearance = $1 WHERE id = $2`,
    [manner, hearingId],
  );
  await logActivity("moa_updated", `MOA updated to "${manner}" for hearing #${hearingId}`);
  return { success: true };
}

export async function updateWorksheetLink(
  hearingId: number,
  link: string,
): Promise<{ success: boolean }> {
  await db.query(
    `UPDATE hearings SET medical_record_link = $1 WHERE id = $2`,
    [link, hearingId],
  );
  await logActivity("mr_link_updated", `Worksheet link updated for hearing #${hearingId}`);
  return { success: true };
}

export async function bulkUpdateMrStatus(
  hearingIds: number[],
  status: string,
): Promise<{ success: boolean; message: string }> {
  if (!hearingIds.length) return { success: false, message: "No hearings selected" };
  const placeholders = hearingIds.map((_, i) => `$${i + 2}`).join(", ");
  await db.query(
    `UPDATE hearings SET medical_record_status = $1 WHERE id IN (${placeholders})`,
    [status, ...hearingIds],
  );
  await logActivity("bulk_mr_status_updated", `Bulk updated ${hearingIds.length} hearing(s) to "${status}"`);
  return { success: true, message: `${hearingIds.length} hearing(s) updated to "${status}"` };
}

export async function assignJeromeUrgent(): Promise<{
  success: boolean;
  message: string;
  count: number;
}> {
  const jerome = await db.query(`
    SELECT id FROM mr_teams WHERE team_name ILIKE '%jerome%' AND is_active = true LIMIT 1
  `);
  const jeromeId = jerome.rows[0]?.id;
  if (!jeromeId) return { success: false, message: "Jerome's Team not found", count: 0 };

  const result = await db.query(`
    UPDATE hearings
    SET mr_team_id = $1, mr_team_assigned_at = NOW()
    WHERE mr_team_id IS NULL
      AND hearing_date >= CURRENT_DATE
      AND hearing_date <= CURRENT_DATE + INTERVAL '28 days'
      AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
    RETURNING id
  `, [jeromeId]);

  const count = result.rows.length;
  await logActivity("urgent_team_assigned", `${count} urgent hearing(s) assigned to Jerome's Team`);
  return { success: true, message: `${count} hearing(s) assigned to Jerome's Team`, count };
}

export async function getRoundRobinState(): Promise<RoundRobinState> {
  const ROTATION_ORDER = ["blue", "orange", "green", "yellow", "purple", "pink"];

  const [rotationRows, lastAssignedRows, nextHearingRows, urgentRows] = await Promise.all([
    db.query(`
      SELECT id, team_name, team_color FROM mr_teams
      WHERE team_color IN ('blue','orange','green','yellow','purple','pink')
        AND is_active = true AND is_assignable = true
      ORDER BY CASE team_color WHEN 'blue' THEN 1 WHEN 'orange' THEN 2 WHEN 'green' THEN 3 WHEN 'yellow' THEN 4 WHEN 'purple' THEN 5 WHEN 'pink' THEN 6 END
    `),
    db.query(`
      SELECT t.team_name, t.team_color FROM hearings h
      JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE t.team_color IN ('blue','orange','green','yellow','purple','pink')
        AND h.mr_team_assigned_at IS NOT NULL
        AND (h.medical_record_status != 'WITHDRAWAL' OR h.medical_record_status IS NULL)
      ORDER BY h.mr_team_assigned_at DESC LIMIT 1
    `),
    db.query(`
      SELECT id, claimant, hearing_date::text FROM hearings
      WHERE mr_team_id IS NULL AND hearing_date >= CURRENT_DATE
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
      ORDER BY hearing_date ASC LIMIT 1
    `),
    db.query(`
      SELECT COUNT(*) AS cnt FROM hearings
      WHERE mr_team_id IS NULL
        AND hearing_date >= CURRENT_DATE
        AND hearing_date <= CURRENT_DATE + INTERVAL '28 days'
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
    `),
  ]);

  const colorToTeam: Record<string, string> = {};
  for (const r of rotationRows.rows as Record<string, unknown>[]) {
    colorToTeam[r.team_color as string] = r.team_name as string;
  }

  const lastRow = lastAssignedRows.rows[0] as Record<string, unknown> | undefined;
  const lastColor = (lastRow?.team_color as string | undefined) ?? "purple";
  const lastTeamName = (lastRow?.team_name  as string | undefined) ?? "None";
  const lastIndex = ROTATION_ORDER.indexOf(lastColor);
  const nextColor = ROTATION_ORDER[(lastIndex + 1) % ROTATION_ORDER.length];

  return {
    lastColor,
    lastTeamName,
    nextColor,
    nextTeamName: colorToTeam[nextColor] ?? "Blue Team",
    rotationOrder: ROTATION_ORDER,
    nextUnassignedHearing: nextHearingRows.rows[0] ?? null,
    urgentUnassignedCount: Number(urgentRows.rows[0]?.cnt ?? 0),
  };
}

export async function getTeamStats(params?: {
  dateFrom?: string;
  dateTo?: string;
  teamId?: number | null;
}): Promise<TeamStatsData> {
  const extraWhere: string[] = [];
  const extraParams: unknown[] = [];

  if (params?.dateFrom) {
    extraParams.push(params.dateFrom);
    extraWhere.push(`h.hearing_date >= $${extraParams.length}`);
  }
  if (params?.dateTo) {
    extraParams.push(params.dateTo);
    extraWhere.push(`h.hearing_date <= $${extraParams.length}`);
  }
  if (params?.teamId) {
    extraParams.push(params.teamId);
    extraWhere.push(`h.mr_team_id = $${extraParams.length}`);
  }

  const extraClause = extraWhere.length ? `AND ${extraWhere.join(" AND ")}` : "";

  const [weeklyRows, monthlyRows] = await Promise.all([
    db.query(`
      SELECT
        TO_CHAR(h.hearing_date, 'IYYY-IW') AS week_key,
        TO_CHAR(date_trunc('week', h.hearing_date), 'Mon DD') AS week_start,
        TO_CHAR(date_trunc('week', h.hearing_date) + INTERVAL '6 days', 'Mon DD, YYYY') AS week_end,
        COALESCE(t.team_name, 'Unassigned') AS team_name,
        t.team_color,
        COALESCE(t.display_order, 9999) AS display_order,
        COUNT(*) AS total_cases,
        SUM(CASE WHEN h.medical_record_status = 'Complete' THEN 1 ELSE 0 END) AS complete,
        SUM(CASE WHEN h.medical_record_status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN h.medical_record_status = 'Ready' THEN 1 ELSE 0 END) AS ready,
        SUM(CASE WHEN h.medical_record_status IS NULL OR h.medical_record_status = 'Not Started' THEN 1 ELSE 0 END) AS not_started,
        SUM(CASE WHEN h.medical_record_status = 'URGENT! NEEDS ATTENTION' THEN 1 ELSE 0 END) AS urgent
      FROM hearings h
      LEFT JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE ${WITHDRAWN_FILTER} ${extraClause}
      GROUP BY TO_CHAR(h.hearing_date,'IYYY-IW'),
               TO_CHAR(date_trunc('week',h.hearing_date),'Mon DD'),
               TO_CHAR(date_trunc('week',h.hearing_date)+INTERVAL '6 days','Mon DD, YYYY'),
               t.team_name, t.team_color, t.display_order
      ORDER BY week_key DESC, COALESCE(t.display_order,9999) ASC
    `, extraParams),
    db.query(`
      SELECT
        TO_CHAR(h.hearing_date, 'YYYY-MM') AS month_key,
        TO_CHAR(h.hearing_date, 'Mon YYYY') AS month_label,
        COALESCE(t.team_name, 'Unassigned') AS team_name,
        t.team_color,
        COALESCE(t.display_order, 9999) AS display_order,
        COUNT(*) AS total_cases,
        SUM(CASE WHEN h.medical_record_status = 'Complete' THEN 1 ELSE 0 END) AS complete,
        SUM(CASE WHEN h.medical_record_status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN h.medical_record_status = 'Ready' THEN 1 ELSE 0 END) AS ready,
        SUM(CASE WHEN h.medical_record_status IS NULL OR h.medical_record_status = 'Not Started' THEN 1 ELSE 0 END) AS not_started,
        SUM(CASE WHEN h.medical_record_status = 'URGENT! NEEDS ATTENTION' THEN 1 ELSE 0 END) AS urgent
      FROM hearings h
      LEFT JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE ${WITHDRAWN_FILTER} ${extraClause}
      GROUP BY TO_CHAR(h.hearing_date,'YYYY-MM'), TO_CHAR(h.hearing_date,'Mon YYYY'),
               t.team_name, t.team_color, t.display_order
      ORDER BY month_key DESC, COALESCE(t.display_order,9999) ASC
    `, extraParams),
  ]);

  const buildMap = (rows: Record<string, unknown>[], getKey: (r: Record<string, unknown>) => string, getLabel: (r: Record<string, unknown>) => string) => {
    const map: Record<string, { label: string; teams: MonthlyTeamStat["teams"]; totals: MonthlyTeamStat["totals"] }> = {};
    for (const r of rows) {
      const key = getKey(r);
      if (!map[key]) map[key] = { label: getLabel(r), teams: [], totals: { total: 0, complete: 0, in_progress: 0, ready: 0, not_started: 0, urgent: 0 } };
      const tc = Number(r.total_cases), co = Number(r.complete), ip = Number(r.in_progress), re = Number(r.ready), ns = Number(r.not_started), ug = Number(r.urgent);
      map[key].teams.push({ team_name: r.team_name as string, team_color: r.team_color as string | null, total_cases: tc, complete: co, in_progress: ip, ready: re, not_started: ns, urgent: ug });
      map[key].totals.total += tc; map[key].totals.complete += co; map[key].totals.in_progress += ip;
      map[key].totals.ready += re; map[key].totals.not_started += ns; map[key].totals.urgent += ug;
    }
    return Object.values(map);
  };

  return {
    weekly: buildMap(weeklyRows.rows as Record<string, unknown>[], r => r.week_key  as string, r => `${r.week_start} - ${r.week_end}`),
    monthly: buildMap(monthlyRows.rows as Record<string, unknown>[], r => r.month_key as string, r => r.month_label as string),
  };
}

export async function getNotifications(): Promise<NotificationItem[]> {
  try {
    const result = await db.query(`
      SELECT n.*, u.full_name AS created_by_name
      FROM sync_notifications n
      LEFT JOIN users u ON n.created_by = u.id
      WHERE n.expires_at > NOW()
      ORDER BY n.created_at DESC
      LIMIT 50
    `);
    return result.rows as NotificationItem[];
  } catch {
    // sync_notifications table not yet migrated — return empty
    return [];
  }
}

// Called by Hearings Dashboard when a withdrawal decision is saved.
// Writes a notification that the MR page bell polls every 30s.
export async function createWithdrawalNotification(
  hearingId: number,
  claimantName: string,
): Promise<void> {
  try {
    const session = await getSession();
    const createdBy = session?.user?.id ?? null;
    await db.query(
      `INSERT INTO sync_notifications
         (notification_type, hearing_id, claimant_name, message, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours')`,
      [
        "withdrawal",
        hearingId,
        claimantName,
        `Withdrawal decision recorded for ${claimantName}`,
        createdBy,
      ],
    );
  } catch {
    // Never let notification creation break the mutation that called it
  }
}

export async function getActivityLog(params: {
  type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  excludeSystemAdmin?: boolean;
}): Promise<{ items: ActivityLogItem[]; total: number }> {
  const where: string[] = [
    `a.action IN ('mr_status_updated','mr_team_assigned','mr_link_updated','decision_status_updated','moa_updated','five_day_notice_updated','credited_updated','bulk_mr_team_assigned','bulk_mr_status_updated','urgent_team_assigned')`,
  ];
  const qParams: unknown[] = [];

  // Exempt system_admin (user id=1) by default — matches dashboard activity log behaviour
  if (params.excludeSystemAdmin !== false) {
    where.push(`u.role != 'system_admin'`);
  }

  if (params.type) {
    qParams.push(params.type);
    where.push(`a.action = $${qParams.length}`);
  }
  if (params.date_from) {
    qParams.push(params.date_from);
    where.push(`a.created_at >= $${qParams.length}`);
  }
  if (params.date_to) {
    qParams.push(params.date_to);
    where.push(`a.created_at <= $${qParams.length}`);
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;
  const page = Math.max(1, params.page ?? 1);
  const perPage = 50;
  const offset = (page - 1) * perPage;

  const [countResult, itemsResult] = await Promise.all([
    db.query(`SELECT COUNT(*) AS cnt FROM activity_log a ${whereClause}`, qParams),
    db.query(
      `SELECT a.*, u.full_name AS user_name, u.role AS user_role
       FROM activity_log a
       JOIN users u ON a.user_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT ${perPage} OFFSET ${offset}`,
      qParams,
    ),
  ]);

  return {
    items: itemsResult.rows as ActivityLogItem[],
    total: Number(countResult.rows[0]?.cnt ?? 0),
  };
}

// ─── Post HRG Notes helpers ───────────────────────────────────────────────────
// Notes are stored as a JSON array in hearings.post_hrg_notes (TEXT column).
// Shape: [{ author: string; date: string; content: string }]
// post_hrg_review (BOOLEAN) is set to true whenever a note is added.

function parsePostHrgNotes(raw: unknown): PostHrgNote[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
    if (Array.isArray(parsed)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return parsed.map((n: any, i: number) => ({
        id:          i,
        hearing_id:  0,
        author_name: n.author ?? n.author_name ?? "Unknown",
        content:     n.content ?? "",
        created_at:  n.date   ?? n.created_at  ?? new Date().toISOString(),
      }));
    }
  } catch { /* fall through */ }
  return [];
}

export async function getPostHrgNotes(hearingId: number): Promise<PostHrgNote[]> {
  // post_hrg_notes is a Phase 4 table — return empty until migrated
  try {
    const result = await db.query(
      `SELECT n.*, u.full_name AS author_name
       FROM post_hrg_notes n
       JOIN users u ON n.user_id = u.id
       WHERE n.hearing_id = $1
       ORDER BY n.created_at DESC`,
      [hearingId],
    );
    return result.rows as PostHrgNote[];
  } catch {
    return [];
  }
}

export async function addPostHrgNote(
  hearingId: number,
  content: string,
): Promise<{ success: boolean; message?: string }> {
  if (!content.trim()) return { success: false, message: "Note cannot be empty" };

  const session = await getSession();
  const authorName = session?.user?.name ?? "Unknown";

  // Fetch existing notes
  const { rows } = await db.query(
    `SELECT post_hrg_notes FROM hearings WHERE id = $1`,
    [hearingId],
  );
  if (!rows[0]) return { success: false, message: "Hearing not found" };

  const existing = parsePostHrgNotes(rows[0].post_hrg_notes);
  const updated = [
    { author: authorName, date: new Date().toISOString(), content: content.trim() },
    ...existing,
  ];

  // Write back + flip post_hrg_review flag to true
  await db.query(
    `UPDATE hearings SET post_hrg_notes = $1, post_hrg_review = true, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(updated), hearingId],
  );

  await logActivity("post_hrg_note_added", `Post HRG note added for hearing #${hearingId}`);
  return { success: true };
}

export async function updatePostHrgDeadline(
  hearingId: number,
  deadline: string,
): Promise<{ success: boolean }> {
  await db.query(
    `UPDATE hearings SET post_hrg_deadline = $1 WHERE id = $2`,
    [deadline, hearingId],
  );
  return { success: true };
}

export async function getPostHrgHearings(
  filters: HearingFilters,
): Promise<PaginatedHearingsResult> {
  return getHearingsPaginated(filters);
}

export async function getCardStats(
  type: "no_specialist" | "no_task",
  year?: string,
  month?: string,
): Promise<{ count: number; nextHearing: { claimant: string; hearing_date: string } | null }> {
  const where: string[] = [
    `(medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)`,
    type === "no_specialist"
      ? "mr_team_id IS NULL"
      : "(task_assigned IS NULL OR task_assigned = false)",
  ];
  const params: unknown[] = [];

  if (year && month) {
    params.push(`${year}-${month.padStart(2, "0")}`);
    where.push(`TO_CHAR(hearing_date, 'YYYY-MM') = $${params.length}`);
  } else if (year) {
    params.push(year);
    where.push(`EXTRACT(YEAR FROM hearing_date)::text = $${params.length}`);
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;

  const [countResult, nextResult] = await Promise.all([
    db.query(`SELECT COUNT(*) AS cnt FROM hearings ${whereClause}`, params),
    db.query(
      `SELECT claimant, hearing_date::text FROM hearings ${whereClause} ORDER BY hearing_date ASC LIMIT 1`,
      params,
    ),
  ]);

  return {
    count: Number(countResult.rows[0]?.cnt ?? 0),
    nextHearing: nextResult.rows[0] ?? null,
  };
}

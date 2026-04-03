"use server";

import { db } from "@/lib/db";

// ─── Shared SQL — excludes withdrawn / dismissed ─────────────────────────────
const WITHDRAWN_FILTER = `
  (h.medical_record_status != 'WITHDRAWAL' OR h.medical_record_status IS NULL)
  AND (
    h.hearing_decision_status IS NULL
    OR (
      h.hearing_decision_status NOT LIKE 'Withdrawal%'
      AND h.hearing_decision_status != 'WD CLMT DECEASED'
      AND h.hearing_decision_status != 'Dismissal'
    )
  )
`.trim();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamDecisionRow {
  team_name: string;
  team_color: string | null;
  hearing_decision_status: string | null;
  cnt: number;
}

export interface TeamMrStatusRow {
  team_name: string;
  team_color: string | null;
  medical_record_status: string | null;
  cnt: number;
}

export interface TeamMemberRow {
  member_name: string;
  team_name: string;
  team_color: string | null;
}

export interface WithdrawalRow {
  team_name: string;
  team_color: string | null;
  hearing_decision_status: string | null;
  cnt: number;
}

export interface MrReportsData {
  decisionByTeam: TeamDecisionRow[];
  mrStatusByTeam: TeamMrStatusRow[];
  withdrawalsByTeam: WithdrawalRow[];
  teamMembers: TeamMemberRow[];
  teamOrder: string[];
}

// ─── Data loader ──────────────────────────────────────────────────────────────

export async function getMrReportsData(month?: string): Promise<MrReportsData> {
  // month is expected as "YYYY-MM" or "all"
  const hasMonthFilter =
    month && month !== "all" && /^\d{4}-\d{2}$/.test(month);
  const monthClause = hasMonthFilter
    ? `AND h.hearing_date >= $1 AND h.hearing_date < ($1::date + INTERVAL '1 month')`
    : "";
  const monthParams = hasMonthFilter ? [`${month}-01`] : [];

  const [decisionRes, mrStatusRes, withdrawalsRes, membersRes, teamOrderRes] =
    await Promise.all([
      // Hearing Decision Status breakdown by team (non-withdrawn)
      db.query(
        `
        SELECT
          COALESCE(t.team_name, 'Unassigned') AS team_name,
          t.team_color,
          h.hearing_decision_status,
          COUNT(*)::int AS cnt
        FROM hearings h
        LEFT JOIN mr_teams t ON h.mr_team_id = t.id
        WHERE ${WITHDRAWN_FILTER} ${monthClause}
        GROUP BY t.team_name, t.team_color, t.display_order, h.hearing_decision_status
        ORDER BY COALESCE(t.display_order, 9999) ASC
      `,
        monthParams,
      ),

      // MR Status breakdown by team (non-withdrawn)
      db.query(
        `
        SELECT
          COALESCE(t.team_name, 'Unassigned') AS team_name,
          t.team_color,
          h.medical_record_status,
          COUNT(*)::int AS cnt
        FROM hearings h
        LEFT JOIN mr_teams t ON h.mr_team_id = t.id
        WHERE ${WITHDRAWN_FILTER} ${monthClause}
        GROUP BY t.team_name, t.team_color, t.display_order, h.medical_record_status
        ORDER BY COALESCE(t.display_order, 9999) ASC
      `,
        monthParams,
      ),

      // Withdrawal / Dismissal rows (for the withdrawal columns)
      db.query(
        `
        SELECT
          COALESCE(t.team_name, 'Unassigned') AS team_name,
          t.team_color,
          h.hearing_decision_status,
          COUNT(*)::int AS cnt
        FROM hearings h
        LEFT JOIN mr_teams t ON h.mr_team_id = t.id
        WHERE (h.hearing_decision_status LIKE 'Withdrawal%'
           OR h.hearing_decision_status = 'WD CLMT DECEASED'
           OR h.hearing_decision_status = 'Dismissal'
           OR h.medical_record_status = 'WITHDRAWAL') ${monthClause}
        GROUP BY t.team_name, t.team_color, t.display_order, h.hearing_decision_status
        ORDER BY COALESCE(t.display_order, 9999) ASC
      `,
        monthParams,
      ),

      // Team members
      db.query(`
        SELECT m.member_name, t.team_name, t.team_color
        FROM mr_team_members m
        JOIN mr_teams t ON m.team_id = t.id
        WHERE t.is_active = true
        ORDER BY t.display_order, m.display_order
      `),

      // Team display order
      db.query(`
        SELECT team_name FROM mr_teams
        WHERE is_active = true
        ORDER BY display_order ASC
      `),
    ]);

  return {
    decisionByTeam: decisionRes.rows as TeamDecisionRow[],
    mrStatusByTeam: mrStatusRes.rows as TeamMrStatusRow[],
    withdrawalsByTeam: withdrawalsRes.rows as WithdrawalRow[],
    teamMembers: membersRes.rows as TeamMemberRow[],
    teamOrder: teamOrderRes.rows.map((r: { team_name: string }) => r.team_name),
  };
}

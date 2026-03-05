"use server";

import { db } from "@/lib/db";

export interface HearingRow {
  id: number;
  claimant: string | null;
  ssn_last_4: string | null;
  claim_type: string | null;
  hearing_date: string;
  hearing_time: string;
  time_zone: string;
  converted_time_est: string | null;
  city: string | null;
  state: string | null;
  alj: string | null;
  manner_of_appearance: string | null;
  hearing_decision_status: string | null;
  assigned_rep_id: number | null;
  mr_team_id: number | null;
  brief_assigned_to: string | null;
  medical_record_status: string | null;
  medical_record_link: string | null;
  claimant_link: string | null;
  assignment_status: string | null;
  task_assigned: boolean;
  rep_docs_complete: boolean;
  rep_docs_assigned_to: string | null;
  fee_agreement_complete: boolean;
  five_day_notice: boolean;
  rfc_status: string | null;
  phi_sheet_complete: boolean;
  post_hrg_review: boolean;
  post_hrg_notes: string | null;
  post_hrg_deadline: string | null;
  rep_name: string | null;
  mr_team_name: string | null;
  mr_team_color: string | null;
}

export interface RepRow {
  id: number;
  name: string;
  email: string | null;
  rep_type: string;
  is_active: boolean;
}

export interface MrTeamRow {
  id: number;
  team_name: string;
  team_color: string | null;
}

export interface ConfigOptionRow {
  id: number;
  option_type: string;
  option_value: string;
  option_color: string | null;
}

export interface RepDocsAssigneeRow {
  id: number;
  name: string;
  is_active: boolean;
}

export interface NextUnassignedRow {
  id: number;
  claimant: string;
  hearing_date: string;
  converted_time_est: string | null;
}

export interface RepWithCount extends RepRow {
  hearing_count: number;
}

export async function fetchDashboardData() {
  const results = await Promise.all([
    db.query(`
        SELECT
          h.id, h.claimant, h.ssn_last_4, h.claim_type,
          h.hearing_date::text, h.hearing_time::text, h.time_zone,
          h.converted_time_est::text,
          h.city, h.state, h.alj, h.manner_of_appearance,
          h.hearing_decision_status,
          h.assigned_rep_id,
          h.mr_team_id,
          h.brief_assigned_to, h.medical_record_status,
          h.medical_record_link, h.claimant_link,
          NULLIF(h.assignment_status::text, '') AS assignment_status,
          h.task_assigned, h.rep_docs_complete, h.rep_docs_assigned_to,
          h.fee_agreement_complete, h.five_day_notice,
          h.rfc_status, h.phi_sheet_complete, h.post_hrg_review,
          h.post_hrg_notes, h.post_hrg_deadline::text,
          r.name AS rep_name,
          t.team_name AS mr_team_name,
          t.team_color AS mr_team_color
        FROM hearings h
        LEFT JOIN representatives r ON r.id = h.assigned_rep_id
        LEFT JOIN mr_teams t ON t.id = h.mr_team_id
        ORDER BY
          CASE WHEN h.claimant_link IS NULL OR h.claimant_link = '' THEN 0 ELSE 1 END ASC,
          CASE WHEN h.claimant_link IS NULL OR h.claimant_link = '' THEN h.id ELSE NULL END DESC,
          CASE WHEN h.claimant_link IS NOT NULL AND h.claimant_link != '' THEN h.hearing_date ELSE NULL END ASC,
          CASE WHEN h.claimant_link IS NOT NULL AND h.claimant_link != '' THEN h.converted_time_est ELSE NULL END ASC
      `),
    db.query(
      "SELECT id, name, email, rep_type, is_active FROM representatives ORDER BY name",
    ),
    db.query(
      "SELECT id, team_name, team_color FROM mr_teams WHERE is_active = true ORDER BY display_order",
    ),
    db.query(
      "SELECT id, option_type, option_value, option_color FROM config_options WHERE is_active = true ORDER BY option_type, display_order",
    ),
    db.query(
      "SELECT id, name, is_active FROM rep_docs_assignees WHERE is_active = true ORDER BY display_order",
    ),
    db.query(
      `SELECT id, claimant, hearing_date::text, converted_time_est::text
         FROM hearings
         WHERE assigned_rep_id IS NULL
           AND (assignment_status IS NULL OR assignment_status = '')
           AND hearing_date >= CURRENT_DATE
         ORDER BY hearing_date ASC, converted_time_est ASC
         LIMIT 1`,
    ),
    db.query(
      `SELECT r.id, r.name, COUNT(h.id)::int AS hearing_count
         FROM representatives r
         LEFT JOIN hearings h ON h.assigned_rep_id = r.id
         WHERE r.is_active = true
         GROUP BY r.id, r.name
         ORDER BY r.name`,
    ),
  ]);

  const [
    hearingsRes,
    repsRes,
    teamsRes,
    configRes,
    assigneesRes,
    nextUnassignedRes,
    repCountsRes,
  ] = results;

  return {
    hearings: hearingsRes.rows as HearingRow[],
    representatives: repsRes.rows as RepRow[],
    mrTeams: teamsRes.rows as MrTeamRow[],
    configOptions: configRes.rows as ConfigOptionRow[],
    repDocsAssignees: assigneesRes.rows as RepDocsAssigneeRow[],
    nextUnassigned: (nextUnassignedRes.rows[0] as NextUnassignedRow) ?? null,
    repCounts: repCountsRes.rows as RepWithCount[],
  };
}

export async function updateHearing(
  hearingId: number,
  field: string,
  value: string | number | boolean | null,
) {
  // Whitelist allowed fields to prevent SQL injection
  const ALLOWED_FIELDS = [
    "assigned_rep_id",
    "mr_team_id",
    "hearing_decision_status",
    "medical_record_status",
    "brief_assigned_to",
    "rep_docs_assigned_to",
    "rfc_status",
    "task_assigned",
    "rep_docs_complete",
    "fee_agreement_complete",
    "five_day_notice",
    "phi_sheet_complete",
    "post_hrg_review",
    "post_hrg_notes",
    "post_hrg_deadline",
  ];

  if (!ALLOWED_FIELDS.includes(field)) {
    throw new Error(`Field "${field}" is not allowed for inline update`);
  }

  await db.query(`UPDATE hearings SET ${field} = $1 WHERE id = $2`, [
    value,
    hearingId,
  ]);
}

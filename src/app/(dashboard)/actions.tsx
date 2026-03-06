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
  rep_type: string | null;
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

export async function fetchDashboardData(
  userRole?: string,
  userEmail?: string,
) {
  // If rep, find their rep ID and filter hearings
  let repFilter = "";
  if (userRole === "rep" && userEmail) {
    const { rows: repRows } = await db.query(
      "SELECT id FROM representatives WHERE email = $1 AND is_active = true LIMIT 1",
      [userEmail],
    );
    if (repRows.length > 0) {
      repFilter = ` WHERE h.assigned_rep_id = ${repRows[0].id}`;
    } else {
      // Rep not found - return empty
      return {
        hearings: [],
        representatives: [],
        mrTeams: [],
        configOptions: [],
        repDocsAssignees: [],
        nextUnassigned: null,
        repCounts: [],
      };
    }
  }

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
          r.rep_type AS rep_type,
          t.team_name AS mr_team_name,
          t.team_color AS mr_team_color
        FROM hearings h
        LEFT JOIN representatives r ON r.id = h.assigned_rep_id
        LEFT JOIN mr_teams t ON t.id = h.mr_team_id
        ${repFilter}
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
    nextUnassigned:
      (nextUnassignedRes.rows[0] as NextUnassignedRow | undefined) ?? null,
    repCounts: (repCountsRes.rows as RepWithCount[]) ?? [],
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

// ── Timezone conversion (same logic as old PHP dashboard) ──
const TZ_MAP: Record<string, number> = {
  ET: 0,
  CT: 1,
  MT: 2,
  PT: 3,
  HA: 5,
  MSTA: 2,
};

function convertToEST(time: string, tz: string): string {
  const offset = TZ_MAP[tz] ?? 0;
  const [h, m] = time.split(":").map(Number);
  const estH = h + offset;
  return `${String(estH).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

// ── Add Hearing ──
export async function addHearing(form: {
  claimant: string;
  ssn_last_4: string;
  claim_type: string;
  hearing_date: string;
  hearing_time: string;
  time_zone: string;
  alj: string;
  city: string;
  state: string;
  claimant_location: string;
  representative_location: string;
  medical_expert: string;
  vocational_expert: string;
  status_date: string;
  entered_hearing_level_date: string;
  download_type: string;
  manner_of_appearance: string;
}) {
  const converted = convertToEST(form.hearing_time, form.time_zone);

  const { rows } = await db.query(
    `INSERT INTO hearings (
      claimant, ssn_last_4, claim_type,
      hearing_date, hearing_time, time_zone, converted_time_est,
      alj, city, state,
      claimant_location, representative_location,
      medical_expert, vocational_expert,
      status_date, entered_hearing_level_date, download_type,
      manner_of_appearance
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
      NULLIF($15, '')::date, NULLIF($16, '')::date, NULLIF($17, ''), NULLIF($18, '')
    ) RETURNING id`,
    [
      form.claimant,
      form.ssn_last_4 || null,
      form.claim_type || null,
      form.hearing_date,
      form.hearing_time,
      form.time_zone,
      converted,
      form.alj || null,
      form.city || null,
      form.state || null,
      form.claimant_location || null,
      form.representative_location || null,
      form.medical_expert || null,
      form.vocational_expert || null,
      form.status_date,
      form.entered_hearing_level_date,
      form.download_type,
      form.manner_of_appearance,
    ],
  );

  return rows[0].id as number;
}

// ── Email All — trigger n8n webhook for each assigned rep ──
export async function emailAllReps(monthFilter: string) {
  let where = "h.assigned_rep_id IS NOT NULL";
  const params: string[] = [];

  if (monthFilter === "future") {
    where += " AND h.hearing_date >= CURRENT_DATE";
  } else if (monthFilter !== "all" && monthFilter) {
    where += " AND to_char(h.hearing_date, 'YYYY-MM') = $1";
    params.push(monthFilter);
  }

  const { rows } = await db.query(
    `SELECT DISTINCT r.id, r.name, r.email, COUNT(h.id)::int AS hearing_count
     FROM hearings h
     JOIN representatives r ON r.id = h.assigned_rep_id
     WHERE ${where}
     GROUP BY r.id, r.name, r.email
     ORDER BY r.name`,
    params,
  );

  // Minimal-alert format: Zero PHI in payload or email body.
  // Email says "You have X hearing assignments. Log in to review."
  // HIPAA-safe for external advocate email addresses.
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
  let emailsSent = 0;
  let emailsFailed = 0;

  if (webhookUrl) {
    for (const rep of rows) {
      if (!rep.email) {
        emailsFailed++;
        continue;
      }
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (webhookSecret) headers["X-Webhook-Secret"] = webhookSecret;

        const response = await fetch(webhookUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            email_type: "hearing_alert_minimal",
            to_email: rep.email,
            to_name: rep.name,
            hearing_count: rep.hearing_count,
            month_filter: monthFilter,
            dashboard_url:
              process.env.NEXT_PUBLIC_APP_URL ||
              "https://hearings.hogansmith.com",
            source: "hsl_hearing_system",
            sent_at: new Date().toISOString(),
          }),
        });
        if (response.ok) emailsSent++;
        else emailsFailed++;
      } catch {
        emailsFailed++;
      }
    }
  }

  return { reps: rows, count: rows.length, emailsSent, emailsFailed };
}

// ── Auto-Assign All (uses full scoring engine from lib/auto-assign) ──
export async function autoAssignAll(options: {
  monthFilter: string;
  selectedRepIds: number[];
  distributionMode: "priority" | "balanced" | "workload";
  totalLimit: number | null;
  excludeRescheduled: boolean;
  sendEmail?: boolean;
}) {
  const { batchAssign, sendAssignmentNotifications } =
    await import("@/lib/auto-assign");
  const result = await batchAssign(options);

  // Send minimal-alert notifications if requested
  if (options.sendEmail && result.breakdown.length > 0) {
    const emailResult = await sendAssignmentNotifications(result.breakdown);
    return {
      ...result,
      emailsSent: emailResult.sent,
      emailsFailed: emailResult.failed,
    };
  }

  return { ...result, emailsSent: 0, emailsFailed: 0 };
}

// ── Unassign All ──
export async function unassignAll(options: {
  monthFilter: string;
  repTypeFilter: string;
  assignDateFilter?: string;
  customAssignDate?: string;
  hearingIds?: number[];
}) {
  if (options.hearingIds && options.hearingIds.length > 0) {
    const { rowCount } = await db.query(
      "UPDATE hearings SET assigned_rep_id = NULL, assignment_timestamp = NULL WHERE id = ANY($1)",
      [options.hearingIds],
    );
    return { unassigned: rowCount ?? 0 };
  }

  let where = "h.assigned_rep_id IS NOT NULL";
  const params: unknown[] = [];
  let paramIdx = 1;

  if (options.monthFilter === "future") {
    where += " AND h.hearing_date >= CURRENT_DATE";
  } else if (options.monthFilter !== "all" && options.monthFilter) {
    where += ` AND to_char(h.hearing_date, 'YYYY-MM') = $${paramIdx}`;
    params.push(options.monthFilter);
    paramIdx++;
  }

  if (options.assignDateFilter) {
    switch (options.assignDateFilter) {
      case "today":
        where += " AND h.assignment_timestamp::date = CURRENT_DATE";
        break;
      case "yesterday":
        where +=
          " AND h.assignment_timestamp::date = CURRENT_DATE - INTERVAL '1 day'";
        break;
      case "last_7_days":
        where +=
          " AND h.assignment_timestamp::date >= CURRENT_DATE - INTERVAL '7 days'";
        break;
      case "custom":
        if (options.customAssignDate) {
          where += ` AND h.assignment_timestamp::date = $${paramIdx}`;
          params.push(options.customAssignDate);
          paramIdx++;
        }
        break;
    }
  }

  if (options.repTypeFilter) {
    where += ` AND h.assigned_rep_id IN (SELECT id FROM representatives WHERE rep_type = $${paramIdx})`;
    params.push(options.repTypeFilter);
  }

  const { rowCount } = await db.query(
    `UPDATE hearings h SET assigned_rep_id = NULL, assignment_timestamp = NULL WHERE ${where}`,
    params,
  );

  return { unassigned: rowCount ?? 0 };
}

// ── Get counts for modal previews ──
export async function getUnassignedCount(
  monthFilter: string,
  excludeRescheduled = true,
) {
  let where =
    "assigned_rep_id IS NULL AND (assignment_status IS NULL OR assignment_status = '')";
  const params: string[] = [];

  if (monthFilter === "future") {
    where += " AND hearing_date >= CURRENT_DATE";
  } else if (monthFilter !== "all" && monthFilter) {
    where += " AND to_char(hearing_date, 'YYYY-MM') = $1";
    params.push(monthFilter);
  }

  if (excludeRescheduled) {
    where += " AND claimant NOT LIKE '%(Rescheduled%'";
  }

  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count FROM hearings WHERE ${where}`,
    params,
  );
  return rows[0].count as number;
}

export async function getAssignedCount(monthFilter: string) {
  let where = "assigned_rep_id IS NOT NULL";
  const params: string[] = [];

  if (monthFilter === "future") {
    where += " AND hearing_date >= CURRENT_DATE";
  } else if (monthFilter !== "all" && monthFilter) {
    where += " AND to_char(hearing_date, 'YYYY-MM') = $1";
    params.push(monthFilter);
  }

  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count FROM hearings WHERE ${where}`,
    params,
  );
  return rows[0].count as number;
}

export interface UnassignPreviewRow {
  id: number;
  claimant: string;
  hearing_date: string;
  converted_time_est: string | null;
  rep_name: string | null;
  rep_type: string | null;
}

export async function getUnassignPreview(options: {
  monthFilter: string;
  assignDateFilter: string;
  customAssignDate: string;
  repTypeFilter: string;
}): Promise<UnassignPreviewRow[]> {
  let where = "h.assigned_rep_id IS NOT NULL";
  const params: unknown[] = [];
  let paramIdx = 1;

  if (options.monthFilter === "future") {
    where += " AND h.hearing_date >= CURRENT_DATE";
  } else if (options.monthFilter && options.monthFilter !== "all") {
    where += ` AND to_char(h.hearing_date, 'YYYY-MM') = $${paramIdx}`;
    params.push(options.monthFilter);
    paramIdx++;
  }

  if (options.assignDateFilter) {
    switch (options.assignDateFilter) {
      case "today":
        where += " AND h.assignment_timestamp::date = CURRENT_DATE";
        break;
      case "yesterday":
        where +=
          " AND h.assignment_timestamp::date = CURRENT_DATE - INTERVAL '1 day'";
        break;
      case "last_7_days":
        where +=
          " AND h.assignment_timestamp::date >= CURRENT_DATE - INTERVAL '7 days'";
        break;
      case "custom":
        if (options.customAssignDate) {
          where += ` AND h.assignment_timestamp::date = $${paramIdx}`;
          params.push(options.customAssignDate);
          paramIdx++;
        }
        break;
    }
  }

  if (options.repTypeFilter) {
    where += ` AND r.rep_type = $${paramIdx}`;
    params.push(options.repTypeFilter);
  }

  const { rows } = await db.query(
    `SELECT h.id, h.claimant, h.hearing_date::text, h.converted_time_est::text,
            r.name AS rep_name, r.rep_type
     FROM hearings h
     JOIN representatives r ON r.id = h.assigned_rep_id
     WHERE ${where}
     ORDER BY h.hearing_date ASC, h.converted_time_est ASC
     LIMIT 500`,
    params,
  );

  return rows as UnassignPreviewRow[];
}

// ── Email All Preview Stats ──
export async function getEmailPreviewStats(monthFilter: string) {
  let where = "h.assigned_rep_id IS NOT NULL AND r.is_active = true";
  const params: string[] = [];

  if (monthFilter === "future") {
    where += " AND h.hearing_date >= CURRENT_DATE";
  } else if (monthFilter !== "all" && monthFilter) {
    where += " AND to_char(h.hearing_date, 'YYYY-MM') = $1";
    params.push(monthFilter);
  }

  const { rows } = await db.query(
    `SELECT
       COUNT(*)::int AS total_hearings,
       COUNT(DISTINCT h.assigned_rep_id)::int AS unique_reps,
       COUNT(DISTINCT CASE WHEN r.email IS NOT NULL AND r.email != '' THEN h.id END)::int AS with_email
     FROM hearings h
     INNER JOIN representatives r ON h.assigned_rep_id = r.id
     WHERE ${where}`,
    params,
  );

  return rows[0] as {
    total_hearings: number;
    unique_reps: number;
    with_email: number;
  };
}

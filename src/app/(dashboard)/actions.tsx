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
  // Edit modal fields
  claimant_location: string | null;
  representative_location: string | null;
  medical_expert: string | null;
  vocational_expert: string | null;
  status_date: string | null;
  entered_hearing_level_date: string | null;
  download_type: string | null;
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
  is_active: boolean;
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

export interface DashboardStats {
  total: number;
  assigned: number;
  unassigned: number;
  wdStatus: number;
  next7Days: number;
  thisMonth: number;
}

export async function fetchDashboardData(
  userRole?: string,
  userEmail?: string,
) {
  let repFilter = "";
  if (userRole === "rep" && userEmail) {
    const { rows: repRows } = await db.query(
      "SELECT id FROM representatives WHERE email = $1 AND is_active = true LIMIT 1",
      [userEmail],
    );
    if (repRows.length > 0) {
      repFilter = ` WHERE h.assigned_rep_id = ${repRows[0].id}`;
    } else {
      return {
        totalCount: 0,
        stats: {
          total: 0,
          assigned: 0,
          unassigned: 0,
          wdStatus: 0,
          next7Days: 0,
          thisMonth: 0,
        } as DashboardStats,
        representatives: [] as RepRow[],
        mrTeams: [] as MrTeamRow[],
        configOptions: [] as ConfigOptionRow[],
        repDocsAssignees: [] as RepDocsAssigneeRow[],
        nextUnassigned: null as NextUnassignedRow | null,
        repCounts: [] as RepWithCount[],
      };
    }
  }

  const [
    repsRes,
    teamsRes,
    configRes,
    assigneesRes,
    nextUnassignedRes,
    repCountsRes,
    statsRes,
  ] = await Promise.all([
    db.query(
      "SELECT id, name, email, rep_type, is_active FROM representatives ORDER BY name",
    ),
    db.query(
      "SELECT id, team_name, team_color, is_active FROM mr_teams ORDER BY display_order",
    ),
    db.query(
      "SELECT id, option_type, option_value, option_color FROM config_options WHERE is_active = true ORDER BY option_type, display_order",
    ),
    db.query(
      "SELECT id, name, is_active FROM rep_docs_assignees WHERE is_active = true ORDER BY display_order",
    ),
    db.query(`SELECT id, claimant, hearing_date::text, converted_time_est::text FROM hearings
      WHERE assigned_rep_id IS NULL AND (assignment_status IS NULL OR assignment_status = '') AND hearing_date >= CURRENT_DATE
      ORDER BY hearing_date ASC, converted_time_est ASC LIMIT 1`),
    db.query(`SELECT r.id, r.name, COUNT(h.id)::int AS hearing_count FROM representatives r
      LEFT JOIN hearings h ON h.assigned_rep_id = r.id WHERE r.is_active = true GROUP BY r.id, r.name ORDER BY r.name`),
    db.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE assigned_rep_id IS NOT NULL)::int AS assigned,
        COUNT(*) FILTER (WHERE assigned_rep_id IS NULL AND (assignment_status IS NULL OR assignment_status = ''))::int AS unassigned,
        COUNT(*) FILTER (WHERE assignment_status IS NOT NULL AND assignment_status != '')::int AS wd_status,
        COUNT(*) FILTER (WHERE hearing_date >= CURRENT_DATE AND hearing_date <= CURRENT_DATE + 7)::int AS next_7_days,
        COUNT(*) FILTER (WHERE to_char(hearing_date, 'YYYY-MM') = to_char(CURRENT_DATE, 'YYYY-MM'))::int AS this_month
      FROM hearings h ${repFilter}
    `),
  ]);

  const s = statsRes.rows[0];
  return {
    totalCount: s.total as number,
    stats: {
      total: s.total,
      assigned: s.assigned,
      unassigned: s.unassigned,
      wdStatus: s.wd_status,
      next7Days: s.next_7_days,
      thisMonth: s.this_month,
    } as DashboardStats,
    representatives: repsRes.rows as RepRow[],
    mrTeams: teamsRes.rows as MrTeamRow[],
    configOptions: configRes.rows as ConfigOptionRow[],
    repDocsAssignees: assigneesRes.rows as RepDocsAssigneeRow[],
    nextUnassigned:
      (nextUnassignedRes.rows[0] as NextUnassignedRow | undefined) ?? null,
    repCounts: repCountsRes.rows as RepWithCount[],
  };
}

// ── Server-side paginated hearings fetch ──
export interface FetchPageParams {
  page: number;
  pageSize: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  month?: string;
  year?: string;
  repId?: string;
  decisionStatus?: string;
  mrTeamId?: string;
  medicalRecordStatus?: string;
  assignmentStatus?: string;
  datePreset?: string;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  userRole?: string;
  userEmail?: string;
}

export async function fetchHearingsPage(
  params: FetchPageParams,
): Promise<{ hearings: HearingRow[]; totalFiltered: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  // Rep filter
  if (params.userRole === "rep" && params.userEmail) {
    const { rows } = await db.query(
      "SELECT id FROM representatives WHERE email = $1 AND is_active = true LIMIT 1",
      [params.userEmail],
    );
    if (rows.length > 0) {
      conditions.push(`h.assigned_rep_id = $${idx}`);
      values.push(rows[0].id);
      idx++;
    } else return { hearings: [], totalFiltered: 0 };
  }

  // Search
  if (params.search) {
    conditions.push(
      `(h.claimant ILIKE $${idx} OR h.ssn_last_4 ILIKE $${idx} OR h.alj ILIKE $${idx} OR h.city ILIKE $${idx} OR r.name ILIKE $${idx})`,
    );
    values.push(`%${params.search}%`);
    idx++;
  }

  // Date presets
  if (params.datePreset && params.datePreset !== "custom") {
    const today = new Date().toISOString().split("T")[0];
    const addDays = (d: Date, n: number) => {
      const r = new Date(d);
      r.setDate(r.getDate() + n);
      return r.toISOString().split("T")[0];
    };
    const d = new Date();
    switch (params.datePreset) {
      case "today":
        conditions.push(`h.hearing_date = $${idx}::date`);
        values.push(today);
        idx++;
        break;
      case "tomorrow":
        conditions.push(`h.hearing_date = $${idx}::date`);
        values.push(addDays(d, 1));
        idx++;
        break;
      case "this-week": {
        const dow = d.getDay();
        conditions.push(
          `h.hearing_date >= $${idx}::date AND h.hearing_date <= $${idx + 1}::date`,
        );
        values.push(addDays(d, -dow), addDays(d, 6 - dow));
        idx += 2;
        break;
      }
      case "next-week": {
        const dow = d.getDay();
        const s = addDays(d, 7 - dow);
        conditions.push(
          `h.hearing_date >= $${idx}::date AND h.hearing_date <= $${idx + 1}::date`,
        );
        values.push(s, addDays(new Date(s + "T12:00:00"), 6));
        idx += 2;
        break;
      }
      case "this-month": {
        const first = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
          .toISOString()
          .split("T")[0];
        conditions.push(
          `h.hearing_date >= $${idx}::date AND h.hearing_date <= $${idx + 1}::date`,
        );
        values.push(first, last);
        idx += 2;
        break;
      }
      case "next-30":
        conditions.push(
          "h.hearing_date >= CURRENT_DATE AND h.hearing_date <= CURRENT_DATE + 30",
        );
        break;
    }
  }
  if (params.dateFrom) {
    conditions.push(`h.hearing_date >= $${idx}::date`);
    values.push(params.dateFrom);
    idx++;
  }
  if (params.dateTo) {
    conditions.push(`h.hearing_date <= $${idx}::date`);
    values.push(params.dateTo);
    idx++;
  }

  // Month/Year
  if (params.month) {
    conditions.push(`EXTRACT(MONTH FROM h.hearing_date) = $${idx}`);
    values.push(parseInt(params.month));
    idx++;
  }
  if (params.year) {
    conditions.push(`EXTRACT(YEAR FROM h.hearing_date) = $${idx}`);
    values.push(parseInt(params.year));
    idx++;
  }

  // Rep
  if (params.repId) {
    if (params.repId === "unassigned")
      conditions.push(
        "h.assigned_rep_id IS NULL AND (h.assignment_status IS NULL OR h.assignment_status = '')",
      );
    else if (params.repId === "wd_never_assigned")
      conditions.push("h.assignment_status = 'wd_never_assigned'");
    else if (params.repId === "withdrawal")
      conditions.push("h.assignment_status = 'withdrawal'");
    else {
      conditions.push(`h.assigned_rep_id = $${idx}`);
      values.push(parseInt(params.repId));
      idx++;
    }
  }

  // Status
  if (params.decisionStatus) {
    conditions.push(`h.hearing_decision_status = $${idx}`);
    values.push(params.decisionStatus);
    idx++;
  }
  if (params.mrTeamId) {
    conditions.push(`h.mr_team_id = $${idx}`);
    values.push(parseInt(params.mrTeamId));
    idx++;
  }
  if (params.medicalRecordStatus) {
    conditions.push(`h.medical_record_status = $${idx}`);
    values.push(params.medicalRecordStatus);
    idx++;
  }
  if (params.assignmentStatus) {
    if (params.assignmentStatus === "assigned")
      conditions.push("h.assigned_rep_id IS NOT NULL");
    else if (params.assignmentStatus === "unassigned")
      conditions.push("h.assigned_rep_id IS NULL");
    else {
      conditions.push(`h.assignment_status = $${idx}`);
      values.push(params.assignmentStatus);
      idx++;
    }
  }

  const where =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  // Sort
  let orderBy: string;
  if (params.sortKey) {
    const dir = params.sortDir === "desc" ? "DESC" : "ASC";
    const colMap: Record<string, string> = {
      assigned_rep_id: "r.name",
      location: "h.city",
      hearing_date: "h.hearing_date",
      claimant: "h.claimant",
      alj: "h.alj",
      hearing_decision_status: "h.hearing_decision_status",
    };
    const col = colMap[params.sortKey] || `h.${params.sortKey}`;
    orderBy = `ORDER BY ${col} ${dir} NULLS LAST`;
  } else {
    orderBy = `ORDER BY
      CASE WHEN h.claimant_link IS NULL OR h.claimant_link = '' THEN 0 ELSE 1 END ASC,
      CASE WHEN h.claimant_link IS NULL OR h.claimant_link = '' THEN h.id ELSE NULL END DESC,
      CASE WHEN h.claimant_link IS NOT NULL AND h.claimant_link != '' THEN h.hearing_date ELSE NULL END ASC,
      CASE WHEN h.claimant_link IS NOT NULL AND h.claimant_link != '' THEN h.converted_time_est ELSE NULL END ASC`;
  }

  const [countRes, dataRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS count FROM hearings h LEFT JOIN representatives r ON r.id = h.assigned_rep_id ${where}`,
      values,
    ),
    db.query(
      `
      SELECT h.id, h.claimant, h.ssn_last_4, h.claim_type,
        h.hearing_date::text, h.hearing_time::text, h.time_zone, h.converted_time_est::text,
        h.city, h.state, h.alj, h.manner_of_appearance, h.hearing_decision_status,
        h.assigned_rep_id, h.mr_team_id, h.brief_assigned_to, h.medical_record_status,
        h.medical_record_link, h.claimant_link,
        NULLIF(h.assignment_status::text, '') AS assignment_status,
        h.task_assigned, h.rep_docs_complete, h.rep_docs_assigned_to,
        h.fee_agreement_complete, h.five_day_notice, h.rfc_status, h.phi_sheet_complete,
        h.post_hrg_review, h.post_hrg_notes, h.post_hrg_deadline::text,
        h.claimant_location, h.representative_location,
        h.medical_expert, h.vocational_expert,
        h.status_date::text, h.entered_hearing_level_date::text, h.download_type,
        r.name AS rep_name, r.rep_type AS rep_type,
        t.team_name AS mr_team_name, t.team_color AS mr_team_color
      FROM hearings h
      LEFT JOIN representatives r ON r.id = h.assigned_rep_id
      LEFT JOIN mr_teams t ON t.id = h.mr_team_id
      ${where} ${orderBy}
      LIMIT $${idx} OFFSET $${idx + 1}
    `,
      [...values, params.pageSize, (params.page - 1) * params.pageSize],
    ),
  ]);

  return {
    hearings: dataRes.rows as HearingRow[],
    totalFiltered: countRes.rows[0].count as number,
  };
}

export async function updateHearing(
  hearingId: number,
  field: string,
  value: string | number | boolean | null,
) {
  const { logAction } = await import("@/lib/activity-log");
  const ALLOWED_FIELDS = [
    "assigned_rep_id",
    "mr_team_id",
    "hearing_decision_status",
    "medical_record_status",
    "brief_assigned_to",
    "rep_docs_assigned_to",
    "rfc_status",
    "manner_of_appearance",
    "assignment_status",
    "task_assigned",
    "rep_docs_complete",
    "fee_agreement_complete",
    "five_day_notice",
    "phi_sheet_complete",
    "post_hrg_review",
    "post_hrg_notes",
    "post_hrg_deadline",
    // Edit modal fields
    "claimant",
    "ssn_last_4",
    "claim_type",
    "hearing_date",
    "hearing_time",
    "time_zone",
    "converted_time_est",
    "alj",
    "city",
    "state",
    "claimant_location",
    "representative_location",
    "medical_expert",
    "vocational_expert",
    "status_date",
    "entered_hearing_level_date",
    "download_type",
  ];

  if (!ALLOWED_FIELDS.includes(field)) {
    throw new Error(`Field "${field}" is not allowed for inline update`);
  }

  // Human-readable field labels matching PHP dashboard
  const FIELD_LABELS: Record<string, string> = {
    assigned_rep_id: "Representative",
    mr_team_id: "Medical Team",
    hearing_decision_status: "Decision",
    medical_record_status: "MR Status",
    brief_assigned_to: "Brief",
    rep_docs_assigned_to: "Docs Assigned",
    rfc_status: "RFC",
    manner_of_appearance: "MOA",
    assignment_status: "Assignment Status",
    task_assigned: "Task Assigned",
    rep_docs_complete: "Rep Docs",
    fee_agreement_complete: "Fee Agreement",
    five_day_notice: "5-Day Notice",
    phi_sheet_complete: "PHI Sheet",
    post_hrg_review: "Post HRG Review",
    post_hrg_notes: "Post HRG Notes",
    post_hrg_deadline: "Post HRG Deadline",
    claimant: "Claimant",
    ssn_last_4: "SSN",
    claim_type: "Claim Type",
    hearing_date: "Hearing Date",
    hearing_time: "Hearing Time",
    time_zone: "Time Zone",
    converted_time_est: "Converted Time EST",
    alj: "ALJ",
    city: "City",
    state: "State",
    claimant_location: "Claimant Location",
    representative_location: "Rep Location",
    medical_expert: "Medical Expert",
    vocational_expert: "Vocational Expert",
    status_date: "Status Date",
    entered_hearing_level_date: "Entered Hearing Level",
    download_type: "Download Type",
    medical_record_link: "MR Worksheet",
  };

  // Get old value before updating
  const { rows: oldRows } = await db.query(
    `SELECT ${field}, claimant FROM hearings WHERE id = $1`,
    [hearingId],
  );
  const oldValue = oldRows[0]?.[field];
  const claimant = oldRows[0]?.claimant || `Hearing #${hearingId}`;

  // Perform the update
  await db.query(`UPDATE hearings SET ${field} = $1 WHERE id = $2`, [
    value,
    hearingId,
  ]);

  // Fire withdrawal notification for global bell
  const isWithdrawal =
    (field === "medical_record_status" && value === "WITHDRAWAL") ||
    (field === "hearing_decision_status" &&
      typeof value === "string" &&
      value.startsWith("Withdrawal"));

  if (isWithdrawal) {
    const { createWithdrawalNotification } = await import("@/lib/notifications");
    await createWithdrawalNotification(hearingId, claimant);
  }

  // Resolve display values for ID fields
  const fieldLabel =
    FIELD_LABELS[field] ||
    field.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  const resolveValue = async (f: string, v: unknown): Promise<string> => {
    if (v === null || v === undefined || v === "") return "(empty)";
    if (f === "assigned_rep_id") {
      const { rows } = await db.query(
        "SELECT name FROM representatives WHERE id = $1",
        [v],
      );
      return rows[0]?.name || String(v);
    }
    if (f === "mr_team_id") {
      const { rows } = await db.query(
        "SELECT team_name FROM mr_teams WHERE id = $1",
        [v],
      );
      return rows[0]?.team_name || String(v);
    }
    if (f === "rep_docs_assigned_to") {
      return String(v);
    }
    // Boolean fields
    if (
      [
        "task_assigned",
        "rep_docs_complete",
        "fee_agreement_complete",
        "five_day_notice",
        "phi_sheet_complete",
      ].includes(f)
    ) {
      return v ? "checked" : "unchecked";
    }
    return String(v);
  };

  // Log with specific action name and detailed description
  if (field === "assigned_rep_id" && value) {
    const newName = await resolveValue(field, value);
    const oldName = oldValue ? await resolveValue(field, oldValue) : "(empty)";
    await logAction(
      "rep_assigned",
      `Assigned ${newName} to: ${claimant}${oldValue ? ` (was: ${oldName})` : ""}`,
    );
  } else if (field === "assigned_rep_id" && !value) {
    const oldName = oldValue ? await resolveValue(field, oldValue) : "unknown";
    await logAction(
      "rep_unassigned",
      `Unassigned ${oldName} from: ${claimant}`,
    );
  } else if (field === "assignment_status") {
    await logAction(
      "status_assigned",
      `Set ${fieldLabel} to '${value || "cleared"}' for: ${claimant}`,
    );
  } else {
    const oldDisplay = await resolveValue(field, oldValue);
    const newDisplay = await resolveValue(field, value);
    await logAction(
      "field_updated",
      `${fieldLabel}: '${oldDisplay}' → '${newDisplay}' for: ${claimant}`,
    );
  }
}

export async function deleteHearing(hearingId: number) {
  const { logAction, getClaimantName } = await import("@/lib/activity-log");
  const claimant = await getClaimantName(hearingId);
  await db.query("DELETE FROM hearings WHERE id = $1", [hearingId]);
  await logAction("hearing_deleted", `Deleted hearing: ${claimant}`);
}

export async function autoAssignSingle(hearingId: number) {
  const { assignSingleHearing } = await import("@/lib/auto-assign");
  const { logAction, getClaimantName } = await import("@/lib/activity-log");
  const { rows } = await db.query(
    "SELECT id FROM representatives WHERE is_active = true",
  );
  const repIds = rows.map((r) => r.id as number);
  const result = await assignSingleHearing(hearingId, repIds, "priority");
  const claimant = await getClaimantName(hearingId);
  if (result.success) {
    await logAction(
      "rep_auto_assigned",
      `Auto-assigned ${result.rep_name} to: ${claimant}`,
    );
  }
  return result;
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

  const { logAction } = await import("@/lib/activity-log");
  await logAction(
    "hearing_created",
    `${form.claimant} added (${form.hearing_date})`,
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

  const { logAction } = await import("@/lib/activity-log");
  await logAction(
    "bulk_email",
    `Batch email sent to ${emailsSent} reps (${monthFilter})`,
  );

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

// ── Get unassigned hearing IDs for chunked processing ──
export async function getUnassignedHearingIds(
  monthFilter: string,
  excludeRescheduled: boolean,
) {
  let where =
    "assigned_rep_id IS NULL AND (assignment_status IS NULL OR assignment_status = '')";
  const params: unknown[] = [];
  let paramIdx = 1;

  if (monthFilter === "future") {
    where += " AND hearing_date >= CURRENT_DATE";
  } else if (monthFilter !== "all" && monthFilter) {
    // Use date range instead of to_char to avoid any timezone issues
    const [yr, mo] = monthFilter.split("-").map(Number);
    const firstDay = `${monthFilter}-01`;
    const lastDay = `${yr}-${String(mo).padStart(2, "0")}-${String(new Date(yr, mo, 0).getDate()).padStart(2, "0")}`;
    where += ` AND hearing_date >= $${paramIdx}::date AND hearing_date <= $${paramIdx + 1}::date`;
    params.push(firstDay, lastDay);
    paramIdx += 2;
  }
  if (excludeRescheduled) {
    where += " AND claimant NOT LIKE '%(Rescheduled%'";
  }

  const { rows } = await db.query(
    `SELECT id FROM hearings WHERE ${where} ORDER BY hearing_date ASC, converted_time_est ASC`,
    params,
  );
  return rows.map((r) => r.id as number);
}

// ── Auto-assign a chunk of hearings (for progress reporting) ──
export async function autoAssignChunk(
  hearingIds: number[],
  selectedRepIds: number[],
  distributionMode: "priority" | "balanced" | "workload",
) {
  const { assignSingleHearing } = await import("@/lib/auto-assign");

  // Fetch claimant names for this chunk
  const { rows: hearingRows } = await db.query(
    "SELECT id, claimant FROM hearings WHERE id = ANY($1)",
    [hearingIds],
  );
  const nameMap = new Map(
    hearingRows.map((r) => [r.id as number, r.claimant as string]),
  );

  const results: {
    hearingId: number;
    claimant: string;
    success: boolean;
    repName?: string;
    repType?: string;
    reason?: string;
  }[] = [];

  for (const id of hearingIds) {
    const res = await assignSingleHearing(id, selectedRepIds, distributionMode);
    results.push({
      hearingId: id,
      claimant: nameMap.get(id) || `#${id}`,
      success: res.success,
      repName: res.rep_name ?? undefined,
      repType: res.rep_type ?? undefined,
      reason: res.success ? undefined : (res.message ?? "Unknown"),
    });
  }

  return results;
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

  const { logAction } = await import("@/lib/activity-log");
  await logAction(
    "bulk_unassign",
    `Bulk unassign: ${rowCount ?? 0} hearings unassigned`,
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
  let paramIdx = 1;

  if (monthFilter === "future") {
    where += " AND hearing_date >= CURRENT_DATE";
  } else if (monthFilter !== "all" && monthFilter) {
    const [yr, mo] = monthFilter.split("-").map(Number);
    const firstDay = `${monthFilter}-01`;
    const lastDay = `${yr}-${String(mo).padStart(2, "0")}-${String(new Date(yr, mo, 0).getDate()).padStart(2, "0")}`;
    where += ` AND hearing_date >= $${paramIdx}::date AND hearing_date <= $${paramIdx + 1}::date`;
    params.push(firstDay, lastDay);
    paramIdx += 2;
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

// ── Activity Log ──
export interface ActivityLogEntry {
  id: number;
  action: string;
  description: string;
  user_name: string | null;
  created_at: string;
  ip_address: string | null;
}

export async function fetchActivityLog(params: {
  page: number;
  pageSize: number;
  category?: string;
  dateRange?: string;
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  excludeSystemAdmin?: boolean;
}): Promise<{
  entries: ActivityLogEntry[];
  total: number;
  users: { id: number; name: string }[];
}> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  // Category filter — action names match PHP dashboard logActivity() calls
  if (params.category && params.category !== "all") {
    const catMap: Record<string, string[]> = {
      assignments: [
        "rep_assigned",
        "rep_unassigned",
        "rep_auto_assigned",
        "batch_auto_assign",
        "bulk_unassign",
        "status_assigned",
      ],
      emails: ["email_sent", "email_failed", "bulk_email"],
      fields: [
        "field_updated",
        "post_hrg_note_added",
        "post_hrg_deadline_updated",
        "post_hrg_note_deleted",
      ],
      hearings: [
        "hearing_updated",
        "hearing_created",
        "hearing_deleted",
        "bulk_delete",
      ],
      schedule: ["schedule_updated", "schedule_lock_override"],
      reps: ["rep_created", "rep_updated", "rep_deleted", "token_revoked"],
    };
    const actions = catMap[params.category];
    if (actions) {
      conditions.push(`a.action = ANY($${idx})`);
      values.push(actions);
      idx++;
    }
  }

  // Date filter
  if (params.dateRange === "today") {
    conditions.push("a.created_at >= CURRENT_DATE");
  } else if (params.dateRange === "this_week") {
    conditions.push("a.created_at >= date_trunc('week', CURRENT_DATE)");
  } else if (params.dateRange === "this_month") {
    conditions.push("a.created_at >= date_trunc('month', CURRENT_DATE)");
  } else if (params.dateRange === "custom" && params.dateFrom) {
    conditions.push(`a.created_at >= $${idx}::date`);
    values.push(params.dateFrom);
    idx++;
    if (params.dateTo) {
      conditions.push(`a.created_at <= $${idx}::date + 1`);
      values.push(params.dateTo);
      idx++;
    }
  }

  // User filter
  if (params.userId) {
    conditions.push(`a.user_id = $${idx}`);
    values.push(parseInt(params.userId));
    idx++;
  }

  // Optionally hide system_admin (user id=1) activities — matches PHP dashboard
  if (params.excludeSystemAdmin) {
    conditions.push(
      `(a.user_id IS NULL OR a.user_id NOT IN (SELECT id FROM users WHERE role = 'system_admin' OR email = 'admin@hogansmith.com'))`,
    );
  }

  const where =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const [countRes, dataRes, usersRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS count FROM activity_log a ${where}`,
      values,
    ),
    db.query(
      `
      SELECT a.id, a.action,
             CASE
               WHEN a.description ~ 'Hearing #[0-9]+' THEN
                 regexp_replace(a.description, 'Hearing #([0-9]+)', COALESCE((
                   SELECT h.claimant FROM hearings h WHERE h.id = (regexp_match(a.description, 'Hearing #([0-9]+)'))[1]::int
                 ), 'Unknown'))
               ELSE a.description
             END AS description,
             u.full_name AS user_name,
             a.created_at::text, a.ip_address
      FROM activity_log a
      LEFT JOIN users u ON u.id = a.user_id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `,
      [...values, params.pageSize, (params.page - 1) * params.pageSize],
    ),
    db.query(
      "SELECT id, full_name AS name FROM users WHERE is_active = true AND id != 1 ORDER BY full_name",
    ),
  ]);

  return {
    entries: dataRes.rows as ActivityLogEntry[],
    total: countRes.rows[0].count as number,
    users: usersRes.rows as { id: number; name: string }[],
  };
}

// ── Rep Stats ──
export interface RepStatRow {
  id: number;
  name: string;
  rep_type: string;
  assigned_count: number;
}

export async function fetchRepStats(params: {
  dateRange?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{
  stats: RepStatRow[];
  totals: {
    total: number;
    internal: number;
    external: number;
    repCount: number;
  };
}> {
  let dateCondition = "";
  const values: unknown[] = [];

  if (params.dateRange === "today") {
    dateCondition = "AND h.assignment_timestamp >= CURRENT_DATE";
  } else if (params.dateRange === "this_week") {
    dateCondition =
      "AND h.assignment_timestamp >= date_trunc('week', CURRENT_DATE)";
  } else if (params.dateRange === "this_month") {
    dateCondition =
      "AND h.assignment_timestamp >= date_trunc('month', CURRENT_DATE)";
  } else if (params.dateRange === "custom" && params.dateFrom) {
    dateCondition = "AND h.assignment_timestamp >= $1::date";
    values.push(params.dateFrom);
    if (params.dateTo) {
      dateCondition += " AND h.assignment_timestamp <= $2::date + 1";
      values.push(params.dateTo);
    }
  }

  const { rows } = await db.query(
    `
    SELECT r.id, r.name, r.rep_type,
           COUNT(h.id)::int AS assigned_count
    FROM representatives r
    LEFT JOIN hearings h ON h.assigned_rep_id = r.id ${dateCondition}
    WHERE r.is_active = true
    GROUP BY r.id, r.name, r.rep_type
    ORDER BY assigned_count DESC, r.name
  `,
    values,
  );

  const stats = rows as RepStatRow[];
  const total = stats.reduce((s, r) => s + r.assigned_count, 0);
  const internal = stats
    .filter(
      (r) => r.rep_type === "internal_advocates" || r.rep_type === "in-house",
    )
    .reduce((s, r) => s + r.assigned_count, 0);
  const external = stats
    .filter(
      (r) => r.rep_type === "external_advocates" || r.rep_type === "contract",
    )
    .reduce((s, r) => s + r.assigned_count, 0);

  return {
    stats,
    totals: {
      total,
      internal,
      external,
      repCount: stats.filter((r) => r.assigned_count > 0).length,
    },
  };
}

// ── Bulk auto-assign selected hearing IDs ──
export async function bulkAutoAssignSelected(
  hearingIds: number[],
  distributionMode: "priority" | "balanced" | "workload" = "priority",
) {
  const { assignSingleHearing } = await import("@/lib/auto-assign");
  const { logAction } = await import("@/lib/activity-log");
  const { rows: repRows } = await db.query(
    "SELECT id FROM representatives WHERE is_active = true",
  );
  const repIds = repRows.map((r) => r.id as number);

  let assigned = 0;
  let failed = 0;
  for (const id of hearingIds) {
    const res = await assignSingleHearing(id, repIds, distributionMode);
    if (res.success) assigned++;
    else failed++;
  }

  await logAction(
    "batch_auto_assign",
    `Bulk auto-assigned ${assigned} of ${hearingIds.length} selected hearings`,
  );
  return { assigned, failed, total: hearingIds.length };
}

// ── Bulk email selected hearing reps ──
export async function bulkEmailSelected(hearingIds: number[]) {
  const { logAction } = await import("@/lib/activity-log");
  // Get distinct reps for the selected hearings
  const { rows } = await db.query(
    `SELECT DISTINCT r.id, r.name, r.email, COUNT(h.id)::int AS hearing_count
     FROM hearings h
     JOIN representatives r ON r.id = h.assigned_rep_id
     WHERE h.id = ANY($1) AND h.assigned_rep_id IS NOT NULL
     GROUP BY r.id, r.name, r.email
     ORDER BY r.name`,
    [hearingIds],
  );

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
            month_filter: "selected",
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

  await logAction(
    "bulk_email",
    `Bulk email sent to ${emailsSent} reps for ${hearingIds.length} selected hearings`,
  );
  return {
    reps: rows.length,
    emailsSent,
    emailsFailed,
    skippedNoRep:
      hearingIds.length - rows.reduce((s, r) => s + r.hearing_count, 0),
  };
}

// ── CSV Compare: fetch all hearings for client-side comparison ──
export async function fetchAllHearingsForCompare() {
  const { rows } = await db.query(
    `SELECT id, LOWER(claimant) as claimant_lower, claimant, ssn_last_4, hearing_date::text, hearing_time, converted_time
     FROM raw_hearings ORDER BY hearing_date DESC`,
  );
  return { hearings: rows, totalCount: rows.length };
}

// ── CSV Compare: import new entries from Chronicle CSV ──
export async function importChronicleEntries(
  entries: {
    claimant: string;
    ssn_last_4: string;
    claim_type: string;
    hearing_date: string;
    hearing_time: string;
    time_zone: string;
    claimant_location: string;
    representative_location: string;
    alj: string;
    medical_expert: string;
    vocational_expert: string;
    status_date: string;
    entered_hearing_level_date: string;
  }[],
) {
  const { logAction } = await import("@/lib/activity-log");
  let imported = 0;
  let skipped = 0;

  for (const e of entries) {
    if (!e.claimant || !e.hearing_date) {
      skipped++;
      continue;
    }
    try {
      await db.query(
        `INSERT INTO raw_hearings (claimant, ssn_last_4, claim_type, hearing_date, hearing_time, time_zone,
         claimant_location, representative_location, alj, medical_expert, vocational_expert,
         status_date, entered_hearing_level_date, converted_time)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          e.claimant,
          e.ssn_last_4 || null,
          e.claim_type || null,
          e.hearing_date,
          e.hearing_time || null,
          e.time_zone || "ET",
          e.claimant_location || null,
          e.representative_location || null,
          e.alj || null,
          e.medical_expert || null,
          e.vocational_expert || null,
          e.status_date || null,
          e.entered_hearing_level_date || null,
          e.hearing_time || null,
        ],
      );
      imported++;
    } catch {
      skipped++;
    }
  }

  if (imported > 0)
    await logAction(
      "import_raw_hearings",
      `Imported ${imported} entries from Chronicle CSV compare to RAW hearings`,
    );
  return { imported, skipped };
}

// ── Export hearings to CSV (returns data for client-side download) ──
export async function exportHearingsCsv(params: FetchPageParams) {
  // Re-use the same filtering logic but without pagination
  const exportParams = { ...params, page: 1, pageSize: 999999 };
  const { hearings } = await fetchHearingsPage(exportParams);

  // Join with rep names
  const { rows: reps } = await db.query("SELECT id, name FROM representatives");
  const repMap = new Map(reps.map((r) => [r.id as number, r.name as string]));
  const { rows: teams } = await db.query("SELECT id, team_name FROM mr_teams");
  const teamMap = new Map(
    teams.map((t) => [t.id as number, t.team_name as string]),
  );

  const csvRows = hearings.map((h) => ({
    Claimant: h.claimant,
    SSN: h.ssn_last_4 || "",
    "Claim Type": h.claim_type || "",
    "Hearing Date": h.hearing_date || "",
    "Hearing Time": h.hearing_time || "",
    "Time Zone": h.time_zone || "",
    "EST Time": h.converted_time_est || "",
    Representative: h.assigned_rep_id
      ? repMap.get(h.assigned_rep_id) || ""
      : h.assignment_status || "Unassigned",
    ALJ: h.alj || "",
    City: h.city || "",
    State: h.state || "",
    "Claimant Location": h.claimant_location || "",
    "Rep Location": h.representative_location || "",
    "MR Team": h.mr_team_id ? teamMap.get(h.mr_team_id) || "" : "",
    "Decision Status": h.hearing_decision_status || "",
    MOA: h.manner_of_appearance || "",
    "Status Date": h.status_date || "",
  }));

  return csvRows;
}

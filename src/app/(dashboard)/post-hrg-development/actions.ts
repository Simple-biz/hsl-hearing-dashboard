"use server";

import { db } from "@/lib/db";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PostHrgRecordType = "MR" | "POST_HRG" | "REP";

export interface PostHrgDevRow {
  id: number;
  hearing_id: number | null;
  record_type: PostHrgRecordType;
  claimant: string;
  hearing_date: string | null;
  assigned_rep: string | null;
  post_hearing_status: string | null;
  type_of_docs_needed: string | null;
  details: string | null;
  person_responsible: string | null;
  em_sent_task_created: boolean;
  ext_letter_sent: boolean;
  status: string | null;
  deadline: string | null;
  new_due_date: string | null;
  remarks: string | null;
  indicator: string | null;
  // Notes (JSON) for fields that have comment sections
  details_notes: string | null;
  person_responsible_notes: string | null;
  em_sent_task_created_notes: string | null;
  ext_letter_sent_notes: string | null;
  status_notes: string | null;
  // Joined from hearings table
  representative_name: string | null;
  rep_type: string | null;
  claimant_link: string | null;
  chronicle_link: string | null;
  claim_type: string | null;
  ssn_last_4: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  post_hrg_notes: string | null;
  post_hrg_deadline: string | null;
}

export interface PostHrgDevStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
}

export interface PostHrgRecordTypeCounts {
  all: number;
  mr: number;
  postHrg: number;
  rep: number;
}

// ─── Config options & representatives ───────────────────────────────────────

export interface ConfigOption {
  value: string;
  color: string | null;
  teamScope: string;
}

export interface RepOption {
  id: number;
  name: string;
}

export interface ResponsibleOption {
  value: string;
  color: string;
}

/**
 * Fetch PH Status options, representatives, and responsible person options.
 */
export interface IndicatorOption {
  value: string;
  label: string;
  color: string;
}

export async function fetchPostHrgOptions(): Promise<{
  phStatusOptions: ConfigOption[];
  statusOptions: ConfigOption[];
  representatives: RepOption[];
  responsibleOptions: ResponsibleOption[];
  indicatorOptions: IndicatorOption[];
  docsNeededOptions: { value: string }[];
}> {
  const [
    configRes,
    statusConfigRes,
    repsRes,
    mrSpecRes,
    mrTeamsRes,
    indicatorRes,
    docsNeededRes,
  ] = await Promise.all([
    db.query(
      `SELECT option_value, option_color, COALESCE(team_scope, 'shared') AS team_scope
       FROM config_options
       WHERE option_type = 'hearing_decision_status'
         AND is_active = true
         AND COALESCE(team_scope, 'shared') IN ('shared', 'post_hearing')
       ORDER BY display_order`,
    ),
    db.query(
      `SELECT option_value, option_color, COALESCE(team_scope, 'shared') AS team_scope
       FROM config_options
       WHERE option_type = 'post_hrg_workflow_status'
         AND is_active = true
       ORDER BY display_order`,
    ),
    db.query(
      `SELECT id, name FROM representatives WHERE is_active = true ORDER BY name`,
    ),
    // MR specialists (individuals)
    db.query(
      `SELECT name FROM mr_specialists WHERE is_active = true ORDER BY display_order, name`,
    ),
    // MR teams
    db.query(
      `SELECT team_name, team_color FROM mr_teams WHERE is_active = true ORDER BY display_order`,
    ),
    db.query(
      `SELECT option_value, option_color FROM config_options
   WHERE option_type = 'post_hrg_indicator' AND is_active = true
   ORDER BY display_order`,
    ),
    db.query(
      `SELECT option_value FROM config_options
       WHERE option_type = 'type_of_docs_needed' AND is_active = true
       ORDER BY display_order`,
    ),
  ]);

  // Build responsible options from DB + hardcoded color mapping
  const PERSON_COLORS: Record<string, string> = {
    Noah: "#DBEAFE",
    Maya: "#EDE9FE",
    Trina: "#EDE9FE",
    Nina: "#EDE9FE",
    Van: "#EDE9FE",
    Jerome: "#DBEAFE",
    Carol: "#EDE9FE",
    Rick: "#DBEAFE",
    Jeff: "#DBEAFE",
    Vera: "#EDE9FE",
    Esther: "#EDE9FE",
    Windell: "#DBEAFE",
    Jared: "#DBEAFE",
    Allen: "#EDE9FE",
    Gail: "#EDE9FE",
    Vicky: "#EDE9FE",
    Austin: "#DBEAFE",
    Kourtney: "#DBEAFE",
    Glenda: "#EDE9FE",
    Emerald: "#EDE9FE",
    Claire: "#EDE9FE",
    Adele: "#EDE9FE",
    Milton: "#F3F4F6",
    Winter: "#DBEAFE",
    Tracy: "#EDE9FE",
    Haya: "#EDE9FE",
    Naomi: "#EDE9FE",
    Charlotte: "#EDE9FE",
    Tina: "#EDE9FE",
    Catherine: "#EDE9FE",
  };
  const TEAM_COLORS_MAP: Record<string, string> = {
    "BLUE TEAM": "#3B82F6",
    "ORANGE TEAM": "#F97316",
    "GREEN TEAM": "#22C55E",
    "YELLOW TEAM": "#EAB308",
    "PURPLE TEAM": "#A855F7",
    ALJ: "#FDBA74",
    "HITMER/ALJ": "#FED7AA",
  };

  const responsibleSet = new Map<string, string>();

  // Add MR specialists from DB
  for (const r of mrSpecRes.rows as { name: string }[]) {
    const color = PERSON_COLORS[r.name] || "#F3F4F6";
    responsibleSet.set(r.name, color);
  }

  // Add hardcoded persons not in DB
  for (const [name, color] of Object.entries(PERSON_COLORS)) {
    if (!responsibleSet.has(name)) responsibleSet.set(name, color);
  }

  // Add MR teams from DB
  for (const t of mrTeamsRes.rows as {
    team_name: string;
    team_color: string | null;
  }[]) {
    const key = t.team_name.toUpperCase().includes("TEAM")
      ? t.team_name
      : t.team_name;
    const color = TEAM_COLORS_MAP[key] || t.team_color || "#F3F4F6";
    responsibleSet.set(key, color);
  }

  // Add hardcoded teams not in DB
  for (const [name, color] of Object.entries(TEAM_COLORS_MAP)) {
    if (!responsibleSet.has(name)) responsibleSet.set(name, color);
  }

  const responsibleOptions: ResponsibleOption[] = Array.from(
    responsibleSet.entries(),
  ).map(([value, color]) => ({ value, color }));

  return {
    phStatusOptions: configRes.rows.map(
      (r: {
        option_value: string;
        option_color: string | null;
        team_scope: string;
      }) => ({
        value: r.option_value,
        color: r.option_color,
        teamScope: r.team_scope,
      }),
    ),
    statusOptions: statusConfigRes.rows.map(
      (r: {
        option_value: string;
        option_color: string | null;
        team_scope: string;
      }) => ({
        value: r.option_value,
        color: r.option_color,
        teamScope: r.team_scope,
      }),
    ),
    representatives: repsRes.rows.map((r: { id: number; name: string }) => ({
      id: r.id,
      name: r.name,
    })),
    responsibleOptions,
    indicatorOptions: indicatorRes.rows.map((r) => ({
      value: r.option_value as string,
      label: r.option_value as string,
      color: (r.option_color as string) || "#9CA3AF",
    })),
    docsNeededOptions: docsNeededRes.rows.map((r: { option_value: string }) => ({
      value: r.option_value,
    })),
  };
}

// ─── Fetch paginated records ────────────────────────────────────────────────

export interface FetchPostHrgPageParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  phStatus?: string;
  indicator?: string;
  recordType?: PostHrgRecordType | "all";
  hearingDateFrom?: string | null;
  hearingDateTo?: string | null;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}

export async function fetchPostHrgDevPage(
  params: FetchPostHrgPageParams,
): Promise<{ records: PostHrgDevRow[]; totalFiltered: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.search?.trim()) {
    conditions.push(
      `(LOWER(p.claimant) LIKE $${idx} OR LOWER(p.assigned_rep) LIKE $${idx}
        OR LOWER(p.person_responsible) LIKE $${idx} OR LOWER(p.details) LIKE $${idx}
        OR LOWER(p.remarks) LIKE $${idx} OR COALESCE(h.ssn_last_4, '') LIKE $${idx})`,
    );
    values.push(`%${params.search.trim().toLowerCase()}%`);
    idx++;
  }

  if (params.status && params.status !== "all") {
    conditions.push(`LOWER(p.status) = LOWER($${idx})`);
    values.push(params.status);
    idx++;
  }

  if (params.phStatus && params.phStatus !== "all") {
    conditions.push(`LOWER(p.post_hearing_status) = LOWER($${idx})`);
    values.push(params.phStatus);
    idx++;
  }

  if (params.indicator && params.indicator !== "all") {
    if (params.indicator === "none") {
      conditions.push(`p.indicator IS NULL`);
    } else {
      conditions.push(`p.indicator = $${idx}`);
      values.push(params.indicator);
      idx++;
    }
  }

  if (params.recordType && params.recordType !== "all") {
    conditions.push(`p.record_type = $${idx}`);
    values.push(params.recordType);
    idx++;
  }

  if (params.hearingDateFrom) {
    conditions.push(`p.hearing_date >= $${idx}::date`);
    values.push(params.hearingDateFrom);
    idx++;
  }

  if (params.hearingDateTo) {
    conditions.push(`p.hearing_date <= $${idx}::date`);
    values.push(params.hearingDateTo);
    idx++;
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const SORT_MAP: Record<string, string> = {
    claimant: "p.claimant",
    hearing_date: "p.hearing_date",
    post_hearing_status: "p.post_hearing_status",
    assigned_rep: "p.assigned_rep",
    person_responsible: "p.person_responsible",
    status: "p.status",
    deadline: "p.deadline",
    new_due_date: "p.new_due_date",
    created_at: "p.created_at",
  };

  const sortCol = SORT_MAP[params.sortKey || ""] || "p.deadline";
  const dir = params.sortDir === "desc" ? "DESC" : "ASC";
  const orderBy = `ORDER BY CASE WHEN p.status = 'Completed' THEN 1 ELSE 0 END ASC, ${sortCol} ${dir} NULLS LAST, p.created_at DESC`;

  const limit = params.pageSize;
  const offset = (params.page - 1) * params.pageSize;

  const [countRes, dataRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM post_hrg_development p
       LEFT JOIN hearings h ON h.id = p.hearing_id
       ${where}`,
      values,
    ),
    db.query(
      `SELECT
        p.id, p.hearing_id, p.record_type, p.claimant, p.hearing_date::text,
        p.assigned_rep, p.post_hearing_status, p.type_of_docs_needed,
        p.details, p.person_responsible,
        p.em_sent_task_created, p.ext_letter_sent,
        p.status, p.deadline::text, p.new_due_date::text,
        p.remarks, p.indicator,
        p.details_notes, p.person_responsible_notes,
        p.em_sent_task_created_notes, p.ext_letter_sent_notes,
        p.status_notes,
        p.created_at::text, p.updated_at::text,
        p.created_by, p.updated_by,
        r.name AS representative_name,
        r.rep_type,
        h.claimant_link,
        h.chronicle_link,
        h.claim_type,
        h.ssn_last_4,
        h.post_hrg_notes,
        h.post_hrg_deadline::text AS post_hrg_deadline
      FROM post_hrg_development p
      LEFT JOIN hearings h ON h.id = p.hearing_id
      LEFT JOIN representatives r ON r.id = h.assigned_rep_id
      ${where}
      ${orderBy}
      LIMIT ${limit} OFFSET ${offset}`,
      values,
    ),
  ]);

  return {
    records: dataRes.rows as PostHrgDevRow[],
    totalFiltered: countRes.rows[0].total,
  };
}

// ─── Fetch all records (non-paginated, kept for backward compat) ────────────

export async function fetchPostHrgDevRecords(): Promise<PostHrgDevRow[]> {
  const { rows } = await db.query(`
    SELECT
      p.id, p.hearing_id, p.record_type, p.claimant, p.hearing_date::text,
      p.assigned_rep, p.post_hearing_status, p.type_of_docs_needed,
      p.details, p.person_responsible,
      p.em_sent_task_created, p.ext_letter_sent,
      p.status, p.deadline::text, p.new_due_date::text,
      p.remarks,
      p.details_notes, p.person_responsible_notes,
      p.em_sent_task_created_notes, p.ext_letter_sent_notes,
      p.status_notes,
      p.created_at::text, p.updated_at::text,
      p.created_by, p.updated_by,
      r.name AS representative_name,
      r.rep_type,
      h.claimant_link,
      h.chronicle_link,
      h.claim_type,
      h.ssn_last_4,
      h.post_hrg_notes,
      h.post_hrg_deadline::text AS post_hrg_deadline
    FROM post_hrg_development p
    LEFT JOIN hearings h ON h.id = p.hearing_id
    LEFT JOIN representatives r ON r.id = h.assigned_rep_id
    ORDER BY
      CASE WHEN p.status = 'Completed' THEN 1 ELSE 0 END ASC,
      p.deadline ASC NULLS LAST,
      p.created_at DESC
  `);
  return rows as PostHrgDevRow[];
}

// ─── Fetch stats ────────────────────────────────────────────────────────────

export async function fetchPostHrgDevStats(
  recordType?: PostHrgRecordType | "all",
): Promise<PostHrgDevStats> {
  const where =
    recordType && recordType !== "all" ? `WHERE record_type = $1` : ``;
  const values = recordType && recordType !== "all" ? [recordType] : [];
  const { rows } = await db.query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE LOWER(status) = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE LOWER(status) = 'in progress')::int AS in_progress,
      COUNT(*) FILTER (WHERE LOWER(status) = 'completed')::int AS completed,
      COUNT(*) FILTER (
        WHERE deadline < CURRENT_DATE
        AND (LOWER(status) IS DISTINCT FROM 'completed')
        AND (LOWER(status) IS DISTINCT FROM 'cancelled')
      )::int AS overdue
    FROM post_hrg_development
    ${where}
  `,
    values,
  );
  const s = rows[0];
  return {
    total: s.total,
    pending: s.pending,
    inProgress: s.in_progress,
    completed: s.completed,
    overdue: s.overdue,
  };
}

export async function fetchPostHrgRecordTypeCounts(): Promise<PostHrgRecordTypeCounts> {
  const { rows } = await db.query(`
    SELECT
      COUNT(*)::int AS all_count,
      COUNT(*) FILTER (WHERE record_type = 'MR')::int AS mr,
      COUNT(*) FILTER (WHERE record_type = 'POST_HRG')::int AS post_hrg,
      COUNT(*) FILTER (WHERE record_type = 'REP')::int AS rep
    FROM post_hrg_development
  `);
  const r = rows[0];
  return {
    all: r.all_count,
    mr: r.mr,
    postHrg: r.post_hrg,
    rep: r.rep,
  };
}

// ─── Create a single record ─────────────────────────────────────────────────

export async function createPostHrgDevRecord(data: {
  claimant: string;
  hearing_date?: string | null;
  assigned_rep?: string | null;
  post_hearing_status?: string | null;
  type_of_docs_needed?: string | null;
  details?: string | null;
  person_responsible?: string | null;
  em_sent_task_created?: boolean;
  ext_letter_sent?: boolean;
  status?: string | null;
  deadline?: string | null;
  new_due_date?: string | null;
  remarks?: string | null;
  created_by?: number | null;
  record_type?: PostHrgRecordType;
}) {
  if (!data.claimant?.trim()) {
    return { success: false, message: "Claimant name is required" };
  }

  // Try to match to a hearing by claimant + date
  let hearingId: number | null = null;
  if (data.hearing_date) {
    const { rows } = await db.query(
      `SELECT id FROM hearings
       WHERE LOWER(TRIM(claimant)) = LOWER(TRIM($1))
         AND hearing_date = $2::date
       LIMIT 1`,
      [data.claimant.trim(), data.hearing_date],
    );
    if (rows[0]) {
      hearingId = rows[0].id;
      // Also pull rep name from hearing if not provided
      if (!data.assigned_rep) {
        const { rows: repRows } = await db.query(
          `SELECT r.name FROM hearings h
           JOIN representatives r ON r.id = h.assigned_rep_id
           WHERE h.id = $1`,
          [hearingId],
        );
        if (repRows[0]) data.assigned_rep = repRows[0].name;
      }
    }
  }

  const { rows } = await db.query(
    `INSERT INTO post_hrg_development (
      hearing_id, claimant, hearing_date, assigned_rep,
      post_hearing_status, type_of_docs_needed, details,
      person_responsible, em_sent_task_created, ext_letter_sent,
      status, deadline, new_due_date, remarks, created_by, record_type
    ) VALUES (
      $1, $2, NULLIF($3, '')::date, $4,
      $5, $6, $7,
      $8, $9, $10,
      $11, NULLIF($12, '')::date, NULLIF($13, '')::date, $14, $15, $16
    ) RETURNING id`,
    [
      hearingId,
      data.claimant.trim(),
      data.hearing_date || null,
      data.assigned_rep || null,
      data.post_hearing_status || null,
      data.type_of_docs_needed || null,
      data.details || null,
      data.person_responsible || null,
      data.em_sent_task_created || false,
      data.ext_letter_sent || false,
      data.status || "Pending",
      data.deadline || null,
      data.new_due_date || null,
      data.remarks || null,
      data.created_by || null,
      data.record_type || "POST_HRG",
    ],
  );

  const { logAction } = await import("@/lib/activity-log");
  await logAction(
    "post_hrg_dev_created",
    `Created post-hrg record for: ${data.claimant.trim()}${hearingId ? ` (linked to hearing #${hearingId})` : ""}`,
  );

  return { success: true, id: rows[0].id, hearingId };
}

// ─── Bulk-create from hearings (one row per (hearing, type)) ────────────────

export interface BulkCreatePostHrgResult {
  created: number;
  skipped: {
    hearingId: number;
    recordType: PostHrgRecordType;
    reason: "already_exists" | "hearing_not_found";
  }[];
}

export async function bulkCreatePostHrgFromHearings(
  hearingIds: number[],
  types: PostHrgRecordType[],
  createdBy: number | null,
): Promise<BulkCreatePostHrgResult> {
  if (hearingIds.length === 0 || types.length === 0) {
    return { created: 0, skipped: [] };
  }

  // CROSS JOIN hearings × types → one INSERT per pair. Legit duplicates (same
  // hearing, same record_type) are now allowed at the schema level, so the
  // bulk button guards against accidental re-clicks with a NOT EXISTS subquery
  // rather than ON CONFLICT. Manual duplicates created from the post-hrg page
  // are unaffected.
  const insertRes = await db.query(
    `INSERT INTO post_hrg_development (
       hearing_id, claimant, hearing_date, assigned_rep, status, record_type, created_by
     )
     SELECT
       h.id,
       h.claimant,
       h.hearing_date,
       r.name,
       'Pending',
       t.record_type,
       $3
     FROM hearings h
     LEFT JOIN representatives r ON r.id = h.assigned_rep_id
     CROSS JOIN unnest($2::post_hrg_record_type[]) AS t(record_type)
     WHERE h.id = ANY($1::int[])
       AND NOT EXISTS (
         SELECT 1
         FROM post_hrg_development p
         WHERE p.hearing_id = h.id
           AND p.record_type = t.record_type
       )
     RETURNING hearing_id, record_type`,
    [hearingIds, types, createdBy],
  );

  const insertedKeys = new Set(
    (insertRes.rows as { hearing_id: number; record_type: string }[]).map(
      (r) => `${r.hearing_id}:${r.record_type}`,
    ),
  );

  const foundHearingIdsRes = await db.query(
    `SELECT id FROM hearings WHERE id = ANY($1::int[])`,
    [hearingIds],
  );
  const foundHearingIds = new Set(
    (foundHearingIdsRes.rows as { id: number }[]).map((r) => r.id),
  );

  const skipped: BulkCreatePostHrgResult["skipped"] = [];
  for (const hid of hearingIds) {
    if (!foundHearingIds.has(hid)) {
      for (const t of types) {
        skipped.push({
          hearingId: hid,
          recordType: t,
          reason: "hearing_not_found",
        });
      }
      continue;
    }
    for (const t of types) {
      if (!insertedKeys.has(`${hid}:${t}`)) {
        skipped.push({
          hearingId: hid,
          recordType: t,
          reason: "already_exists",
        });
      }
    }
  }

  if (insertRes.rows.length > 0) {
    const { logAction } = await import("@/lib/activity-log");
    await logAction(
      "post_hrg_dev_bulk_created",
      `Created ${insertRes.rows.length} post-hrg records from ${hearingIds.length} hearing(s) across ${types.length} type(s): ${types.join(", ")}`,
    );
  }

  return { created: insertRes.rows.length, skipped };
}

// ─── Update a record ────────────────────────────────────────────────────────

export async function updatePostHrgDevRecord(
  id: number,
  data: Partial<{
    claimant: string;
    hearing_date: string | null;
    assigned_rep: string | null;
    post_hearing_status: string | null;
    type_of_docs_needed: string | null;
    details: string | null;
    person_responsible: string | null;
    em_sent_task_created: boolean;
    ext_letter_sent: boolean;
    status: string | null;
    deadline: string | null;
    new_due_date: string | null;
    remarks: string | null;
    updated_by: number | null;
  }>,
) {
  // Build dynamic SET clause from provided fields
  const ALLOWED_FIELDS = [
    "claimant",
    "hearing_date",
    "assigned_rep",
    "post_hearing_status",
    "type_of_docs_needed",
    "details",
    "person_responsible",
    "em_sent_task_created",
    "ext_letter_sent",
    "status",
    "deadline",
    "new_due_date",
    "remarks",
    "updated_by",
  ];

  const DATE_FIELDS = ["hearing_date", "deadline", "new_due_date"];

  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (!ALLOWED_FIELDS.includes(key)) continue;
    if (DATE_FIELDS.includes(key)) {
      sets.push(`${key} = NULLIF($${idx}, '')::date`);
    } else {
      sets.push(`${key} = $${idx}`);
    }
    values.push(value ?? null);
    idx++;
  }

  if (sets.length === 0) {
    return { success: false, message: "No valid fields to update" };
  }

  values.push(id);
  await db.query(
    `UPDATE post_hrg_development SET ${sets.join(", ")} WHERE id = $${idx}`,
    values,
  );

  // Get claimant name for logging
  const { rows } = await db.query(
    "SELECT claimant FROM post_hrg_development WHERE id = $1",
    [id],
  );
  const claimant = rows[0]?.claimant || `Record #${id}`;

  const { logAction } = await import("@/lib/activity-log");
  await logAction(
    "post_hrg_dev_updated",
    `Updated post-hrg record for: ${claimant} (fields: ${Object.keys(data)
      .filter((k) => ALLOWED_FIELDS.includes(k))
      .join(", ")})`,
  );

  return { success: true };
}

// ─── Update a single field (inline edit from dashboard) ─────────────────────

export async function updatePostHrgDevField(
  id: number,
  field: string,
  value: string | number | boolean | null,
) {
  const ALLOWED_FIELDS = [
    "claimant",
    "hearing_date",
    "assigned_rep",
    "post_hearing_status",
    "type_of_docs_needed",
    "details",
    "person_responsible",
    "em_sent_task_created",
    "ext_letter_sent",
    "status",
    "deadline",
    "new_due_date",
    "remarks",
    "indicator",
  ];

  if (!ALLOWED_FIELDS.includes(field)) {
    throw new Error(`Field "${field}" is not allowed for update`);
  }

  const DATE_FIELDS = ["hearing_date", "deadline", "new_due_date"];

  // Get old value for logging
  const { rows: oldRows } = await db.query(
    `SELECT ${field}, claimant FROM post_hrg_development WHERE id = $1`,
    [id],
  );
  const oldValue = oldRows[0]?.[field];
  const claimant = oldRows[0]?.claimant || `Record #${id}`;

  if (DATE_FIELDS.includes(field)) {
    await db.query(
      `UPDATE post_hrg_development SET ${field} = NULLIF($1, '')::date WHERE id = $2`,
      [value, id],
    );
  } else {
    await db.query(
      `UPDATE post_hrg_development SET ${field} = $1 WHERE id = $2`,
      [value, id],
    );
  }

  const FIELD_LABELS: Record<string, string> = {
    claimant: "Claimant",
    hearing_date: "Hearing Date",
    assigned_rep: "Assigned Rep",
    post_hearing_status: "PH Status",
    type_of_docs_needed: "Docs Needed",
    details: "Details",
    person_responsible: "Responsible",
    em_sent_task_created: "EM/Task Created",
    ext_letter_sent: "EXT Letter",
    status: "Status",
    deadline: "Deadline",
    new_due_date: "New Due Date",
    remarks: "Remarks",
    indicator: "Indicator",
  };

  const label = FIELD_LABELS[field] || field;
  const { logAction } = await import("@/lib/activity-log");
  await logAction(
    "post_hrg_dev_field_updated",
    `${label}: '${oldValue ?? "(empty)"}' → '${value ?? "(empty)"}' for: ${claimant}`,
  );
}

// ─── Delete a record ────────────────────────────────────────────────────────

export async function deletePostHrgDevRecord(id: number) {
  const { rows } = await db.query(
    "SELECT claimant FROM post_hrg_development WHERE id = $1",
    [id],
  );
  const claimant = rows[0]?.claimant || `Record #${id}`;

  await db.query("DELETE FROM post_hrg_development WHERE id = $1", [id]);

  const { logAction } = await import("@/lib/activity-log");
  await logAction(
    "post_hrg_dev_deleted",
    `Deleted post-hrg record: ${claimant}`,
  );

  return { success: true };
}

// ─── Record-type categorization (mirrors the SQL backfill migrations) ──────
// Keep these rules in sync with:
//   20260421_backfill_post_hrg_record_type.sql
//   20260421_categorize_post_hrg_residuals.sql
function deriveRecordTypeFromDocs(
  typeOfDocsNeeded: string | null | undefined,
): PostHrgRecordType {
  if (!typeOfDocsNeeded) return "POST_HRG";
  const s = typeOfDocsNeeded.toLowerCase();

  // MR — medical records / consultative examinations
  if (s.includes("medical")) return "MR";
  if (s.includes("ce") && !s.includes("proffer")) return "MR";

  // REP — rep-side / claimant-supplied evidence
  if (
    s.includes("third party") ||
    s.includes("closing statement") ||
    s.includes("tax return") ||
    s.includes("pay stub") ||
    s.includes("earning")
  ) {
    return "REP";
  }

  // Default — post-hearing legal docs (letter / brief / memo / unmatched)
  return "POST_HRG";
}

// ─── Bulk import from XLSX ──────────────────────────────────────────────────

export async function importPostHrgDevRecords(data: {
  mapping: Record<string, number>;
  headers: string[];
  rows: unknown[][];
  rowOffset: number;
  created_by: number;
  comments?: Record<string, string>; // cellRef → comment text
}) {
  const { mapping, rows, created_by, comments } = data;

  let imported = 0;
  let matched = 0;
  const errors: string[] = [];
  // Rows that did NOT make it into the table — surfaced in the UI preview.
  // Includes both silent skips (missing claimant) and INSERT failures.
  const skipped: {
    row: number;
    claimant: string;
    hearingDate: string | null;
    reason: string;
  }[] = [];

  // Parse helpers
  const parseDate = (raw: unknown): string | null => {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slash) {
      const y = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
      return `${y}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const n = Number(s);
    if (!isNaN(n) && n > 40000 && n < 60000) {
      return new Date((n - 25569) * 86400000).toISOString().split("T")[0];
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    return null;
  };

  const parseBool = (raw: unknown): boolean => {
    if (raw === true || raw === 1) return true;
    const s = String(raw ?? "")
      .trim()
      .toLowerCase();
    return ["true", "yes", "1", "✓", "y"].includes(s);
  };

  const getVal = (row: unknown[], field: string): string => {
    const idx = mapping[field];
    if (idx === undefined || idx === null) return "";
    return String((row as string[])[idx] ?? "").trim();
  };

  // Excel column letter from 0-based index (0=A, 1=B, ..., 25=Z, 26=AA)
  const colLetter = (colIdx: number): string => {
    let s = "";
    let n = colIdx;
    while (n >= 0) {
      s = String.fromCharCode((n % 26) + 65) + s;
      n = Math.floor(n / 26) - 1;
    }
    return s;
  };

  // Map field names to their notes column
  const FIELD_TO_NOTES_COL: Record<string, string> = {
    details: "details_notes",
    person_responsible: "person_responsible_notes",
    em_sent_task_created: "em_sent_task_created_notes",
    ext_letter_sent: "ext_letter_sent_notes",
    status: "status_notes",
  };

  // Get cell comment for a given row index and field
  const getCellComment = (rowIdx: number, field: string): string | null => {
    if (!comments) return null;
    const colIdx = mapping[field];
    if (colIdx === undefined) return null;
    // Cell ref: row is rowIdx + 2 (1-based header row + 1-based data)
    const cellRef = `${colLetter(colIdx)}${rowIdx + data.rowOffset + 2}`;
    return comments[cellRef] || null;
  };

  // Build notes JSON from a comment string
  const commentToNotes = (comment: string): string => {
    // Try to parse "[Author - Date] text" format
    const entries: { user: string; date: string; note: string }[] = [];
    const lines = comment.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      const match = line.match(/^\[(.+?)(?:\s*-\s*(.+?))?\]\s*(.+)$/);
      if (match) {
        entries.push({
          user: match[1].trim(),
          date: match[2]?.trim() || "",
          note: match[3].trim(),
        });
      } else {
        entries.push({ user: "Excel Comment", date: "", note: line.trim() });
      }
    }
    return JSON.stringify(entries);
  };

  // Pre-load representatives and responsible persons for fuzzy name matching
  const { rows: repRows } = await db.query(
    `SELECT name FROM representatives WHERE is_active = true`,
  );
  const dbRepNames: string[] = repRows.map((r) => r.name as string);

  const { rows: mrSpecRows } = await db.query(
    `SELECT name FROM mr_specialists WHERE is_active = true`,
  );
  const { rows: mrTeamRows } = await db.query(
    `SELECT team_name FROM mr_teams WHERE is_active = true`,
  );
  const dbResponsibleNames: string[] = [
    ...mrSpecRows.map((r) => r.name as string),
    ...mrTeamRows.map((r) => r.team_name as string),
  ];

  // Resolve a sheet name to the closest DB name (case-insensitive, trimmed)
  function resolveNameFromDb(
    sheetName: string | null,
    dbNames: string[],
  ): string | null {
    if (!sheetName) return null;
    const norm = sheetName.trim().toLowerCase();
    if (!norm) return null;
    // Exact match (case-insensitive)
    const exact = dbNames.find((n) => n.toLowerCase() === norm);
    if (exact) return exact;
    // Partial match — sheet name contained within a DB name or vice-versa
    const partial = dbNames.find(
      (n) => n.toLowerCase().includes(norm) || norm.includes(n.toLowerCase()),
    );
    if (partial) return partial;
    // No match — return original value so it's still visible in the UI
    return sheetName.trim();
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as string[];
    const claimant = getVal(row, "claimant");
    const sheetRowNum = data.rowOffset + i + 2;
    if (!claimant) {
      skipped.push({
        row: sheetRowNum,
        claimant: "",
        hearingDate: null,
        reason: "Missing claimant",
      });
      continue;
    }

    const hearingDate = parseDate(getVal(row, "hearing_date"));

    // Try to match to hearing
    let hearingId: number | null = null;
    let repName: string | null = getVal(row, "assigned_rep") || null;

    if (hearingDate) {
      const { rows: hRows } = await db.query(
        `SELECT h.id, r.name AS rep_name
         FROM hearings h
         LEFT JOIN representatives r ON r.id = h.assigned_rep_id
         WHERE LOWER(TRIM(h.claimant)) = LOWER(TRIM($1))
           AND h.hearing_date = $2::date
         LIMIT 1`,
        [claimant, hearingDate],
      );
      if (hRows[0]) {
        hearingId = hRows[0].id;
        matched++;
        if (!repName && hRows[0].rep_name) repName = hRows[0].rep_name;
      }
    }

    // Resolve rep name and person_responsible against DB values
    repName = resolveNameFromDb(repName, dbRepNames);

    // Extract cell comments for note fields
    const notesData: Record<string, string | null> = {};
    for (const [field, notesCol] of Object.entries(FIELD_TO_NOTES_COL)) {
      const comment = getCellComment(i, field);
      notesData[notesCol] = comment ? commentToNotes(comment) : null;
    }

    try {
      const typeOfDocsValue = getVal(row, "type_of_docs_needed") || null;
      const derivedRecordType = deriveRecordTypeFromDocs(typeOfDocsValue);

      await db.query(
        `INSERT INTO post_hrg_development (
          hearing_id, claimant, hearing_date, assigned_rep,
          post_hearing_status, type_of_docs_needed, details,
          person_responsible, em_sent_task_created, ext_letter_sent,
          status, deadline, new_due_date, remarks, created_by,
          details_notes, person_responsible_notes,
          em_sent_task_created_notes, ext_letter_sent_notes, status_notes,
          record_type
        ) VALUES (
          $1, $2, $3::date, $4,
          $5, $6, $7,
          $8, $9, $10,
          $11, $12::date, $13::date, $14, $15,
          $16, $17, $18, $19, $20,
          $21::post_hrg_record_type
        )`,
        [
          hearingId,
          claimant,
          hearingDate,
          repName,
          getVal(row, "post_hearing_status") || null,
          typeOfDocsValue,
          getVal(row, "details") || null,
          resolveNameFromDb(
            getVal(row, "person_responsible") || null,
            dbResponsibleNames,
          ),
          parseBool(
            mapping.em_sent_task_created !== undefined
              ? row[mapping.em_sent_task_created]
              : false,
          ),
          parseBool(
            mapping.ext_letter_sent !== undefined
              ? row[mapping.ext_letter_sent]
              : false,
          ),
          getVal(row, "status") || "Pending",
          parseDate(getVal(row, "deadline")),
          parseDate(getVal(row, "new_due_date")),
          getVal(row, "remarks") || null,
          created_by,
          notesData.details_notes,
          notesData.person_responsible_notes,
          notesData.em_sent_task_created_notes,
          notesData.ext_letter_sent_notes,
          notesData.status_notes,
          derivedRecordType,
        ],
      );
      imported++;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      errors.push(`Row ${sheetRowNum}: ${reason}`);
      skipped.push({
        row: sheetRowNum,
        claimant,
        hearingDate,
        reason,
      });
    }
  }

  if (imported > 0) {
    const { logAction } = await import("@/lib/activity-log");
    await logAction(
      "post_hrg_dev_import",
      `Imported ${imported} post-hrg records (${matched} linked to hearings)`,
    );
  }

  return { success: true, imported, matched, errors, skipped };
}

// ─── Create from hearing (called when decision set to "Pending Decision") ───

export async function createPostHrgDevFromHearing(hearingId: number) {
  // Check if one already exists for this hearing
  const { rows: existing } = await db.query(
    "SELECT id FROM post_hrg_development WHERE hearing_id = $1 LIMIT 1",
    [hearingId],
  );
  if (existing.length > 0) {
    return { success: true, id: existing[0].id, alreadyExists: true };
  }

  // Pull data from hearing
  const { rows } = await db.query(
    `SELECT h.claimant, h.hearing_date::text, h.hearing_decision_status,
            r.name AS rep_name, h.post_hrg_deadline::text
     FROM hearings h
     LEFT JOIN representatives r ON r.id = h.assigned_rep_id
     WHERE h.id = $1`,
    [hearingId],
  );
  if (!rows[0]) {
    return { success: false, message: "Hearing not found" };
  }

  const h = rows[0];
  const { rows: insertRows } = await db.query(
    `INSERT INTO post_hrg_development (
      hearing_id, claimant, hearing_date, assigned_rep,
      post_hearing_status, status, deadline
    ) VALUES ($1, $2, $3::date, $4, $5, 'Pending', $6::date)
    RETURNING id`,
    [
      hearingId,
      h.claimant,
      h.hearing_date,
      h.rep_name || null,
      h.hearing_decision_status || "Pending Decision",
      h.post_hrg_deadline || null,
    ],
  );

  const { logAction } = await import("@/lib/activity-log");
  await logAction(
    "post_hrg_dev_auto_created",
    `Auto-created post-hrg record for: ${h.claimant} (from hearing #${hearingId})`,
  );

  return { success: true, id: insertRows[0].id, alreadyExists: false };
}

// ─── Notes CRUD (per-field comment sections) ────────────────────────────────

const NOTES_FIELDS = [
  "details_notes",
  "person_responsible_notes",
  "em_sent_task_created_notes",
  "ext_letter_sent_notes",
  "status_notes",
];

function notesColumn(field: string): string {
  const col = `${field}_notes`;
  if (!NOTES_FIELDS.includes(col))
    throw new Error(`Invalid notes field: ${field}`);
  return col;
}

export async function fetchPostHrgDevNotes(
  recordId: number,
  field: string,
): Promise<string | null> {
  const col = notesColumn(field);
  const { rows } = await db.query(
    `SELECT ${col} FROM post_hrg_development WHERE id = $1`,
    [recordId],
  );
  return rows[0]?.[col] ?? null;
}

export async function addPostHrgDevNote(
  recordId: number,
  field: string,
  noteText: string,
  userName: string,
) {
  const col = notesColumn(field);
  const { rows } = await db.query(
    `SELECT ${col}, claimant FROM post_hrg_development WHERE id = $1`,
    [recordId],
  );
  if (!rows[0])
    return { success: false, error: "Record not found", updatedNotes: null };

  let notes: { user: string; date: string; note: string }[] = [];
  try {
    const parsed = JSON.parse(rows[0][col] || "[]");
    if (Array.isArray(parsed)) {
      notes = parsed.map((item: Record<string, unknown>) => ({
        user: String(item.user ?? item.author ?? "Unknown"),
        date: String(item.date ?? item.created_at ?? ""),
        note: String(item.note ?? item.content ?? ""),
      }));
    }
  } catch {
    /* empty */
  }

  notes.unshift({
    user: userName,
    date: new Date().toISOString(),
    note: noteText,
  });
  const updatedNotes = JSON.stringify(notes);

  await db.query(`UPDATE post_hrg_development SET ${col} = $1 WHERE id = $2`, [
    updatedNotes,
    recordId,
  ]);

  const { logAction } = await import("@/lib/activity-log");
  await logAction(
    "post_hrg_dev_note_added",
    `Added ${field} note for: ${rows[0].claimant}`,
  );

  return { success: true, updatedNotes };
}

export async function deletePostHrgDevNote(
  recordId: number,
  field: string,
  noteIndex: number,
) {
  const col = notesColumn(field);
  const { rows } = await db.query(
    `SELECT ${col}, claimant FROM post_hrg_development WHERE id = $1`,
    [recordId],
  );
  if (!rows[0])
    return { success: false, error: "Record not found", updatedNotes: null };

  let notes: { user: string; date: string; note: string }[] = [];
  try {
    const parsed = JSON.parse(rows[0][col] || "[]");
    if (Array.isArray(parsed)) {
      notes = parsed.map((item: Record<string, unknown>) => ({
        user: String(item.user ?? item.author ?? "Unknown"),
        date: String(item.date ?? item.created_at ?? ""),
        note: String(item.note ?? item.content ?? ""),
      }));
    }
  } catch {
    /* empty */
  }

  if (noteIndex < 0 || noteIndex >= notes.length) {
    return {
      success: false,
      error: "Invalid index",
      updatedNotes: JSON.stringify(notes),
    };
  }

  notes.splice(noteIndex, 1);
  const updatedNotes = notes.length > 0 ? JSON.stringify(notes) : null;

  await db.query(`UPDATE post_hrg_development SET ${col} = $1 WHERE id = $2`, [
    updatedNotes,
    recordId,
  ]);

  const { logAction } = await import("@/lib/activity-log");
  await logAction(
    "post_hrg_dev_note_deleted",
    `Deleted ${field} note for: ${rows[0].claimant}`,
  );

  return { success: true, updatedNotes };
}

export interface PostHrgActivityLog {
  id: number;
  action: string;
  description: string;
  userName: string | null;
  createdAt: string;
}

export type PostHrgActivityCategory =
  | "all"
  | "created"
  | "updated"
  | "notes"
  | "deleted"
  | "imported";

const ACTIONS_BY_CATEGORY: Record<PostHrgActivityCategory, string[]> = {
  all: [
    "post_hrg_dev_created",
    "post_hrg_dev_updated",
    "post_hrg_dev_field_updated",
    "post_hrg_dev_deleted",
    "post_hrg_dev_import",
    "post_hrg_dev_note_added",
    "post_hrg_dev_note_deleted",
    "post_hrg_dev_auto_created",
    "post_hrg_dev_bulk_created",
  ],
  created: [
    "post_hrg_dev_created",
    "post_hrg_dev_auto_created",
    "post_hrg_dev_bulk_created",
  ],
  updated: ["post_hrg_dev_updated", "post_hrg_dev_field_updated"],
  notes: ["post_hrg_dev_note_added", "post_hrg_dev_note_deleted"],
  deleted: ["post_hrg_dev_deleted"],
  imported: ["post_hrg_dev_import"],
};

export async function fetchPostHrgActivityLog(
  params: {
    page?: number;
    pageSize?: number;
    search?: string;
    category?: PostHrgActivityCategory;
    fromDate?: string | null;
    toDate?: string | null;
  } = {},
): Promise<{ logs: PostHrgActivityLog[]; total: number }> {
  const category: PostHrgActivityCategory = params.category ?? "all";
  const actions = ACTIONS_BY_CATEGORY[category] ?? ACTIONS_BY_CATEGORY.all;

  const conditions: string[] = [`a.action = ANY($1)`];
  const values: unknown[] = [actions];
  let idx = 2;

  if (params.search?.trim()) {
    conditions.push(
      `(a.description ILIKE $${idx} OR u.full_name ILIKE $${idx})`,
    );
    values.push(`%${params.search.trim()}%`);
    idx++;
  }

  if (params.fromDate) {
    conditions.push(`a.created_at >= $${idx}::date`);
    values.push(params.fromDate);
    idx++;
  }

  if (params.toDate) {
    // Inclusive: include the whole end day.
    conditions.push(`a.created_at < ($${idx}::date + INTERVAL '1 day')`);
    values.push(params.toDate);
    idx++;
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const pg = params.page ?? 1;
  const ps = params.pageSize ?? 50;
  const offset = (pg - 1) * ps;

  const [countRes, dataRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM activity_log a
       LEFT JOIN users u ON u.id = a.user_id
       ${where}`,
      values,
    ),
    db.query(
      `SELECT a.id, a.action, a.description,
              u.full_name AS user_name, a.created_at::text
       FROM activity_log a
       LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT ${ps} OFFSET ${offset}`,
      values,
    ),
  ]);

  return {
    logs: dataRes.rows.map((r: Record<string, unknown>) => ({
      id: r.id as number,
      action: r.action as string,
      description: r.description as string,
      userName: (r.user_name as string) ?? null,
      createdAt: r.created_at as string,
    })),
    total: countRes.rows[0].total,
  };
}

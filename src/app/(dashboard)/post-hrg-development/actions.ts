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
  requirements: string | null;
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
  /** Set by the DB trigger when status transitions to 'Completed'. Cleared
   *  when status transitions away. NULL if the row has never been Completed. */
  completed_at: string | null;
  created_by: number | null;
  updated_by: number | null;
  post_hrg_notes: string | null;
  post_hrg_deadline: string | null;
  // NULL = unacknowledged ("NEW" pill, pinned to top of grid)
  // Timestamp = acknowledged, sorts in normal date order
  acknowledged_at: string | null;
  acknowledged_by_name: string | null; // ← add this line after acknowledged_at
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
  docsNeededOptions: { value: string; color: string | null }[];
}> {
  const [
    configRes,
    statusConfigRes,
    repsRes,
    responsibleRes,
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
    // "Responsible" dropdown — fully admin-managed via Settings → POST HRG.
    // Replaces the prior hybrid (mr_specialists + mr_teams + hardcoded color
    // maps). Seed list lives in 20260514_seed_post_hrg_responsible_options.sql.
    db.query(
      `SELECT option_value, option_color FROM config_options
       WHERE option_type = 'post_hrg_responsible' AND is_active = true
       ORDER BY display_order`,
    ),
    db.query(
      `SELECT option_value, option_color FROM config_options
   WHERE option_type = 'post_hrg_indicator' AND is_active = true
   ORDER BY display_order`,
    ),
    db.query(
      `SELECT option_value, option_color FROM config_options
       WHERE option_type = 'type_of_docs_needed' AND is_active = true
       ORDER BY display_order`,
    ),
  ]);

  const responsibleOptions: ResponsibleOption[] = (
    responsibleRes.rows as {
      option_value: string;
      option_color: string | null;
    }[]
  ).map((r) => ({ value: r.option_value, color: r.option_color || "#F3F4F6" }));

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
    docsNeededOptions: docsNeededRes.rows.map(
      (r: { option_value: string; option_color: string | null }) => ({
        value: r.option_value,
        color: r.option_color,
      }),
    ),
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
  // Which column the date range targets. Defaults to "hearing_date" (the
  // historical meaning of "This Week" / "Today" presets). Set to "created_at"
  // when the user flips the UI toggle to "Date Added" — filters by when the
  // PHD row was created instead of when the hearing is/was.
  dateField?: "hearing_date" | "created_at";
  sortKey?: string;
  sortDir?: "asc" | "desc";
  // When true, restrict results to rows that have not yet been acknowledged.
  // Used by the "Show NEW only" filter chip.
  unacknowledgedOnly?: boolean;
  // When true, restrict results to rows that are past their deadline and
  // not yet completed. Used by the "Show Overdue only" filter chip.
  overdueOnly?: boolean;
  // When true, INCLUDE Completed rows in the result. Default false — the
  // main grid hides Completed rows; the team views them via a dedicated
  // "Completed" modal that calls fetchPostHrgCompletedRecords directly.
  includeCompleted?: boolean;
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

  // Whitelist the date column so an unexpected dateField value can't smuggle
  // SQL. hearing_date is DATE; created_at is TIMESTAMP so cast to date for
  // a same-day inclusive compare against the YYYY-MM-DD bounds.
  const dateCol =
    params.dateField === "created_at" ? "p.created_at::date" : "p.hearing_date";

  if (params.hearingDateFrom) {
    conditions.push(`${dateCol} >= $${idx}::date`);
    values.push(params.hearingDateFrom);
    idx++;
  }

  if (params.hearingDateTo) {
    conditions.push(`${dateCol} <= $${idx}::date`);
    values.push(params.hearingDateTo);
    idx++;
  }

  if (params.unacknowledgedOnly) {
    conditions.push(`p.acknowledged_at IS NULL`);
  }

  if (params.overdueOnly) {
    conditions.push(
      `(p.deadline IS NOT NULL AND p.deadline < CURRENT_DATE AND LOWER(COALESCE(p.status, '')) <> 'completed')`,
    );
  }

  // Hide terminal-status rows (Completed, Records Closed) from the main grid
  // by default — each has its own dedicated modal. EXCEPTION: when the user
  // runs a text search, surface them too so nothing appears "missing" when
  // searching for a known claimant. Those rows render read-only on the client.
  const searchActive = !!params.search?.trim();
  if (!params.includeCompleted && !searchActive) {
    conditions.push(
      `(p.status IS NULL OR LOWER(p.status) NOT IN ('completed', 'records closed'))`,
    );
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
  // Pin unacknowledged ("NEW") rows to the very top, regardless of the
  // user's chosen sort. Within the unacknowledged group, newest first.
  // Then completed rows sink to the bottom of the rest, then user sort.
  const orderBy = `ORDER BY (p.acknowledged_at IS NULL) DESC, CASE WHEN LOWER(p.status) IN ('completed', 'records closed') THEN 1 ELSE 0 END ASC, ${sortCol} ${dir} NULLS LAST, p.created_at DESC`;

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
        p.status, p.deadline::text, p.new_due_date::text, p.requirements,
        p.remarks, p.indicator,
        p.details_notes, p.person_responsible_notes,
        p.em_sent_task_created_notes, p.ext_letter_sent_notes,
        p.status_notes,
        p.created_at::text, p.updated_at::text, p.completed_at::text,
        p.created_by, p.updated_by,
        p.acknowledged_at::text AS acknowledged_at,
        p.acknowledged_by_name,
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
      p.status, p.deadline::text, p.new_due_date::text, p.requirements,
      p.remarks,
      p.details_notes, p.person_responsible_notes,
      p.em_sent_task_created_notes, p.ext_letter_sent_notes,
      p.status_notes,
      p.created_at::text, p.updated_at::text, p.completed_at::text,
      p.created_by, p.updated_by,
      p.acknowledged_at::text AS acknowledged_at,
      p.acknowledged_by_name,
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
      (p.acknowledged_at IS NULL) DESC,
      CASE WHEN LOWER(p.status) IN ('completed', 'records closed') THEN 1 ELSE 0 END ASC,
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
        AND (LOWER(status) IS DISTINCT FROM 'records closed')
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
  // Counts mirror what the main grid actually displays — terminal-status
  // rows (Completed, Records Closed) are hidden and live in their own modals.
  const { rows } = await db.query(`
    SELECT
      COUNT(*)::int AS all_count,
      COUNT(*) FILTER (WHERE record_type = 'MR')::int AS mr,
      COUNT(*) FILTER (WHERE record_type = 'POST_HRG')::int AS post_hrg,
      COUNT(*) FILTER (WHERE record_type = 'REP')::int AS rep
    FROM post_hrg_development
    WHERE status IS NULL OR LOWER(status) NOT IN ('completed', 'records closed')
  `);
  const r = rows[0];
  return {
    all: r.all_count,
    mr: r.mr,
    postHrg: r.post_hrg,
    rep: r.rep,
  };
}

// Lightweight count used to drive the "Completed (N)" / "Records Closed (N)"
// badges on the page header without pulling the full row payload.
// `statusValue` is matched case-insensitively against post_hrg_development.status.
export async function fetchPostHrgCompletedCount(
  statusValue: string = "completed",
): Promise<number> {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM post_hrg_development
      WHERE LOWER(status) = LOWER($1)`,
    [statusValue],
  );
  return rows[0]?.n ?? 0;
}

// Returns every row at the given status, optionally filtered by record_type.
// Used by the Completed / Records Closed modal — most teams have a manageable
// number of such entries so we don't paginate.
export async function fetchPostHrgCompletedRecords(
  recordType?: PostHrgRecordType | "all",
  statusValue: string = "completed",
): Promise<PostHrgDevRow[]> {
  const conditions: string[] = [`LOWER(p.status) = LOWER($1)`];
  const values: unknown[] = [statusValue];
  if (recordType && recordType !== "all") {
    conditions.push(`p.record_type = $2`);
    values.push(recordType);
  }
  const { rows } = await db.query(
    `SELECT
        p.id, p.hearing_id, p.record_type, p.claimant, p.hearing_date::text,
        p.assigned_rep, p.post_hearing_status, p.type_of_docs_needed,
        p.details, p.person_responsible,
        p.em_sent_task_created, p.ext_letter_sent,
        p.status, p.deadline::text, p.new_due_date::text, p.requirements,
        p.remarks, p.indicator,
        p.details_notes, p.person_responsible_notes,
        p.em_sent_task_created_notes, p.ext_letter_sent_notes,
        p.status_notes,
        p.created_at::text, p.updated_at::text, p.completed_at::text,
        p.created_by, p.updated_by,
        p.acknowledged_at::text AS acknowledged_at,
        p.acknowledged_by_name,
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
      WHERE ${conditions.join(" AND ")}
      ORDER BY p.updated_at DESC, p.id DESC`,
    values,
  );
  return rows as PostHrgDevRow[];
}

// Reopen a Completed / Records Closed row — flips status back to "In Progress"
// so it reappears in the main grid. Logged for audit.
export async function reopenPostHrgDevRecord(id: number) {
  const { rows } = await db.query(
    `UPDATE post_hrg_development
        SET status = 'In Progress', updated_at = NOW()
      WHERE id = $1
        AND LOWER(status) IN ('completed', 'records closed')
      RETURNING claimant, hearing_id, status`,
    [id],
  );
  if (rows.length === 0) {
    return {
      success: false,
      message: "Record not found or not in a reopenable status",
    };
  }
  const { logAction } = await import("@/lib/activity-log");
  await logAction(
    "post_hrg_dev_reopened",
    `Reopened post-hrg record: ${rows[0].claimant}`,
    (rows[0].hearing_id as number | null) ?? undefined,
  );
  return { success: true };
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
      status, deadline, new_due_date, remarks, created_by, record_type,
      acknowledged_at
    ) VALUES (
      $1, $2, NULLIF($3, '')::date, $4,
      $5, $6, $7,
      $8, $9, $10,
      $11, NULLIF($12, '')::date, NULLIF($13, '')::date, $14, $15, $16,
      NOW()  -- manual create: user just made it, auto-acknowledge
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
    hearingId,
  );

  return { success: true, id: rows[0].id, hearingId };
}

// ─── Bulk-create from hearings (one row per (hearing, type)) ────────────────

export interface BulkCreatePostHrgResult {
  created: number;
  skipped: {
    hearingId: number;
    recordType: PostHrgRecordType;
    reason: "hearing_not_found";
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

  // CROSS JOIN hearings × types → one INSERT per pair. The `types` array
  // may contain duplicates (e.g. ['MR', 'MR', 'REP']) when the modal asks
  // for multiple records of the same type per hearing — that's intentional
  // and now produces multiple rows. The unique index on (hearing_id,
  // record_type) was relaxed in 20260421_relax_phd_unique_index.sql, so
  // duplicates are first-class.
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
     RETURNING hearing_id, record_type`,
    [hearingIds, types, createdBy],
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

  // Get claimant name + hearing id for logging
  const { rows } = await db.query(
    "SELECT claimant, hearing_id FROM post_hrg_development WHERE id = $1",
    [id],
  );
  const claimant = rows[0]?.claimant || `Record #${id}`;
  const linkedHearingId = (rows[0]?.hearing_id as number | null) ?? undefined;

  const { logAction } = await import("@/lib/activity-log");
  await logAction(
    "post_hrg_dev_updated",
    `Updated post-hrg record for: ${claimant} (fields: ${Object.keys(data)
      .filter((k) => ALLOWED_FIELDS.includes(k))
      .join(", ")})`,
    linkedHearingId,
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
    "requirements",
    "indicator",
    "record_type",
  ];

  if (!ALLOWED_FIELDS.includes(field)) {
    throw new Error(`Field "${field}" is not allowed for update`);
  }

  // Per-user field-access gate (override > role default; rep bypassed)
  {
    const { requireFieldAccess } = await import("@/lib/field-access");
    await requireFieldAccess("post_hrg_development", field);
  }

  const DATE_FIELDS = ["hearing_date", "deadline", "new_due_date"];

  // Get old value + hearing id + record type for logging / mirrors
  const { rows: oldRows } = await db.query(
    `SELECT ${field}, claimant, hearing_id, record_type FROM post_hrg_development WHERE id = $1`,
    [id],
  );
  const oldValue = oldRows[0]?.[field];
  const claimant = oldRows[0]?.claimant || `Record #${id}`;
  const linkedHearingId =
    (oldRows[0]?.hearing_id as number | null) ?? undefined;
  const recordType = String(oldRows[0]?.record_type || "");

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

  // Mirror an MR row's Details Content into the linked hearing's
  // post_hrg_requirements so the MR-mode Post HRG Review modal reflects it.
  // One-way (Details → Requirements); the modal shows Requirements read-only
  // for MR rows, so Details Content is the single source of truth.
  if (field === "details" && recordType === "MR" && linkedHearingId) {
    try {
      await db.query(
        `UPDATE hearings SET post_hrg_requirements = $1 WHERE id = $2`,
        [value ?? null, linkedHearingId],
      );
    } catch (e) {
      console.error("MR details → post_hrg_requirements mirror failed", e);
    }
  }

  // Mirror an MR row's STATUS into the linked hearing's post_hrg_dev_status
  // so the dashboard "Post Hrg Dev" column reflects it (bidirectional — the
  // dashboard side mirrors back in updateHearing). Scoped to MR, same
  // canonical link as the Details → Requirements mirror above. Best-effort.
  if (field === "status" && recordType === "MR" && linkedHearingId) {
    try {
      await db.query(
        `UPDATE hearings SET post_hrg_dev_status = $1 WHERE id = $2`,
        [value ?? null, linkedHearingId],
      );
    } catch (e) {
      console.error(
        "MR status → hearings.post_hrg_dev_status mirror failed",
        e,
      );
    }
  }

  // When an admin RETAGS a row INTO MR (was something else, now MR), push the
  // row's current details + status into the linked hearing's mirror columns
  // so the dashboard reflects the correction immediately — otherwise nothing
  // would update until someone next edits Details or status. Asymmetric on
  // purpose: retagging OUT of MR does NOT clear hearing-side data (avoids a
  // wrong-click silently wiping curated values; admin can clean up manually).
  if (
    field === "record_type" &&
    String(value ?? "") === "MR" &&
    String(oldValue ?? "") !== "MR" &&
    linkedHearingId
  ) {
    try {
      const { rows: cur } = await db.query(
        `SELECT details, status FROM post_hrg_development WHERE id = $1`,
        [id],
      );
      const curDetails = (cur[0]?.details as string | null) ?? null;
      const curStatus = (cur[0]?.status as string | null) ?? null;
      await db.query(
        `UPDATE hearings
            SET post_hrg_requirements = $1,
                post_hrg_dev_status   = $2
          WHERE id = $3`,
        [curDetails, curStatus, linkedHearingId],
      );
    } catch (e) {
      console.error("record_type retag-into-MR auto-mirror failed", e);
    }
  }

  // Append to the per-row deadline history trail (mirrors the hearing-level
  // post_hrg_deadline_history). Only on an actual change to a non-null date.
  if (
    field === "deadline" &&
    (oldValue ?? null) !== (value ?? null) &&
    value
  ) {
    // Best-effort: the primary deadline UPDATE above is already committed, so
    // a history-table problem must NOT make a successful save look failed to
    // the caller (which would trigger an optimistic rollback). Log and move on.
    try {
      let setBy = "Unknown";
      try {
        const { requireAuth } = await import("@/lib/session");
        const session = await requireAuth();
        setBy = session.user.name || session.user.email || "Unknown";
      } catch {
        /* fallback to Unknown */
      }
      await db.query(
        `INSERT INTO post_hrg_dev_deadline_history
           (phd_row_id, hearing_id, deadline, set_by)
         VALUES ($1, $2, $3::date, $4)`,
        [id, linkedHearingId ?? null, value, setBy],
      );
    } catch (e) {
      console.error("post_hrg_dev_deadline_history insert failed", e);
    }
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

  // Format a value for the activity-log message. Date fields (deadline,
  // hearing_date, new_due_date) arrive from the DB as a JS Date — whose raw
  // toString() leaks "GMT+0000 (Coordinated Universal Time)" — so render
  // those as a clean "Mon D, YYYY" in UTC. Everything else stringifies as-is.
  const fmtLogValue = (v: unknown): string => {
    if (v === null || v === undefined || v === "") return "(empty)";
    if (DATE_FIELDS.includes(field)) {
      const date = v instanceof Date ? v : new Date(String(v));
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        });
      }
    }
    return String(v);
  };

  const { logAction } = await import("@/lib/activity-log");
  await logAction(
    "post_hrg_dev_field_updated",
    `${label}: '${fmtLogValue(oldValue)}' → '${fmtLogValue(value)}' for: ${claimant}`,
    linkedHearingId,
  );
}

// ─── Acknowledge a "NEW" record ────────────────────────────────────────────
// Stamps acknowledged_at so the row drops out of the "pinned to top"
// group on next render. Shared across the team — first user to click
// clears it for everyone.

export async function acknowledgePostHrgDevRecord(id: number, byName?: string) {
  const { rows } = await db.query(
    `UPDATE post_hrg_development
        SET acknowledged_at = NOW(),
            acknowledged_by_name = $2
      WHERE id = $1
        AND acknowledged_at IS NULL
      RETURNING claimant, acknowledged_at::text, acknowledged_by_name`,
    [id, byName ?? null],
  );
  if (rows.length === 0)
    return { success: true, acknowledged_at: null, acknowledged_by_name: null };
  return {
    success: true,
    acknowledged_at: rows[0].acknowledged_at as string,
    acknowledged_by_name: rows[0].acknowledged_by_name as string | null,
  };
}

// ─── Delete a record ────────────────────────────────────────────────────────

export async function deletePostHrgDevRecord(id: number) {
  // Server-side role gate — UI hides the trash icon for non-admins but a
  // malicious caller could still invoke this action directly, so require
  // the same allow-list as the client's `isAdmin` check in post-hrg-client.
  const { requireRole } = await import("@/lib/session");
  await requireRole(["system_admin", "admin", "post_hearing_admin"]);

  const { rows } = await db.query(
    "SELECT claimant, hearing_id FROM post_hrg_development WHERE id = $1",
    [id],
  );
  const claimant = rows[0]?.claimant || `Record #${id}`;
  const linkedHearingId = (rows[0]?.hearing_id as number | null) ?? undefined;

  await db.query("DELETE FROM post_hrg_development WHERE id = $1", [id]);

  const { logAction } = await import("@/lib/activity-log");
  await logAction(
    "post_hrg_dev_deleted",
    `Deleted post-hrg record: ${claimant}`,
    linkedHearingId,
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

  // MR — strictly medical records. Any other "CE..." variants (CE Report,
  // Updated CE, CE Proffer, plain CE, etc.) flow through to POST_HRG by
  // default, since they describe post-hearing CE *documents* rather than
  // medical record requests.
  if (s.includes("medical")) return "MR";

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

  // Default — post-hearing legal docs (letter / brief / memo / CE-related
  // / unmatched).
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
          record_type, acknowledged_at
        ) VALUES (
          $1, $2, $3::date, $4,
          $5, $6, $7,
          $8, $9, $10,
          $11, $12::date, $13::date, $14, $15,
          $16, $17, $18, $19, $20,
          $21::post_hrg_record_type, NOW()  -- bulk historical load: auto-ack
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
    hearingId,
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

// Lightweight read used by the PHD-internal modal to keep its Deadline
// + Requirements fields in sync if a teammate edits them concurrently.
export async function fetchPostHrgDevDeadlineAndRequirements(
  recordId: number,
): Promise<{ deadline: string | null; requirements: string | null }> {
  const { rows } = await db.query(
    `SELECT deadline::text AS deadline, requirements
       FROM post_hrg_development WHERE id = $1`,
    [recordId],
  );
  return {
    deadline: rows[0]?.deadline ?? null,
    requirements: rows[0]?.requirements ?? null,
  };
}

// Which record types exist for a hearing — used by the Post HRG Review
// modal to decide which "Also apply to" cascade checkboxes to offer.
// MR is always treated as present (it maps to the hearing's own
// post_hrg_* columns, not an MR PHD row), but POST_HRG / REP only
// surface as checkboxes when an actual PHD row of that type exists.
export async function fetchPhdRelatedRecordTypes(
  hearingId: number,
): Promise<{ MR: boolean; POST_HRG: boolean; REP: boolean }> {
  const { rows } = await db.query(
    `SELECT DISTINCT record_type
       FROM post_hrg_development
      WHERE hearing_id = $1`,
    [hearingId],
  );
  const set = new Set<string>(rows.map((r) => String(r.record_type)));
  return {
    MR: true,
    POST_HRG: set.has("POST_HRG"),
    REP: set.has("REP"),
  };
}

// Apply a deadline or requirements value across selected record types
// for the same hearing. "MR" maps to the hearing-level column; POST_HRG
// and REP map to their PHD rows. Skips targets that don't exist so the
// caller can pass a superset safely.
export async function cascadePhdField(
  hearingId: number,
  field: "deadline" | "requirements",
  value: string | null,
  targets: PostHrgRecordType[],
): Promise<{ success: true; updated: number }> {
  if (!hearingId || targets.length === 0) {
    return { success: true, updated: 0 };
  }

  let updated = 0;

  // MR target → hearings.post_hrg_* (the canonical source for MR-mode modal).
  if (targets.includes("MR")) {
    if (field === "deadline") {
      const res = await db.query(
        `UPDATE hearings
            SET post_hrg_deadline = NULLIF($1, '')::date
          WHERE id = $2`,
        [value, hearingId],
      );
      updated += res.rowCount ?? 0;
    } else {
      const res = await db.query(
        `UPDATE hearings SET post_hrg_requirements = $1 WHERE id = $2`,
        [value, hearingId],
      );
      updated += res.rowCount ?? 0;
    }
  }

  // POST_HRG / REP targets → post_hrg_development.(deadline|requirements)
  const phdTargets = targets.filter((t) => t !== "MR");
  if (phdTargets.length > 0) {
    if (field === "deadline") {
      const res = await db.query(
        `UPDATE post_hrg_development
            SET deadline = NULLIF($1, '')::date, updated_at = NOW()
          WHERE hearing_id = $2
            AND record_type = ANY($3::post_hrg_record_type[])
          RETURNING id`,
        [value, hearingId, phdTargets],
      );
      updated += res.rowCount ?? 0;
      // Trail each cascaded row's new deadline (non-null only). Best-effort —
      // the cascade UPDATE is already committed, so a history-table problem
      // must not make a successful cascade throw.
      if (value && res.rows.length > 0) {
        try {
          let setBy = "Unknown";
          try {
            const { requireAuth } = await import("@/lib/session");
            const session = await requireAuth();
            setBy = session.user.name || session.user.email || "Unknown";
          } catch {
            /* fallback to Unknown */
          }
          for (const row of res.rows) {
            await db.query(
              `INSERT INTO post_hrg_dev_deadline_history
                 (phd_row_id, hearing_id, deadline, set_by)
               VALUES ($1, $2, $3::date, $4)`,
              [row.id, hearingId, value, setBy],
            );
          }
        } catch (e) {
          console.error(
            "post_hrg_dev_deadline_history cascade insert failed",
            e,
          );
        }
      }
    } else {
      const res = await db.query(
        `UPDATE post_hrg_development
            SET requirements = $1, updated_at = NOW()
          WHERE hearing_id = $2
            AND record_type = ANY($3::post_hrg_record_type[])`,
        [value, hearingId, phdTargets],
      );
      updated += res.rowCount ?? 0;
    }
  }

  if (updated > 0) {
    const { logAction } = await import("@/lib/activity-log");
    const label = field === "deadline" ? "Deadline" : "Requirements";

    // Resolve the claimant so the entry reads "for: <name>" like the other
    // activity-log messages — instead of an internal "hearing #<id>".
    let claimant = "";
    try {
      const { rows } = await db.query(
        "SELECT claimant FROM hearings WHERE id = $1",
        [hearingId],
      );
      claimant = (rows[0]?.claimant as string | undefined)?.trim() ?? "";
    } catch {
      /* best-effort — fall back to no name */
    }

    // Clean value display: deadline → "Mon D, YYYY" (UTC); cleared → marker.
    let valueDisplay: string;
    if (value === null || value === "") {
      valueDisplay = "(cleared)";
    } else if (field === "deadline") {
      const d = new Date(value);
      valueDisplay = isNaN(d.getTime())
        ? value
        : d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          });
    } else {
      valueDisplay = value;
    }

    await logAction(
      "post_hrg_dev_cascade",
      `Cascaded ${label} to ${targets.join(", ")}: '${valueDisplay}' (${updated} row${updated === 1 ? "" : "s"})${claimant ? ` for: ${claimant}` : ""}`,
      hearingId,
    );
  }

  return { success: true, updated };
}

// ─── Per-PHD-row deadline history ───────────────────────────────────────────

export interface PhdDeadlineHistoryEntry {
  deadline: string;
  set_at: string;
  set_by: string | null;
}

// Full deadline-change trail for a single PHD row (REP / POST_HRG / unlinked
// MR). The hearing-level equivalent is fetchPostHrgDeadlineHistory.
export async function fetchPhdDeadlineHistory(
  phdRowId: number,
): Promise<PhdDeadlineHistoryEntry[]> {
  const { rows } = await db.query(
    `SELECT deadline::text AS deadline,
            set_at::text  AS set_at,
            set_by
       FROM post_hrg_dev_deadline_history
      WHERE phd_row_id = $1
      ORDER BY set_at DESC, id DESC`,
    [phdRowId],
  );
  return rows as PhdDeadlineHistoryEntry[];
}

export async function addPostHrgDevNote(
  recordId: number,
  field: string,
  noteText: string,
  userName: string,
) {
  const col = notesColumn(field);
  const { rows } = await db.query(
    `SELECT ${col}, claimant, record_type, hearing_id
       FROM post_hrg_development WHERE id = $1`,
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

  // Same note object reused for the optional mirror below so both threads
  // share the exact same timestamp/author/text — makes manual de-dup easy
  // if a user inspects both lists side-by-side.
  const newNote = {
    user: userName,
    date: new Date().toISOString(),
    note: noteText,
  };
  notes.unshift(newNote);
  const updatedNotes = JSON.stringify(notes);

  await db.query(`UPDATE post_hrg_development SET ${col} = $1 WHERE id = $2`, [
    updatedNotes,
    recordId,
  ]);

  // Mirror Details notes from MR PHD rows to the linked hearing's
  // post_hrg_notes so the MR-mode Post HRG Review modal shows the same
  // thread admins are typing into the Details column. One-way mirror on
  // ADD only — edits/deletes on either side stay independent, so the two
  // threads can drift. If that ever becomes confusing we can add an
  // identifier-based two-way sync, but the current ask is just "show up
  // in the modal".
  const recordType = String(rows[0].record_type || "");
  const hearingId = rows[0].hearing_id as number | null;
  if (field === "details" && recordType === "MR" && hearingId) {
    const { rows: hRows } = await db.query(
      "SELECT post_hrg_notes FROM hearings WHERE id = $1",
      [hearingId],
    );
    let hNotes: { user: string; date: string; note: string }[] = [];
    try {
      const parsed = JSON.parse(hRows[0]?.post_hrg_notes || "[]");
      if (Array.isArray(parsed)) {
        hNotes = parsed.map((item: Record<string, unknown>) => ({
          user: String(
            item.user ?? item.author ?? item.author_name ?? "Unknown",
          ),
          date: String(item.date ?? item.created_at ?? ""),
          note: String(item.note ?? item.content ?? ""),
        }));
      }
    } catch {
      /* treat as empty */
    }
    hNotes.unshift(newNote);
    await db.query("UPDATE hearings SET post_hrg_notes = $1 WHERE id = $2", [
      JSON.stringify(hNotes),
      hearingId,
    ]);
  }

  const { logAction } = await import("@/lib/activity-log");
  await logAction(
    "post_hrg_dev_note_added",
    `Added ${field} note for: ${rows[0].claimant}`,
    (rows[0].hearing_id as number | null) ?? undefined,
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
    `SELECT ${col}, claimant, hearing_id FROM post_hrg_development WHERE id = $1`,
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
    (rows[0].hearing_id as number | null) ?? undefined,
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
  | "acknowledged"
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
    "post_hrg_dev_acknowledged",
    "post_hrg_dev_reopened",
    "post_hrg_dev_phstatus_synced",
    "post_hrg_dev_cascade",
  ],
  created: [
    "post_hrg_dev_created",
    "post_hrg_dev_auto_created",
    "post_hrg_dev_bulk_created",
  ],
  updated: [
    "post_hrg_dev_updated",
    "post_hrg_dev_field_updated",
    "post_hrg_dev_reopened",
    "post_hrg_dev_phstatus_synced",
    "post_hrg_dev_cascade",
  ],
  notes: ["post_hrg_dev_note_added", "post_hrg_dev_note_deleted"],
  acknowledged: ["post_hrg_dev_acknowledged"],
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

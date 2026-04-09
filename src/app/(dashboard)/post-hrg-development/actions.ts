"use server";

import { db } from "@/lib/db";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PostHrgDevRow {
  id: number;
  hearing_id: number | null;
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
  // Notes (JSON) for fields that have comment sections
  details_notes: string | null;
  person_responsible_notes: string | null;
  em_sent_task_created_notes: string | null;
  ext_letter_sent_notes: string | null;
  status_notes: string | null;
  // Joined from hearings table
  claimant_link: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface PostHrgDevStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
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

/**
 * Fetch PH Status options and representatives for the post-hrg page.
 * Includes both 'shared' and 'post_hearing' scoped options.
 * The hearings dashboard should only fetch 'shared' + 'hearings' scoped options.
 */
export async function fetchPostHrgOptions(): Promise<{
  phStatusOptions: ConfigOption[];
  representatives: RepOption[];
}> {
  const [configRes, repsRes] = await Promise.all([
    db.query(
      `SELECT option_value, option_color, COALESCE(team_scope, 'shared') AS team_scope
       FROM config_options
       WHERE option_type = 'hearing_decision_status'
         AND is_active = true
         AND COALESCE(team_scope, 'shared') IN ('shared', 'post_hearing')
       ORDER BY display_order`,
    ),
    db.query(
      `SELECT id, name FROM representatives WHERE is_active = true ORDER BY name`,
    ),
  ]);

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
    representatives: repsRes.rows.map((r: { id: number; name: string }) => ({
      id: r.id,
      name: r.name,
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
        OR LOWER(p.remarks) LIKE $${idx})`,
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
      `SELECT COUNT(*)::int AS total FROM post_hrg_development p ${where}`,
      values,
    ),
    db.query(
      `SELECT
        p.id, p.hearing_id, p.claimant, p.hearing_date::text,
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
        h.claimant_link
      FROM post_hrg_development p
      LEFT JOIN hearings h ON h.id = p.hearing_id
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
      p.id, p.hearing_id, p.claimant, p.hearing_date::text,
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
      h.claimant_link
    FROM post_hrg_development p
    LEFT JOIN hearings h ON h.id = p.hearing_id
    ORDER BY
      CASE WHEN p.status = 'Completed' THEN 1 ELSE 0 END ASC,
      p.deadline ASC NULLS LAST,
      p.created_at DESC
  `);
  return rows as PostHrgDevRow[];
}

// ─── Fetch stats ────────────────────────────────────────────────────────────

export async function fetchPostHrgDevStats(): Promise<PostHrgDevStats> {
  const { rows } = await db.query(`
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
  `);
  const s = rows[0];
  return {
    total: s.total,
    pending: s.pending,
    inProgress: s.in_progress,
    completed: s.completed,
    overdue: s.overdue,
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
      status, deadline, new_due_date, remarks, created_by
    ) VALUES (
      $1, $2, NULLIF($3, '')::date, $4,
      $5, $6, $7,
      $8, $9, $10,
      $11, NULLIF($12, '')::date, NULLIF($13, '')::date, $14, $15
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
    ],
  );

  const { logAction } = await import("@/lib/activity-log");
  await logAction(
    "post_hrg_dev_created",
    `Created post-hrg record for: ${data.claimant.trim()}${hearingId ? ` (linked to hearing #${hearingId})` : ""}`,
  );

  return { success: true, id: rows[0].id, hearingId };
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

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as string[];
    const claimant = getVal(row, "claimant");
    if (!claimant) continue;

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

    // Extract cell comments for note fields
    const notesData: Record<string, string | null> = {};
    for (const [field, notesCol] of Object.entries(FIELD_TO_NOTES_COL)) {
      const comment = getCellComment(i, field);
      notesData[notesCol] = comment ? commentToNotes(comment) : null;
    }

    try {
      await db.query(
        `INSERT INTO post_hrg_development (
          hearing_id, claimant, hearing_date, assigned_rep,
          post_hearing_status, type_of_docs_needed, details,
          person_responsible, em_sent_task_created, ext_letter_sent,
          status, deadline, new_due_date, remarks, created_by,
          details_notes, person_responsible_notes,
          em_sent_task_created_notes, ext_letter_sent_notes, status_notes
        ) VALUES (
          $1, $2, $3::date, $4,
          $5, $6, $7,
          $8, $9, $10,
          $11, $12::date, $13::date, $14, $15,
          $16, $17, $18, $19, $20
        )`,
        [
          hearingId,
          claimant,
          hearingDate,
          repName,
          getVal(row, "post_hearing_status") || null,
          getVal(row, "type_of_docs_needed") || null,
          getVal(row, "details") || null,
          getVal(row, "person_responsible") || null,
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
        ],
      );
      imported++;
    } catch (err) {
      errors.push(
        `Row ${data.rowOffset + i + 2}: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }

  if (imported > 0) {
    const { logAction } = await import("@/lib/activity-log");
    await logAction(
      "post_hrg_dev_import",
      `Imported ${imported} post-hrg records (${matched} linked to hearings)`,
    );
  }

  return { success: true, imported, matched, errors };
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

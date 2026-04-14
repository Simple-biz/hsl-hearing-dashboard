"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { logAction } from "@/lib/activity-log";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RepDocsRow {
  id: number;
  hearing_id: number;
  assigned_to: string | null;
  overall_status: string | null;

  uploaded_noh: boolean;
  uploaded_noh_at: string | null;
  sent_repdocs_to_cl: boolean;
  sent_repdocs_to_cl_at: string | null;
  repdocs_signed: boolean;
  repdocs_signed_at: string | null;
  contact_ltr: boolean;
  contact_ltr_at: string | null;
  repdocs_split: boolean;
  repdocs_split_at: string | null;
  repdocs_uploaded_chronicle: boolean;
  repdocs_uploaded_chronicle_at: string | null;
  oho_confirmation: boolean;
  oho_confirmation_at: string | null;

  oho_assigned_to: string | null;
  checker_calendar: boolean;
  checker_chronicle_claim: boolean;
  checker_noh: boolean;
  checker_contact_ltr: boolean;
  checker_status: string | null;

  // Joined from hearings
  claimant: string | null;
  hearing_date: string | null;
  representative_name: string | null;
  claimant_link: string | null;
  ssn_last_4: string | null;
  assignment_status: string | null;
}

export interface RepDocsStats {
  total: number;
  complete: number;
  incomplete: number;
  notStarted: number;
  withdrawn: number;
}

export interface RepDocsAssigneeOption {
  id: number;
  name: string;
}

// ─── Workflow field metadata ────────────────────────────────────────────────

const WORKFLOW_FIELDS = [
  "uploaded_noh",
  "sent_repdocs_to_cl",
  "repdocs_signed",
  "contact_ltr",
  "repdocs_split",
  "repdocs_uploaded_chronicle",
  "oho_confirmation",
] as const;

const CHECKER_FIELDS = [
  "checker_calendar",
  "checker_chronicle_claim",
  "checker_noh",
  "checker_contact_ltr",
] as const;

const WORKFLOW_FIELD_SET: ReadonlySet<string> = new Set(WORKFLOW_FIELDS);
const CHECKER_FIELD_SET: ReadonlySet<string> = new Set(CHECKER_FIELDS);

const TEXT_FIELDS = new Set([
  "assigned_to",
  "overall_status",
  "oho_assigned_to",
  "checker_status",
]);

// ─── Options ────────────────────────────────────────────────────────────────

export async function fetchRepDocsAssignees(): Promise<RepDocsAssigneeOption[]> {
  const { rows } = await db.query(
    `SELECT id, name FROM rep_docs_assignees
     WHERE is_active = true
     ORDER BY display_order, name`,
  );
  return rows as RepDocsAssigneeOption[];
}

// ─── Fetch / sync rows ──────────────────────────────────────────────────────

interface FetchParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  assignedTo?: string;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}

/**
 * Ensures every hearing with a hearing_date has a representative_docs row.
 * Creates missing rows (idempotent via UNIQUE constraint on hearing_id).
 */
async function ensureRowsForHearings() {
  // Rep docs tracker starts from March 2026 and grows with the hearings tracker.
  await db.query(
    `INSERT INTO representative_docs (hearing_id)
     SELECT h.id FROM hearings h
     WHERE h.hearing_date IS NOT NULL
       AND h.hearing_date >= DATE '2026-03-01'
     ON CONFLICT (hearing_id) DO NOTHING`,
  );
}

export async function fetchRepDocsPage(
  params: FetchParams = {},
): Promise<{ records: RepDocsRow[]; totalFiltered: number }> {
  await ensureRowsForHearings();

  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 100;

  const conditions: string[] = ["h.hearing_date IS NOT NULL"];
  const values: unknown[] = [];
  let idx = 1;

  if (params.search?.trim()) {
    conditions.push(
      `(LOWER(h.claimant) LIKE $${idx} OR LOWER(COALESCE(r.name,'')) LIKE $${idx}
        OR LOWER(COALESCE(rd.assigned_to,'')) LIKE $${idx}
        OR COALESCE(h.ssn_last_4,'') LIKE $${idx})`,
    );
    values.push(`%${params.search.trim().toLowerCase()}%`);
    idx++;
  }

  if (params.status && params.status !== "all") {
    conditions.push(`LOWER(COALESCE(rd.overall_status,'')) = LOWER($${idx})`);
    values.push(params.status);
    idx++;
  }

  if (params.assignedTo && params.assignedTo !== "all") {
    conditions.push(`rd.assigned_to = $${idx}`);
    values.push(params.assignedTo);
    idx++;
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const SORT_MAP: Record<string, string> = {
    hearing_date: "h.hearing_date",
    claimant: "h.claimant",
    representative: "r.name",
    assigned_to: "rd.assigned_to",
    overall_status: "rd.overall_status",
  };
  const sortCol = SORT_MAP[params.sortKey || ""] || "h.hearing_date";
  const dir = params.sortDir === "desc" ? "DESC" : "ASC";
  const orderBy = `ORDER BY ${sortCol} ${dir} NULLS LAST, h.id ASC`;

  const limit = pageSize;
  const offset = (page - 1) * pageSize;

  const [countRes, dataRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM representative_docs rd
       JOIN hearings h ON h.id = rd.hearing_id
       LEFT JOIN representatives r ON r.id = h.assigned_rep_id
       ${where}`,
      values,
    ),
    db.query(
      `SELECT
        rd.id, rd.hearing_id, rd.assigned_to, rd.overall_status,
        rd.uploaded_noh, rd.uploaded_noh_at::text,
        rd.sent_repdocs_to_cl, rd.sent_repdocs_to_cl_at::text,
        rd.repdocs_signed, rd.repdocs_signed_at::text,
        rd.contact_ltr, rd.contact_ltr_at::text,
        rd.repdocs_split, rd.repdocs_split_at::text,
        rd.repdocs_uploaded_chronicle, rd.repdocs_uploaded_chronicle_at::text,
        rd.oho_confirmation, rd.oho_confirmation_at::text,
        rd.oho_assigned_to,
        rd.checker_calendar, rd.checker_chronicle_claim,
        rd.checker_noh, rd.checker_contact_ltr, rd.checker_status,
        h.claimant,
        h.hearing_date::text AS hearing_date,
        r.name AS representative_name,
        h.claimant_link,
        h.ssn_last_4,
        h.assignment_status
      FROM representative_docs rd
      JOIN hearings h ON h.id = rd.hearing_id
      LEFT JOIN representatives r ON r.id = h.assigned_rep_id
      ${where}
      ${orderBy}
      LIMIT ${limit} OFFSET ${offset}`,
      values,
    ),
  ]);

  return {
    records: dataRes.rows as RepDocsRow[],
    totalFiltered: countRes.rows[0].total,
  };
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export async function fetchRepDocsStats(): Promise<RepDocsStats> {
  await ensureRowsForHearings();

  const { rows } = await db.query(
    `SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE LOWER(COALESCE(rd.overall_status,'')) = 'complete')::int AS complete,
      COUNT(*) FILTER (WHERE LOWER(COALESCE(rd.overall_status,'')) = 'incomplete')::int AS incomplete,
      COUNT(*) FILTER (WHERE LOWER(COALESCE(rd.overall_status,'not started')) = 'not started')::int AS not_started,
      COUNT(*) FILTER (WHERE LOWER(COALESCE(rd.overall_status,'')) = 'withdrawn')::int AS withdrawn
    FROM representative_docs rd
    JOIN hearings h ON h.id = rd.hearing_id
    WHERE h.hearing_date IS NOT NULL`,
  );
  const s = rows[0];
  return {
    total: s.total,
    complete: s.complete,
    incomplete: s.incomplete,
    notStarted: s.not_started,
    withdrawn: s.withdrawn,
  };
}

// ─── Recompute overall status from workflow flags ───────────────────────────

async function recomputeOverallStatus(
  id: number,
  assignmentStatus: string | null,
) {
  // Withdrawn wins
  if (assignmentStatus && assignmentStatus.toLowerCase().includes("withdraw")) {
    await db.query(
      `UPDATE representative_docs SET overall_status = 'Withdrawn' WHERE id = $1`,
      [id],
    );
    return;
  }

  const { rows } = await db.query(
    `SELECT ${WORKFLOW_FIELDS.join(", ")} FROM representative_docs WHERE id = $1`,
    [id],
  );
  if (!rows[0]) return;

  const flags = WORKFLOW_FIELDS.map((f) => Boolean(rows[0][f]));
  const truthy = flags.filter(Boolean).length;
  let status: string;
  if (truthy === 0) status = "Not Started";
  else if (truthy === flags.length) status = "Complete";
  else status = "Incomplete";

  await db.query(
    `UPDATE representative_docs SET overall_status = $1 WHERE id = $2`,
    [status, id],
  );
}

// ─── Update a single field (inline edit) ────────────────────────────────────

export async function updateRepDocsField(
  id: number,
  field: string,
  value: string | boolean | null,
) {
  const session = await requireAuth();

  // Workflow checkbox: auto-timestamp
  if (WORKFLOW_FIELD_SET.has(field)) {
    const boolVal = Boolean(value);
    const tsCol = `${field}_at`;
    await db.query(
      `UPDATE representative_docs
       SET ${field} = $1,
           ${tsCol} = CASE WHEN $1 THEN NOW() ELSE NULL END,
           updated_at = NOW(),
           updated_by = $2
       WHERE id = $3`,
      [boolVal, Number(session.user.id) || null, id],
    );

    // Pull hearing assignment_status to compute overall
    const { rows } = await db.query(
      `SELECT h.assignment_status
       FROM representative_docs rd
       JOIN hearings h ON h.id = rd.hearing_id
       WHERE rd.id = $1`,
      [id],
    );
    await recomputeOverallStatus(id, rows[0]?.assignment_status ?? null);

    await logAction(
      "rep_docs_field_updated",
      `${field} → ${boolVal ? "checked" : "unchecked"} for rep-docs #${id}`,
    );
    return { success: true };
  }

  // Checker checkboxes (no timestamp)
  if (CHECKER_FIELD_SET.has(field)) {
    const boolVal = Boolean(value);
    await db.query(
      `UPDATE representative_docs
       SET ${field} = $1, updated_at = NOW(), updated_by = $2
       WHERE id = $3`,
      [boolVal, Number(session.user.id) || null, id],
    );
    await logAction(
      "rep_docs_field_updated",
      `${field} → ${boolVal ? "checked" : "unchecked"} for rep-docs #${id}`,
    );
    return { success: true };
  }

  if (TEXT_FIELDS.has(field)) {
    await db.query(
      `UPDATE representative_docs
       SET ${field} = $1, updated_at = NOW(), updated_by = $2
       WHERE id = $3`,
      [value ?? null, Number(session.user.id) || null, id],
    );

    if (field === "overall_status") {
      // Direct user override — leave as-is
    }

    await logAction(
      "rep_docs_field_updated",
      `${field} → '${value ?? "(empty)"}' for rep-docs #${id}`,
    );
    return { success: true };
  }

  throw new Error(`Field "${field}" is not editable`);
}

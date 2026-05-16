"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { logAction } from "@/lib/activity-log";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RepDocsNoteEntry {
  user: string;
  date: string;
  note: string;
}

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
  claim_type: string | null;
  hearing_date: string | null;
  representative_name: string | null;
  rep_type: string | null;
  claimant_link: string | null;
  chronicle_link: string | null;
  ssn_last_4: string | null;
  assignment_status: string | null;

  // Notes (JSONB array)
  notes: RepDocsNoteEntry[] | null;

  // Acknowledgement — set when any user clicks the Ack button. Cleared
  // automatically when `assigned_to` changes so a new assignment cycle starts
  // fresh. `rep_docs_acknowledged_by_name` is the joined display name of the
  // acknowledger (resolved from the `users` table at fetch time).
  rep_docs_acknowledged_at: string | null;
  rep_docs_acknowledged_by: number | null;
  rep_docs_acknowledged_by_name: string | null;
}

export interface RepDocsStats {
  total: number;
  complete: number;
  incomplete: number;
  notStarted: number;
  withdrawn: number;
  notAssigned: number;
}

export interface RepDocsAssigneeOption {
  id: number;
  name: string;
  bg_color: string | null;
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
]);

// ─── Options ────────────────────────────────────────────────────────────────

export async function fetchRepDocsAssignees(): Promise<
  RepDocsAssigneeOption[]
> {
  const { rows } = await db.query(
    `SELECT id, name, bg_color FROM rep_docs_assignees
     WHERE is_active = true
     ORDER BY display_order, name`,
  );
  return rows as RepDocsAssigneeOption[];
}

export async function fetchOhoAssignees(): Promise<RepDocsAssigneeOption[]> {
  const { rows } = await db.query(
    `SELECT id, name, bg_color FROM oho_assignees
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
  dateFrom?: string;
  dateTo?: string;
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

export interface RepDocsFilteredBreakdown {
  total: number;
  notStarted: number;
  incomplete: number;
  complete: number;
  withdrawn: number;
  notAssigned: number;
}

export async function fetchRepDocsPage(params: FetchParams = {}): Promise<{
  records: RepDocsRow[];
  totalFiltered: number;
  breakdown: RepDocsFilteredBreakdown;
}> {
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
    if (params.assignedTo === "__none__") {
      conditions.push(`COALESCE(TRIM(rd.assigned_to), '') = ''`);
    } else {
      conditions.push(`rd.assigned_to = $${idx}`);
      values.push(params.assignedTo);
      idx++;
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
  // Tier 1: hearings on/after the ack-eligible cutoff (May 2026) that haven't
  // been acknowledged yet — these float to the top so the team sees them first.
  // Pre-May rows aren't ack-eligible, so they're treated as "below tier 1" and
  // fall through to chronological sorting.
  const unacknowledgedFirst = `CASE WHEN h.hearing_date >= DATE '2026-05-01' AND rd.rep_docs_acknowledged_at IS NULL THEN 0 ELSE 1 END`;
  // Tier 2 (preserved): unassigned non-withdrawn rows above the rest.
  const unassignedFirst = `CASE WHEN COALESCE(TRIM(rd.assigned_to), '') = '' AND LOWER(COALESCE(rd.overall_status, '')) != 'withdrawn' THEN 0 ELSE 1 END`;
  const orderBy = `ORDER BY ${unacknowledgedFirst}, ${unassignedFirst}, ${sortCol} ${dir} NULLS LAST, h.id ASC`;

  const limit = pageSize;
  const offset = (page - 1) * pageSize;

  const [countRes, dataRes] = await Promise.all([
    db.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE LOWER(COALESCE(rd.overall_status,'not started')) = 'not started')::int AS not_started,
         COUNT(*) FILTER (WHERE LOWER(COALESCE(rd.overall_status,'')) = 'incomplete')::int AS incomplete,
         COUNT(*) FILTER (WHERE LOWER(COALESCE(rd.overall_status,'')) = 'complete')::int AS complete,
         COUNT(*) FILTER (WHERE LOWER(COALESCE(rd.overall_status,'')) = 'withdrawn')::int AS withdrawn,
         COUNT(*) FILTER (WHERE COALESCE(TRIM(rd.assigned_to), '') = '')::int AS not_assigned
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
        rd.notes,
        rd.rep_docs_acknowledged_at::text, rd.rep_docs_acknowledged_by,
        ack_user.full_name AS rep_docs_acknowledged_by_name,
        h.claimant,
        h.claim_type,
        h.hearing_date::text AS hearing_date,
        r.name AS representative_name,
        r.rep_type,
        h.claimant_link,
        h.chronicle_link,
        h.ssn_last_4,
        h.assignment_status
      FROM representative_docs rd
      JOIN hearings h ON h.id = rd.hearing_id
      LEFT JOIN representatives r ON r.id = h.assigned_rep_id
      LEFT JOIN users ack_user ON ack_user.id = rd.rep_docs_acknowledged_by
      ${where}
      ${orderBy}
      LIMIT ${limit} OFFSET ${offset}`,
      values,
    ),
  ]);

  const c = countRes.rows[0];
  return {
    records: dataRes.rows as RepDocsRow[],
    totalFiltered: c.total,
    breakdown: {
      total: c.total,
      notStarted: c.not_started,
      incomplete: c.incomplete,
      complete: c.complete,
      withdrawn: c.withdrawn,
      notAssigned: c.not_assigned,
    },
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
      COUNT(*) FILTER (WHERE LOWER(COALESCE(rd.overall_status,'')) = 'withdrawn')::int AS withdrawn,
      COUNT(*) FILTER (WHERE COALESCE(TRIM(rd.assigned_to), '') = '')::int AS not_assigned
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
    notAssigned: s.not_assigned,
  };
}

// ─── Recompute overall status from workflow flags ───────────────────────────

async function recomputeOverallStatus(id: number) {
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

// Resolve a rep_docs row to a human-readable label for activity-log entries.
// Joins through to `hearings.claimant` so the changes modal shows
// "Smith, John (rep-docs #1887)" instead of an opaque "rep-docs #1887".
// Falls back to the raw id-only format if the row has no claimant or doesn't
// exist (defensive — shouldn't happen in practice since callers just updated
// or read the row).
async function repDocsLabel(id: number): Promise<string> {
  const { rows } = await db.query(
    `SELECT h.claimant
     FROM representative_docs rd
     JOIN hearings h ON h.id = rd.hearing_id
     WHERE rd.id = $1`,
    [id],
  );
  const claimant = (rows[0]?.claimant as string | undefined)?.trim();
  return claimant ? `${claimant} (rep-docs #${id})` : `rep-docs #${id}`;
}

// ─── Update a single field (inline edit) ────────────────────────────────────

export async function updateRepDocsField(
  id: number,
  field: string,
  value: string | boolean | null,
) {
  const session = await requireAuth();

  // Per-user field-access gate (override > role default; rep bypassed)
  {
    const { requireFieldAccess } = await import("@/lib/field-access");
    await requireFieldAccess("representative_docs", field);
  }

  // Resolve the linked hearing's id once so every logAction below can tag
  // entries with it for per-hearing audit views. Cheap single-row lookup.
  const { rows: metaRows } = await db.query(
    `SELECT h.id AS hearing_id, h.claimant
       FROM representative_docs rd
       JOIN hearings h ON h.id = rd.hearing_id
      WHERE rd.id = $1`,
    [id],
  );
  const linkedHearingId =
    (metaRows[0]?.hearing_id as number | null) ?? undefined;
  const rowLabel = metaRows[0]?.claimant
    ? `${(metaRows[0].claimant as string).trim()} (rep-docs #${id})`
    : `rep-docs #${id}`;

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

    await recomputeOverallStatus(id);

    await logAction(
      "rep_docs_field_updated",
      `${field} → ${boolVal ? "checked" : "unchecked"} for ${rowLabel}`,
      linkedHearingId,
    );
    return { success: true };
  }

  // Checker checkboxes (no timestamp)
  // Checker checkboxes (no timestamp) — checker_status auto-computed
  if (CHECKER_FIELD_SET.has(field)) {
    const boolVal = Boolean(value);
    await db.query(
      `UPDATE representative_docs
       SET ${field} = $1, updated_at = NOW(), updated_by = $2
       WHERE id = $3`,
      [boolVal, Number(session.user.id) || null, id],
    );

    // Auto-compute checker_status from all 4 checker flags
    const { rows: checkerRows } = await db.query(
      `SELECT checker_calendar, checker_chronicle_claim, checker_noh, checker_contact_ltr
       FROM representative_docs WHERE id = $1`,
      [id],
    );
    if (checkerRows[0]) {
      const c = checkerRows[0];
      const allTrue =
        c.checker_calendar &&
        c.checker_chronicle_claim &&
        c.checker_noh &&
        c.checker_contact_ltr;
      const allFalse =
        !c.checker_calendar &&
        !c.checker_chronicle_claim &&
        !c.checker_noh &&
        !c.checker_contact_ltr;
      const checkerStatus = allTrue
        ? "Complete"
        : allFalse
          ? "Not Started"
          : "Incomplete";
      await db.query(
        `UPDATE representative_docs SET checker_status = $1 WHERE id = $2`,
        [checkerStatus, id],
      );
    }

    await logAction(
      "rep_docs_field_updated",
      `${field} → ${boolVal ? "checked" : "unchecked"} for ${rowLabel}`,
      linkedHearingId,
    );
    return { success: true };
  }

  if (TEXT_FIELDS.has(field)) {
    // When the assignee changes, clear any prior acknowledgement so the new
    // person isn't credited with "started" without actually clicking Ack.
    if (field === "assigned_to") {
      await db.query(
        `UPDATE representative_docs
         SET assigned_to = $1,
             rep_docs_acknowledged_at = NULL,
             rep_docs_acknowledged_by = NULL,
             updated_at = NOW(),
             updated_by = $2
         WHERE id = $3`,
        [value ?? null, Number(session.user.id) || null, id],
      );
    } else {
      await db.query(
        `UPDATE representative_docs
         SET ${field} = $1, updated_at = NOW(), updated_by = $2
         WHERE id = $3`,
        [value ?? null, Number(session.user.id) || null, id],
      );
    }

    if (field === "overall_status") {
      // Direct user override — leave as-is
    }

    await logAction(
      "rep_docs_field_updated",
      `${field} → '${value ?? "(empty)"}' for ${rowLabel}`,
      linkedHearingId,
    );
    return { success: true };
  }

  throw new Error(`Field "${field}" is not editable`);
}

// ─── Acknowledge: any logged-in user with page access can confirm they've ────
// seen the row. Sets rep_docs_acknowledged_at = NOW() and stores the caller's
// id. The badge in the UI shows the acknowledger's name + date — useful for
// teams whose user accounts don't 1:1 match the `rep_docs_assignees` list.

export async function acknowledgeRepDocs(id: number) {
  const session = await requireAuth();
  const userId = Number(session.user.id);
  const userName = session.user.name || "";

  const { rows } = await db.query(
    `SELECT rep_docs_acknowledged_at, rep_docs_acknowledged_by, hearing_id
     FROM representative_docs WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw new Error("Representative docs row not found");
  const linkedHearingId = (rows[0].hearing_id as number | null) ?? undefined;

  // Idempotent — re-clicking doesn't bump the timestamp or change the actor.
  if (rows[0].rep_docs_acknowledged_at) {
    const { rows: existing } = await db.query(
      `SELECT u.full_name FROM users u WHERE u.id = $1`,
      [rows[0].rep_docs_acknowledged_by],
    );
    return {
      success: true,
      acknowledgedAt: rows[0].rep_docs_acknowledged_at as string,
      acknowledgedBy: rows[0].rep_docs_acknowledged_by as number,
      acknowledgedByName: (existing[0]?.full_name as string) ?? null,
    };
  }

  const { rows: updated } = await db.query(
    `UPDATE representative_docs
       SET rep_docs_acknowledged_at = NOW(),
           rep_docs_acknowledged_by = $1,
           updated_at = NOW(),
           updated_by = $1
     WHERE id = $2
     RETURNING rep_docs_acknowledged_at::text AS acknowledged_at`,
    [userId, id],
  );

  await logAction(
    "rep_docs_acknowledged",
    `Acknowledged ${await repDocsLabel(id)}`,
    linkedHearingId,
  );

  return {
    success: true,
    acknowledgedAt: updated[0]?.acknowledged_at as string,
    acknowledgedBy: userId,
    acknowledgedByName: userName,
  };
}

// ─── Update claimant_link / chronicle_link on the joined hearing ───────────

export async function updateHearingLink(
  repDocsId: number,
  field: "claimant_link" | "chronicle_link",
  value: string | null,
) {
  await requireAuth();
  if (field !== "claimant_link" && field !== "chronicle_link") {
    throw new Error(`Field "${field}" is not a hearing link`);
  }
  // Capture hearing_id for the audit log before / alongside the UPDATE.
  const { rows: linkRows } = await db.query(
    "SELECT hearing_id FROM representative_docs WHERE id = $1",
    [repDocsId],
  );
  const linkedHearingId =
    (linkRows[0]?.hearing_id as number | null) ?? undefined;
  await db.query(
    `UPDATE hearings SET ${field} = $1, updated_at = NOW()
     WHERE id = (SELECT hearing_id FROM representative_docs WHERE id = $2)`,
    [value, repDocsId],
  );
  await logAction(
    "hearing_link_updated_from_repdocs",
    `${field} → '${value ?? "(empty)"}' for ${await repDocsLabel(repDocsId)}`,
    linkedHearingId,
  );
  return { success: true };
}

// ─── Reset rep-docs workflow when a hearing is rescheduled ──────────────────
// Clears all workflow/checker flags, timestamps, OHO assignment, and status.
// Retains: assigned_to (rep docs assignee). claimant_link/chronicle_link/ssn_last_4
// live on the hearings row and are preserved there by the reschedule flow.
export async function clearRepDocsForRescheduledHearing(hearingId: number) {
  await db.query(
    `UPDATE representative_docs SET
       overall_status = NULL,
       uploaded_noh = false, uploaded_noh_at = NULL,
       sent_repdocs_to_cl = false, sent_repdocs_to_cl_at = NULL,
       repdocs_signed = false, repdocs_signed_at = NULL,
       contact_ltr = false, contact_ltr_at = NULL,
       repdocs_split = false, repdocs_split_at = NULL,
       repdocs_uploaded_chronicle = false, repdocs_uploaded_chronicle_at = NULL,
       oho_confirmation = false, oho_confirmation_at = NULL,
       oho_assigned_to = NULL,
       checker_calendar = false,
       checker_chronicle_claim = false,
       checker_noh = false,
       checker_contact_ltr = false,
       checker_status = NULL,
       updated_at = NOW()
     WHERE hearing_id = $1`,
    [hearingId],
  );
}

// ─── Fetch recent rep-docs changes for the notification center ─────────────

export interface RepDocsChange {
  id: number;
  action: string;
  description: string;
  userName: string | null;
  createdAt: string;
  acknowledged: boolean;
}

export async function fetchRepDocsChanges(params: {
  since?: string;
  category?: "status" | "field" | "rep" | "assigned_to" | "all";
  search?: string;
  /**
   * Filter activities whose description mentions this assignee name. Substring
   * match against the activity description, so it catches assignment changes
   * naming the person, plus any other field updates that reference them.
   */
  assignedTo?: string;
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{
  changes: RepDocsChange[];
  total: number;
  latestAt: string | null;
}> {
  const session = await requireAuth();
  const currentUserId = Number(session.user.id) || null;

  const allActions = [
    "rep_docs_field_updated",
    "rep_docs_imported",
    "field_updated",
    "hearing_link_updated_from_repdocs",
    "rep_assigned",
    "rep_unassigned",
    "rep_auto_assigned",
  ];
  const statusActions = ["field_updated", "rep_docs_imported"];
  const fieldActions = [
    "rep_docs_field_updated",
    "hearing_link_updated_from_repdocs",
  ];
  const repActions = ["rep_assigned", "rep_unassigned", "rep_auto_assigned"];

  let actionFilter: string[];
  switch (params.category) {
    case "status":
      actionFilter = statusActions;
      break;
    case "field":
      actionFilter = fieldActions;
      break;
    case "rep":
      actionFilter = repActions;
      break;
    case "assigned_to":
      // Rep-docs assignee changes are logged as `rep_docs_field_updated` with
      // a description starting with `assigned_to →`. We narrow on description
      // below.
      actionFilter = ["rep_docs_field_updated"];
      break;
    default:
      actionFilter = allActions;
  }

  const conditions: string[] = [`a.action = ANY($1)`];
  const values: unknown[] = [actionFilter];
  let idx = 2;

  // For non-rep tabs, only include field_updated entries that are decision-related
  if (params.category !== "rep") {
    conditions.push(
      `(a.action != 'field_updated' OR a.description ILIKE '%Decision%')`,
    );
  }

  // "Assigned To" tab: narrow rep_docs_field_updated to assignee changes only.
  if (params.category === "assigned_to") {
    conditions.push(`a.description ILIKE 'assigned_to %'`);
  }
  // "Field Updates" tab: exclude assignee changes so the two tabs don't overlap.
  if (params.category === "field") {
    conditions.push(`a.description NOT ILIKE 'assigned_to %'`);
  }

  // For rep tab, only show changes for hearings tracked in rep docs
  if (params.category === "rep") {
    conditions.push(`
      EXISTS (
        SELECT 1 FROM hearings h
        JOIN representative_docs rd ON rd.hearing_id = h.id
        WHERE a.description ILIKE '%' || h.claimant || '%'
          AND h.claimant IS NOT NULL
          AND LENGTH(h.claimant) > 3
      )
    `);
  }

  if (params.since) {
    conditions.push(`a.created_at > $${idx}::timestamptz`);
    values.push(params.since);
    idx++;
  }

  if (params.dateFrom) {
    conditions.push(`a.created_at >= $${idx}::date`);
    values.push(params.dateFrom);
    idx++;
  }

  if (params.dateTo) {
    conditions.push(`a.created_at < ($${idx}::date + INTERVAL '1 day')`);
    values.push(params.dateTo);
    idx++;
  }

  if (params.search?.trim()) {
    conditions.push(`a.description ILIKE $${idx}`);
    values.push(`%${params.search.trim()}%`);
    idx++;
  }

  if (params.assignedTo?.trim()) {
    // Two ways an activity can be "for" this assignee:
    //   (a) the actor is the user linked to that assignee row (resolved via
    //       the rep_docs_assignees.user_id FK we added in the May 2026
    //       migration). This catches actions Madison *did*.
    //   (b) the description literally mentions the name (catches assignee
    //       changes like "assigned_to → 'Madison' for ..."). Fallback for
    //       unlinked assignees and for "actions about Madison" done by
    //       someone else.
    conditions.push(
      `(
         a.user_id IN (
           SELECT user_id FROM rep_docs_assignees
           WHERE LOWER(TRIM(name)) = LOWER(TRIM($${idx}))
             AND user_id IS NOT NULL
         )
         OR a.description ILIKE $${idx + 1}
       )`,
    );
    values.push(params.assignedTo.trim());
    values.push(`%${params.assignedTo.trim()}%`);
    idx += 2;
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const pg = params.page ?? 1;
  const ps = params.pageSize ?? 25;
  const offset = (pg - 1) * ps;

  const ackParamIdx = idx; // position of current user id param, used below
  const dataValues = [...values, currentUserId];

  const [countRes, dataRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total FROM activity_log a ${where}`,
      values,
    ),
    db.query(
      `SELECT a.id, a.action, a.description,
              u.full_name AS user_name, a.created_at::text,
              (ack.user_id IS NOT NULL) AS acknowledged
       FROM activity_log a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN rep_docs_change_ack ack
         ON ack.activity_id = a.id AND ack.user_id = $${ackParamIdx}
       ${where}
       ORDER BY a.created_at DESC
       LIMIT ${ps} OFFSET ${offset}`,
      dataValues,
    ),
  ]);

  const changes: RepDocsChange[] = dataRes.rows.map(
    (r: Record<string, unknown>) => ({
      id: r.id as number,
      action: r.action as string,
      description: r.description as string,
      userName: (r.user_name as string) ?? null,
      createdAt: r.created_at as string,
      acknowledged: Boolean(r.acknowledged),
    }),
  );

  return {
    changes,
    total: countRes.rows[0].total as number,
    latestAt: changes[0]?.createdAt ?? null,
  };
}

// Lightweight check — returns just the count of changes since a timestamp
export async function countRepDocsChangesSince(since: string): Promise<number> {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS cnt
     FROM activity_log a
     WHERE a.action IN (
       'rep_docs_field_updated', 'rep_docs_imported',
       'field_updated', 'hearing_link_updated_from_repdocs',
       'rep_assigned', 'rep_unassigned', 'rep_auto_assigned'
     )
       AND (a.action != 'field_updated' OR a.description ILIKE '%Decision%')
       AND a.created_at > $1::timestamptz`,
    [since],
  );
  return rows[0].cnt as number;
}

// ─── Per-user acknowledgement of a rep-docs change entry ───────────────────

export async function acknowledgeRepDocsChange(
  activityId: number,
  acknowledged: boolean,
): Promise<{ success: boolean }> {
  const session = await requireAuth();
  const userId = Number(session.user.id);
  if (!userId) return { success: false };

  if (acknowledged) {
    await db.query(
      `INSERT INTO rep_docs_change_ack (user_id, activity_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, activity_id) DO NOTHING`,
      [userId, activityId],
    );
  } else {
    await db.query(
      `DELETE FROM rep_docs_change_ack WHERE user_id = $1 AND activity_id = $2`,
      [userId, activityId],
    );
  }

  return { success: true };
}

// ─── Audit log of rep-docs acknowledgements ────────────────────────────────
// Shows WHO acknowledged WHAT and WHEN — sourced from rep_docs_change_ack.

export interface RepDocsAckEvent {
  id: number; // activity_log.id (used as row key)
  ackUserId: number;
  ackUserName: string | null;
  action: string;
  description: string;
  acknowledgedAt: string;
}

export async function fetchRepDocsAckLog(params: {
  page: number;
  pageSize: number;
  dateRange?: string;
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
}): Promise<{
  events: RepDocsAckEvent[];
  total: number;
  users: { id: number; name: string }[];
}> {
  await requireAuth();

  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.dateRange === "today") {
    conditions.push("ack.acknowledged_at >= CURRENT_DATE");
  } else if (params.dateRange === "this_week") {
    conditions.push("ack.acknowledged_at >= date_trunc('week', CURRENT_DATE)");
  } else if (params.dateRange === "this_month") {
    conditions.push("ack.acknowledged_at >= date_trunc('month', CURRENT_DATE)");
  } else if (params.dateRange === "custom" && params.dateFrom) {
    conditions.push(`ack.acknowledged_at >= $${idx}::date`);
    values.push(params.dateFrom);
    idx++;
    if (params.dateTo) {
      conditions.push(`ack.acknowledged_at < ($${idx}::date + INTERVAL '1 day')`);
      values.push(params.dateTo);
      idx++;
    }
  }

  if (params.userId) {
    conditions.push(`ack.user_id = $${idx}`);
    values.push(parseInt(params.userId));
    idx++;
  }

  const where =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const [countRes, dataRes, usersRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total FROM rep_docs_change_ack ack ${where}`,
      values,
    ),
    db.query(
      `SELECT a.id,
              ack.user_id AS ack_user_id,
              u.full_name AS ack_user_name,
              a.action,
              CASE
                WHEN a.description ~ 'Hearing #[0-9]+' THEN
                  regexp_replace(a.description, 'Hearing #([0-9]+)', COALESCE((
                    SELECT h.claimant FROM hearings h WHERE h.id = (regexp_match(a.description, 'Hearing #([0-9]+)'))[1]::int
                  ), 'Unknown'))
                ELSE a.description
              END AS description,
              ack.acknowledged_at::text AS acknowledged_at
       FROM rep_docs_change_ack ack
       LEFT JOIN users u ON u.id = ack.user_id
       LEFT JOIN activity_log a ON a.id = ack.activity_id
       ${where}
       ORDER BY ack.acknowledged_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, params.pageSize, (params.page - 1) * params.pageSize],
    ),
    db.query(
      `SELECT DISTINCT u.id, u.full_name AS name
       FROM rep_docs_change_ack ack
       JOIN users u ON u.id = ack.user_id
       ORDER BY name`,
    ),
  ]);

  const events: RepDocsAckEvent[] = dataRes.rows.map(
    (r: Record<string, unknown>) => ({
      id: r.id as number,
      ackUserId: r.ack_user_id as number,
      ackUserName: (r.ack_user_name as string) ?? null,
      action: (r.action as string) ?? "",
      description: (r.description as string) ?? "",
      acknowledgedAt: r.acknowledged_at as string,
    }),
  );

  return {
    events,
    total: countRes.rows[0].total as number,
    users: usersRes.rows as { id: number; name: string }[],
  };
}

// ─── JSONB notes: add / delete ─────────────────────────────────────────────

function parseRepDocsNotes(raw: unknown): RepDocsNoteEntry[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (() => {
    try { return JSON.parse(String(raw)); } catch { return []; }
  })();
  if (!Array.isArray(arr)) return [];
  return arr.map((item: Record<string, unknown>) => ({
    user: String(item.user ?? "Unknown"),
    date: String(item.date ?? ""),
    note: String(item.note ?? ""),
  }));
}

export async function addRepDocsNote(
  repDocsId: number,
  noteText: string,
  userName: string,
) {
  await requireAuth();

  const { rows } = await db.query(
    `SELECT rd.notes, h.claimant, h.id AS hearing_id
     FROM representative_docs rd
     JOIN hearings h ON h.id = rd.hearing_id
     WHERE rd.id = $1`,
    [repDocsId],
  );
  if (!rows[0]) return { success: false, error: "Row not found" };

  const notes = parseRepDocsNotes(rows[0].notes);
  const newNote: RepDocsNoteEntry = {
    user: userName,
    date: new Date().toISOString(),
    note: noteText,
  };
  notes.unshift(newNote);

  await db.query(
    `UPDATE representative_docs SET notes = $1::jsonb, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(notes), repDocsId],
  );

  await logAction(
    "rep_docs_field_updated",
    `notes → added note for rep-docs #${repDocsId} (${rows[0].claimant})`,
    (rows[0].hearing_id as number | null) ?? undefined,
  );

  return { success: true, notes };
}

export async function deleteRepDocsNote(
  repDocsId: number,
  noteIndex: number,
) {
  await requireAuth();

  const { rows } = await db.query(
    `SELECT rd.notes, h.claimant, h.id AS hearing_id
     FROM representative_docs rd
     JOIN hearings h ON h.id = rd.hearing_id
     WHERE rd.id = $1`,
    [repDocsId],
  );
  if (!rows[0]) return { success: false, error: "Row not found", notes: null };

  const notes = parseRepDocsNotes(rows[0].notes);
  if (noteIndex < 0 || noteIndex >= notes.length) {
    return { success: false, error: "Invalid note index", notes };
  }

  notes.splice(noteIndex, 1);

  await db.query(
    `UPDATE representative_docs SET notes = $1::jsonb, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(notes), repDocsId],
  );

  await logAction(
    "rep_docs_field_updated",
    `notes → deleted note for rep-docs #${repDocsId} (${rows[0].claimant})`,
    (rows[0].hearing_id as number | null) ?? undefined,
  );

  return { success: true, notes };
}

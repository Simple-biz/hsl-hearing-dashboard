"use server";

export type {
  RfcUserRole,
  RfcPermissions,
  RfcEntry,
  RfcStats,
  RfcDocumentType,
  RfcMethodOption,
  RfcMrTeam,
  RfcFilters,
  RfcPaginatedResult,
  RfcPageData,
  RfcAddEntryInput,
  RfcActivityLogEntry,
  RfcComment,
} from "./types";

import { deriveRfcPermissions } from "./types";
import type {
  RfcUserRole,
  RfcEntry,
  RfcStats,
  RfcDocumentType,
  RfcMethodOption,
  RfcMrTeam,
  RfcFilters,
  RfcPaginatedResult,
  RfcPageData,
  RfcAddEntryInput,
  RfcActivityLogEntry,
  RfcComment,
} from "./types";

import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logAction } from "@/lib/activity-log";

// ─── Fallback config values (match PHP defaults) ──────────────────────────────

const FALLBACK_DOC_TYPES: RfcDocumentType[] = [
  { value: "RFC", label: "RFC", color: "#2E7D32" },
  { value: "Childhood Eval", label: "Childhood Eval", color: "#1976D2" },
  {
    value: "Teacher Questionnaire",
    label: "Teacher Questionnaire",
    color: "#7E57C2",
  },
  { value: "DME RX", label: "DME RX", color: "#8D4B20" },
  { value: "IEP", label: "IEP", color: "#6D5A1E" },
  { value: "VA Rating", label: "VA Rating", color: "#C7A4E0" },
  { value: "Home Healthcare", label: "Home Healthcare", color: "#6FA8B6" },
];

const FALLBACK_METHODS: RfcMethodOption[] = [
  { value: "Email", label: "Email", color: "#C8E6A0" },
  { value: "Fax", label: "Fax", color: "#9ED0F6" },
  { value: "Mail", label: "Mail", color: "#D6C2F0" },
  { value: "CS App", label: "CS App", color: "#F6B88E" },
  { value: "Text (sent image)", label: "Text (sent image)", color: "#FBE7A1" },
  { value: "Patient Portal", label: "Patient Portal", color: "#A7D6D1" },
];

// ─── Page data loader ─────────────────────────────────────────────────────────

export async function getRfcPageData(
  userRole: RfcUserRole = "mr_agent",
  userId?: number,
): Promise<RfcPageData> {
  const permissions = deriveRfcPermissions(userRole);

  // Layer admin per-user overrides on top of the role default. An override
  // row for the matching action key wins; missing rows fall back to the
  // role default already in `permissions`. Mirrors the resolver in
  // lib/field-access.ts so the UI matches what the server will accept.
  if (userId) {
    const { getUserFieldOverridesPlain } = await import("@/lib/field-access");
    const overrides = await getUserFieldOverridesPlain(userId, "rfc");
    if (Object.prototype.hasOwnProperty.call(overrides, "create_entry")) {
      permissions.canCreate = overrides["create_entry"] === true;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, "edit_entry")) {
      permissions.canEdit = overrides["edit_entry"] === true;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, "delete_entry")) {
      permissions.canDelete = overrides["delete_entry"] === true;
    }
    // `update_status` is granular per-field (status / filed_to_oho /
    // approved_by_tl) so it stays gated at the server only — there is no
    // single permissions flag for it on the client today. The buttons that
    // edit those fields are governed by canEdit; the server gate enforces
    // the tighter update_status check when relevant.
  }

  const [statsRows, docTypeRows, methodRows, teamRows, monthRows] =
    await Promise.all([
      // ── Stat cards ────────────────────────────────────────────────────────────
      db.query(`
      SELECT
        COUNT(*)                                                                  AS total,
        SUM(CASE WHEN filed_to_oho  = true  THEN 1 ELSE 0 END)                  AS filed,
        SUM(CASE WHEN approved_by_tl = true THEN 1 ELSE 0 END)                  AS approved,
        SUM(CASE WHEN filed_to_oho  = false OR filed_to_oho IS NULL THEN 1 ELSE 0 END) AS pending
      FROM mr_rfc
    `),

      // ── Document types from config ────────────────────────────────────────────
      db.query(`
      SELECT option_value AS value, option_value AS label, option_color AS color
      FROM config_options
      WHERE option_type = 'rfc_document_type' AND is_active = true
      ORDER BY display_order ASC
    `),

      // ── Method options from config ────────────────────────────────────────────
      db.query(`
      SELECT option_value AS value, option_value AS label, option_color AS color
      FROM config_options
      WHERE option_type = 'rfc_method_received' AND is_active = true
      ORDER BY display_order ASC
    `),

      // ── Active assignable MR teams ────────────────────────────────────────────
      db.query(`
      SELECT id, team_name, team_color
      FROM mr_teams
      WHERE is_assignable = true AND is_active = true AND team_color IS NOT NULL
      ORDER BY display_order ASC
    `),

      // ── Available months (from entry_date, last 12) ──────────────────────────
      db.query(`
      SELECT DISTINCT
        TO_CHAR(entry_date, 'YYYY-MM')    AS val,
        TO_CHAR(entry_date, 'Month YYYY') AS label
      FROM mr_rfc
      WHERE entry_date IS NOT NULL
      ORDER BY val DESC
      LIMIT 12
    `),
    ]);

  const s = statsRows.rows[0] ?? {};
  const stats: RfcStats = {
    total: Number(s.total ?? 0),
    filed: Number(s.filed ?? 0),
    approved: Number(s.approved ?? 0),
    pending: Number(s.pending ?? 0),
  };

  const documentTypes: RfcDocumentType[] = docTypeRows.rows.length
    ? (docTypeRows.rows as RfcDocumentType[])
    : FALLBACK_DOC_TYPES;

  const methodOptions: RfcMethodOption[] = methodRows.rows.length
    ? (methodRows.rows as RfcMethodOption[])
    : FALLBACK_METHODS;

  return {
    stats,
    documentTypes,
    methodOptions,
    mrTeams: teamRows.rows as RfcMrTeam[],
    availableMonths: monthRows.rows.map((r: Record<string, unknown>) => ({
      val: r.val as string,
      label: (r.label as string).trim(),
    })),
    permissions,
  };
}

// ─── Paginated entries ────────────────────────────────────────────────────────

export async function getRfcEntries(
  filters: RfcFilters,
): Promise<RfcPaginatedResult> {
  const params: unknown[] = [];
  const where: string[] = [];

  // Search
  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    where.push(
      `(r.client_name ILIKE $${params.length} OR r.provider_name ILIKE $${params.length})`,
    );
  }

  // Status
  if (filters.status === "filed") where.push("r.filed_to_oho = true");
  if (filters.status === "pending")
    where.push("(r.filed_to_oho = false OR r.filed_to_oho IS NULL)");
  if (filters.status === "approved") where.push("r.approved_by_tl = true");

  // All date-style filters resolve against `entry_date` (the row's creation
  // date — when it was added to the system). Switched from hearing_date so
  // the UI's calendar picker and Month/Year dropdowns track when the entry
  // was logged, not the underlying hearing's date.

  // Month (abbreviation Jan–Dec) on entry_date — independent of year.
  if (filters.month) {
    const MONTH_NUM: Record<string, number> = {
      Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
      Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
    };
    const mm = MONTH_NUM[filters.month];
    if (mm) where.push(`EXTRACT(MONTH FROM r.entry_date) = ${mm}`);
  }

  // Year (4-digit) on entry_date — independent of month.
  if (filters.year) {
    const yr = parseInt(filters.year, 10);
    if (Number.isFinite(yr) && yr >= 1900 && yr <= 9999) {
      where.push(`EXTRACT(YEAR FROM r.entry_date) = ${yr}`);
    }
  }

  // Specific date — single calendar input matches the exact entry day.
  if (filters.entry_date) {
    params.push(filters.entry_date);
    where.push(`r.entry_date = $${params.length}::date`);
  }

  // Team
  if (filters.team) {
    if (filters.team === "unassigned") {
      where.push("(r.mr_team_id IS NULL OR r.mr_team_id = 0)");
    } else {
      params.push(filters.team);
      where.push(`r.mr_team_id = $${params.length}`);
    }
  }

  // Doc type
  if (filters.doc_type) {
    params.push(filters.doc_type);
    where.push(`r.document_type = $${params.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const sortDir = filters.sort_order === "asc" ? "ASC" : "DESC";

  // Count + stats in one pass
  const statsResult = await db.query(
    `SELECT
       COUNT(*)                                                              AS total,
       SUM(CASE WHEN r.filed_to_oho  = true  THEN 1 ELSE 0 END)            AS filed,
       SUM(CASE WHEN r.approved_by_tl = true THEN 1 ELSE 0 END)            AS approved,
       SUM(CASE WHEN r.filed_to_oho  = false OR r.filed_to_oho IS NULL THEN 1 ELSE 0 END) AS pending
     FROM mr_rfc r
     ${whereClause}`,
    params,
  );

  const totalCount = Number(statsResult.rows[0]?.total ?? 0);
  const page = Math.max(1, filters.page ?? 1);
  const perPage =
    filters.per_page === "all"
      ? Math.min(totalCount || 1, 500)
      : Math.min(500, Number(filters.per_page ?? 50));
  const offset = (page - 1) * perPage;

  params.push(perPage);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const entriesResult = await db.query(
    `SELECT
       r.*,
       r.entry_date::text,
       r.hearing_date::text,
       r.date_signed::text,
       r.date_received::text,
       t.team_name,
       t.team_color
     FROM mr_rfc r
     LEFT JOIN mr_teams t ON r.mr_team_id = t.id
     ${whereClause}
     ORDER BY r.entry_date ${sortDir} NULLS LAST, r.id ${sortDir}
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );

  const sr = statsResult.rows[0] ?? {};
  return {
    entries: entriesResult.rows as RfcEntry[],
    total: totalCount,
    page,
    per_page: perPage,
    total_pages: Math.max(1, Math.ceil(totalCount / perPage)),
    stats: {
      total: totalCount,
      filed: Number(sr.filed ?? 0),
      approved: Number(sr.approved ?? 0),
      pending: Number(sr.pending ?? 0),
    },
  };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function addRfcEntry(
  input: RfcAddEntryInput,
): Promise<{ success: boolean; id?: number; message?: string }> {
  // Admin-overridable action gate. Throws if denied — client surfaces as
  // "Save failed".
  const { requireFieldAccess } = await import("@/lib/field-access");
  await requireFieldAccess("rfc", "create_entry");
  if (!input.client_name?.trim()) {
    return { success: false, message: "Client name is required" };
  }

  const session = await getSession();
  const createdBy = session?.user?.id ?? null;

  // Convert initial comment text to JSON array format
  let commentsJson: string | null = null;
  if (input.comments?.trim()) {
    let authorName = session?.user?.name;
    if (!authorName && createdBy) {
      const { rows: uRows } = await db.query(
        `SELECT full_name FROM users WHERE id = $1`,
        [createdBy],
      );
      authorName = uRows[0]?.full_name ?? "Unknown";
    }
    commentsJson = JSON.stringify([
      {
        author: authorName || "Unknown",
        date: new Date().toISOString(),
        content: input.comments.trim(),
      },
    ]);
  }

  // entry_date is server-enforced to "today in Eastern time" — client input
  // is ignored so the row's creation date matches the actual creation moment
  // and can't be tampered with. Mirrors the patient-portal pattern. We use
  // America/New_York (not literal 'EST') so DST flips correctly; Neon
  // sessions default to UTC, so a raw CURRENT_DATE would roll over at
  // 7pm/8pm Eastern — not what users expect.
  const result = await db.query(
    `INSERT INTO mr_rfc
       (entry_date, mr_team_id, hearing_date, client_name, document_type,
        provider_name, date_signed, mycase_link, method_received, date_received,
        filed_to_oho, approved_by_tl, comments, created_by)
     VALUES ((NOW() AT TIME ZONE 'America/New_York')::date,
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      input.mr_team_id || null,
      input.hearing_date || null,
      input.client_name.trim(),
      input.document_type || null,
      input.provider_name || null,
      input.date_signed || null,
      input.mycase_link || null,
      input.method_received || null,
      input.date_received || null,
      input.filed_to_oho ?? false,
      input.approved_by_tl ?? false,
      commentsJson,
      createdBy,
    ],
  );

  return { success: true, id: result.rows[0]?.id };
}

/**
 * Bulk-update all editable fields on an RFC entry in one call. Used by the
 * Edit modal so the user can change multiple fields and save together
 * without per-field round-trips. Mirrors patient-portal's updatePortalEntry.
 *
 * `entry_date` is intentionally OMITTED — it's the immutable creation date,
 * server-enforced on INSERT.
 */
export async function updateRfcEntry(
  id: number,
  input: Partial<RfcAddEntryInput>,
): Promise<{ success: boolean; message?: string }> {
  // Admin-overridable action gate. Throws if denied.
  const { requireFieldAccess } = await import("@/lib/field-access");
  await requireFieldAccess("rfc", "edit_entry");

  if (input.client_name !== undefined && !input.client_name.trim()) {
    return { success: false, message: "Client name is required" };
  }

  // Convert comments → JSON if changed (mirrors addRfcEntry's logic).
  let commentsJson: string | null | undefined = undefined;
  if (input.comments !== undefined) {
    const trimmed = (input.comments ?? "").trim();
    if (trimmed) {
      const session = await getSession();
      const author = session?.user?.name ?? "Unknown";
      // Read existing comments first so we APPEND rather than replace.
      const { rows } = await db.query(
        "SELECT comments FROM mr_rfc WHERE id = $1",
        [id],
      );
      let existing: Array<{ author: string; date: string; content: string }> =
        [];
      try {
        const raw = rows[0]?.comments;
        if (typeof raw === "string" && raw.trim().startsWith("[")) {
          existing = JSON.parse(raw);
        }
      } catch {
        /* fallback: ignore parse error, start fresh */
      }
      existing.push({
        author,
        date: new Date().toISOString(),
        content: trimmed,
      });
      commentsJson = JSON.stringify(existing);
    } else {
      // Empty input means "don't append" — keep existing as-is.
      commentsJson = undefined;
    }
  }

  // Build dynamic UPDATE — only set fields the caller actually passed.
  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown) => {
    values.push(val);
    sets.push(`${col} = $${values.length}`);
  };

  if (input.mr_team_id !== undefined) push("mr_team_id", input.mr_team_id);
  if (input.hearing_date !== undefined)
    push("hearing_date", input.hearing_date || null);
  if (input.client_name !== undefined)
    push("client_name", input.client_name.trim());
  if (input.document_type !== undefined)
    push("document_type", input.document_type || null);
  if (input.provider_name !== undefined)
    push("provider_name", input.provider_name || null);
  if (input.date_signed !== undefined)
    push("date_signed", input.date_signed || null);
  if (input.mycase_link !== undefined)
    push("mycase_link", input.mycase_link || null);
  if (input.method_received !== undefined)
    push("method_received", input.method_received || null);
  if (input.date_received !== undefined)
    push("date_received", input.date_received || null);
  if (input.filed_to_oho !== undefined)
    push("filed_to_oho", input.filed_to_oho);
  if (input.approved_by_tl !== undefined)
    push("approved_by_tl", input.approved_by_tl);
  if (commentsJson !== undefined) push("comments", commentsJson);

  if (sets.length === 0) {
    return { success: true }; // nothing to update — treat as success no-op
  }

  values.push(id);
  await db.query(
    `UPDATE mr_rfc SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${values.length}`,
    values,
  );

  return { success: true };
}

export async function updateRfcField(
  id: number,
  field: string,
  value: string | number | boolean | null,
): Promise<{ success: boolean; message?: string }> {
  // Admin-overridable action gate. Status edits go through `update_status`
  // (workflow grant); every other field falls under `edit_entry`.
  const { requireFieldAccess } = await import("@/lib/field-access");
  await requireFieldAccess(
    "rfc",
    field === "status" || field === "filed_to_oho" || field === "approved_by_tl"
      ? "update_status"
      : "edit_entry",
  );
  // entry_date is intentionally OMITTED — it's server-enforced to the row's
  // actual creation date and is immutable thereafter (mirrors patient-portal).
  const allowed = [
    "mr_team_id",
    "hearing_date",
    "client_name",
    "document_type",
    "provider_name",
    "date_signed",
    "mycase_link",
    "method_received",
    "date_received",
    "filed_to_oho",
    "approved_by_tl",
  ];
  if (!allowed.includes(field)) {
    return { success: false, message: "Invalid field" };
  }

  // Normalize empty string team to null
  const safeValue =
    field === "mr_team_id" && (value === "" || value === 0) ? null : value;

  await db.query(
    `UPDATE mr_rfc SET ${field} = $1, updated_at = NOW() WHERE id = $2`,
    [safeValue, id],
  );
  return { success: true };
}

export async function deleteRfcEntry(
  id: number,
): Promise<{ success: boolean; message?: string }> {
  // Admin-overridable action gate. Throws if denied.
  const { requireFieldAccess } = await import("@/lib/field-access");
  await requireFieldAccess("rfc", "delete_entry");
  await db.query(`DELETE FROM mr_rfc WHERE id = $1`, [id]);
  return { success: true };
}

export async function getRfcActivityLog(page = 1): Promise<{
  entries: RfcActivityLogEntry[];
  total: number;
  total_pages: number;
}> {
  const perPage = 50;
  const offset = (page - 1) * perPage;

  const [countResult, itemsResult] = await Promise.all([
    db.query(`
      SELECT COUNT(*) AS cnt
      FROM activity_log
      WHERE action IN ('rfc_entry_created', 'rfc_field_updated', 'rfc_entry_deleted')
    `),
    db.query(
      `SELECT a.*, u.full_name AS user_name
       FROM activity_log a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.action IN ('rfc_entry_created', 'rfc_field_updated', 'rfc_entry_deleted')
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`,
      [perPage, offset],
    ),
  ]);

  const total = Number(countResult.rows[0]?.cnt ?? 0);
  return {
    entries: itemsResult.rows as RfcActivityLogEntry[],
    total,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
  };
}

// ─── RFC Comment Notes ────────────────────────────────────────────────────────
// Comments stored as JSON array in mr_rfc.comments (TEXT column).
// Shape: [{ author: string; date: string; content: string }]
// Follows the same pattern as post-hrg notes.

function parseRfcComments(raw: unknown): RfcComment[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(
      typeof raw === "string" ? raw : JSON.stringify(raw),
    );
    if (Array.isArray(parsed)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return parsed.map((n: any) => ({
        author: n.author ?? n.author_name ?? "Unknown",
        content: n.content ?? n.note ?? "",
        date: n.date ?? n.created_at ?? new Date().toISOString(),
      }));
    }
  } catch {
    /* fall through */
  }
  // Legacy: plain text comment — wrap as single note
  if (typeof raw === "string" && raw.trim()) {
    return [
      { author: "Import", date: new Date().toISOString(), content: raw.trim() },
    ];
  }
  return [];
}

export async function getRfcComments(rfcId: number): Promise<RfcComment[]> {
  try {
    const { rows } = await db.query(
      `SELECT comments FROM mr_rfc WHERE id = $1`,
      [rfcId],
    );
    return parseRfcComments(rows[0]?.comments);
  } catch {
    return [];
  }
}

export async function addRfcComment(
  rfcId: number,
  content: string,
): Promise<{ success: boolean; message?: string }> {
  if (!content.trim())
    return { success: false, message: "Comment cannot be empty" };

  const session = await getSession();
  let authorName = session?.user?.name;
  if (!authorName && session?.user?.id) {
    const { rows: userRows } = await db.query(
      `SELECT full_name FROM users WHERE id = $1`,
      [session.user.id],
    );
    authorName = userRows[0]?.full_name ?? "Unknown";
  }
  if (!authorName) authorName = "Unknown";

  const newNote = JSON.stringify({
    author: authorName,
    date: new Date().toISOString(),
    content: content.trim(),
  });

  // Atomic prepend (newest first) — same pattern as post-hrg notes
  await db.query(
    `UPDATE mr_rfc
        SET comments = CASE
              WHEN comments IS NULL OR comments = '' OR comments = '[]'
              THEN ('[' || $1 || ']')
              WHEN comments LIKE '[{%'
              THEN ('[' || $1 || ',' || substring(comments from 2))
              ELSE ('[' || $1 || ']')
            END,
            updated_at = NOW()
      WHERE id = $2`,
    [newNote, rfcId],
  );

  await logAction("rfc_comment_added", `Comment added for RFC entry #${rfcId}`);

  return { success: true };
}

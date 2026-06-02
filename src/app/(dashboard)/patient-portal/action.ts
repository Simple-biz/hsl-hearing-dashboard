"use server";

export type {
  PortalUserRole,
  PortalPermissions,
  MrSpecialist,
  PortalNote,
  PortalEntry,
  PortalStats,
  PortalFilters,
  PortalPaginatedResult,
  PortalPageData,
  PortalAddEntryInput,
  PortalActivityEntry,
  ClaimantSearchResult,
} from "../patient-portal/types";

import { derivePortalPermissions } from "../patient-portal/types";
import type {
  PortalUserRole,
  PortalEntry,
  PortalNote,
  PortalStats,
  PortalFilters,
  PortalPaginatedResult,
  PortalPageData,
  PortalAddEntryInput,
  PortalActivityEntry,
  ClaimantSearchResult,
} from "../patient-portal/types";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { logAction } from "@/lib/activity-log";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a raw JSON notes column value (TEXT in DB, stored as JSON array).
 * Handles legacy plain-text rows and malformed JSON gracefully.
 */
function parseNotes(raw: unknown): PortalNote[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as PortalNote[];
      // Legacy: plain-text row converted to array format
      return [{ user: "System", date: new Date().toISOString(), note: raw }];
    } catch {
      return [{ user: "System", date: new Date().toISOString(), note: raw }];
    }
  }
  if (Array.isArray(raw)) return raw as PortalNote[];
  return [];
}

/**
 * Map a raw Neon query row to a typed PortalEntry.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: Record<string, any>): PortalEntry {
  return {
    id: row.id,
    entry_date: row.entry_date ?? null,
    hearing_date: row.hearing_date ?? null,
    client_name: row.client_name,
    provider: row.provider ?? null,
    mycase_link: row.mycase_link ?? null,
    portal_link: row.portal_link ?? null,
    portal_username: row.portal_username ?? null,
    portal_password: row.portal_password ?? null,
    got_mr: Boolean(row.got_mr),
    approved_by_tl: Boolean(row.approved_by_tl),
    mr_specialist_id: row.mr_specialist_id ?? null,
    hearing_id: row.hearing_id ?? null,
    username_notes: parseNotes(row.username_notes),
    password_notes: parseNotes(row.password_notes),
    got_mr_notes: parseNotes(row.got_mr_notes),
    approved_notes: parseNotes(row.approved_notes),
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by ?? null,
    // Joined columns from mr_specialists
    specialist_name: row.specialist_name ?? null,
    specialist_color: row.specialist_color ?? null,
    // Joined live from hearings (when p.hearing_id is set)
    chronicle_link: row.chronicle_link ?? null,
    claim_type: row.claim_type ?? null,
  };
}

// ─── Claimant Search ──────────────────────────────────────────────────────────

/**
 * Typeahead search over the hearings table by claimant name. Used by the
 * patient-portal Add/Edit modal to look up a hearing and auto-fill
 * client_name + mycase_link from the matching hearing. The chronicle_link is
 * not stored on the portal entry — it is read live from the linked hearing.
 */
export async function searchClaimantsForPortal(
  query: string,
): Promise<ClaimantSearchResult[]> {
  await requireAuth();
  const q = query.trim();
  if (q.length < 2) return [];

  const { rows } = await db.query(
    `SELECT h.id            AS hearing_id,
            h.claimant      AS claimant,
            h.hearing_date::text AS hearing_date,
            h.claim_type    AS claim_type,
            h.claimant_link AS claimant_link,
            h.chronicle_link AS chronicle_link
     FROM hearings h
     WHERE h.claimant ILIKE $1
     ORDER BY h.hearing_date DESC NULLS LAST, h.id DESC
     LIMIT 20`,
    [`%${q}%`],
  );
  return rows.map((r) => ({
    hearing_id: r.hearing_id,
    claimant: r.claimant,
    hearing_date: r.hearing_date ?? null,
    claim_type: r.claim_type ?? null,
    claimant_link: r.claimant_link ?? null,
    chronicle_link: r.chronicle_link ?? null,
  }));
}

// ─── Page Bootstrap ───────────────────────────────────────────────────────────

export async function getPortalPageData(): Promise<PortalPageData> {
  const session = await requireAuth();
  const role = (session.user.role ?? "mr_agent") as PortalUserRole;

  // Stats — four parallel scalar queries
  const [totalRes, portalRes, mrRes, approvedRes] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS n FROM mr_patient_portal"),
    db.query(
      "SELECT COUNT(*)::int AS n FROM mr_patient_portal WHERE portal_link IS NOT NULL AND portal_link <> ''",
    ),
    db.query(
      "SELECT COUNT(*)::int AS n FROM mr_patient_portal WHERE got_mr = true",
    ),
    db.query(
      "SELECT COUNT(*)::int AS n FROM mr_patient_portal WHERE approved_by_tl = true",
    ),
  ]);

  const stats: PortalStats = {
    total: totalRes.rows[0]?.n ?? 0,
    with_portal: portalRes.rows[0]?.n ?? 0,
    got_mr: mrRes.rows[0]?.n ?? 0,
    approved: approvedRes.rows[0]?.n ?? 0,
  };

  // Active specialists ordered by display_order
  const { rows: specialists } = await db.query(
    "SELECT id, name, bg_color, display_order, is_active FROM mr_specialists WHERE is_active = true ORDER BY display_order",
  );

  // Available months derived from created_at (latest 12) — matches the
  // "Newest First" sort, which orders by created_at.
  const { rows: dateRows } = await db.query(
    `SELECT DISTINCT TO_CHAR(created_at, 'YYYY-MM') AS val
     FROM mr_patient_portal
     WHERE created_at IS NOT NULL
     ORDER BY val DESC
     LIMIT 12`,
  );

  const availableMonths = dateRows.map((r) => ({
    val: r.val,
    label: new Date(r.val + "-01").toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    }),
  }));

  return {
    stats,
    specialists,
    availableMonths,
    permissions: derivePortalPermissions(role),
  };
}

// ─── Paginated Entry List ─────────────────────────────────────────────────────

export async function getPortalEntries(
  filters: PortalFilters,
): Promise<PortalPaginatedResult> {
  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let p = 0; // param counter

  // Search
  if (filters.search?.trim()) {
    p += 2;
    conditions.push(
      `(p.client_name ILIKE $${p - 1} OR p.provider ILIKE $${p})`,
    );
    params.push(`%${filters.search.trim()}%`, `%${filters.search.trim()}%`);
  }

  // MR status
  if (filters.mr_status === "got") {
    conditions.push("p.got_mr = true");
  } else if (filters.mr_status === "pending") {
    conditions.push("p.got_mr = false");
  }

  // Month filter (YYYY-MM on created_at) — matches the Newest First sort.
  if (filters.month) {
    p++;
    conditions.push(`TO_CHAR(p.created_at, 'YYYY-MM') = $${p}`);
    params.push(filters.month);
  }

  // Specialist filter
  if (filters.specialist) {
    if (filters.specialist === "unassigned") {
      conditions.push("p.mr_specialist_id IS NULL");
    } else {
      p++;
      conditions.push(`p.mr_specialist_id = $${p}`);
      params.push(Number(filters.specialist));
    }
  }

  const where = conditions.join(" AND ");
  const dir = filters.sort_order === "asc" ? "ASC" : "DESC";
  const page = Math.max(1, filters.page ?? 1);
  const isAll = filters.per_page === "all";
  const perPage = isAll
    ? 500
    : Math.min(500, (filters.per_page as number) ?? 50);
  const offset = (page - 1) * perPage;

  // Count query (reuses same params)
  const { rows: countRows } = await db.query(
    `SELECT COUNT(*)::int AS total FROM mr_patient_portal p WHERE ${where}`,
    params,
  );
  const total = countRows[0]?.total ?? 0;

  // Data query with optional LIMIT/OFFSET
  const dataParams = isAll ? params : [...params, perPage, offset];
  const limitClause = isAll ? "" : `LIMIT $${p + 1} OFFSET $${p + 2}`;

  const { rows } = await db.query(
    `SELECT p.*,
            p.entry_date::text   AS entry_date,
            p.hearing_date::text AS hearing_date,
            s.name     AS specialist_name,
            s.bg_color AS specialist_color,
            h.chronicle_link AS chronicle_link,
            h.claim_type     AS claim_type
     FROM mr_patient_portal p
     LEFT JOIN mr_specialists s ON s.id = p.mr_specialist_id
     LEFT JOIN hearings h        ON h.id = p.hearing_id
     WHERE ${where}
     ORDER BY p.created_at ${dir} NULLS LAST, p.id ${dir}
     ${limitClause}`,
    dataParams,
  );

  return {
    entries: rows.map(mapRow),
    total,
    page,
    per_page: perPage,
    total_pages: isAll ? 1 : Math.max(1, Math.ceil(total / perPage)),
  };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function addPortalEntry(
  input: PortalAddEntryInput,
): Promise<{ success: boolean; id?: number; message?: string }> {
  if (!input.client_name?.trim())
    return { success: false, message: "Client name is required" };

  const session = await requireAuth();

  // Normalize + permission-gate the optional MR specialist assignment. Same
  // rule as the inline-edit gate in updatePortalField — only privileged roles
  // can assign a specialist. Unassigned (null / empty / 0) bypasses the gate
  // since "no assignment" requires no permission.
  let specialistId: number | null = null;
  if (
    input.mr_specialist_id !== undefined &&
    input.mr_specialist_id !== null &&
    input.mr_specialist_id !== 0
  ) {
    const role = session.user.role ?? "";
    if (
      !["system_admin", "admin", "manager", "mr_admin", "mr_lead"].includes(
        role,
      )
    ) {
      return {
        success: false,
        message: "Only Admin or MR Admin can assign specialists",
      };
    }
    specialistId = Number(input.mr_specialist_id);
  }

  const hearingId =
    input.hearing_id === undefined || input.hearing_id === null
      ? null
      : Number(input.hearing_id);

  const { rows } = await db.query(
    `INSERT INTO mr_patient_portal
       (entry_date, hearing_date, client_name, provider, mycase_link,
        portal_link, portal_username, portal_password, got_mr, approved_by_tl,
        mr_specialist_id, hearing_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      input.entry_date || null,
      input.hearing_date || null,
      input.client_name.trim(),
      input.provider || null,
      input.mycase_link || null,
      input.portal_link || null,
      input.portal_username || null,
      input.portal_password || null,
      Boolean(input.got_mr),
      Boolean(input.approved_by_tl),
      specialistId,
      hearingId,
      Number(session.user.id),
    ],
  );

  await logAction(
    "portal_entry_created",
    `Created portal entry for: ${input.client_name.trim()}`,
  );

  return { success: true, id: rows[0]?.id };
}

export async function updatePortalEntry(
  id: number,
  input: Partial<PortalAddEntryInput>,
): Promise<{ success: boolean; message?: string }> {
  if (!input.client_name?.trim())
    return { success: false, message: "Client name is required" };

  const session = await requireAuth();

  // Fetch current specialist so we can decide whether the input represents
  // an actual change. Only changes are gated — a non-permitted user editing
  // other fields can still save (their disabled dropdown carries the same
  // value back, which we treat as a no-op).
  const { rows: cur } = await db.query(
    "SELECT mr_specialist_id FROM mr_patient_portal WHERE id = $1",
    [id],
  );
  const currentSpecialist: number | null =
    (cur[0]?.mr_specialist_id as number | null) ?? null;

  let nextSpecialist: number | null = currentSpecialist;
  if (input.mr_specialist_id !== undefined) {
    const proposed: number | null =
      input.mr_specialist_id === null ||
      Number(input.mr_specialist_id) === 0
        ? null
        : Number(input.mr_specialist_id);
    if (proposed !== currentSpecialist) {
      const role = session.user.role ?? "";
      if (
        !["system_admin", "admin", "manager", "mr_admin", "mr_lead"].includes(
          role,
        )
      ) {
        return {
          success: false,
          message: "Only Admin or MR Admin can assign specialists",
        };
      }
    }
    nextSpecialist = proposed;
  }

  const hearingId =
    input.hearing_id === undefined || input.hearing_id === null
      ? null
      : Number(input.hearing_id);

  await db.query(
    `UPDATE mr_patient_portal SET
       entry_date = $1, hearing_date = $2, client_name = $3, provider = $4,
       mycase_link = $5, portal_link = $6, portal_username = $7, portal_password = $8,
       got_mr = $9, approved_by_tl = $10, mr_specialist_id = $11, hearing_id = $12,
       updated_at = NOW()
     WHERE id = $13`,
    [
      input.entry_date || null,
      input.hearing_date || null,
      input.client_name.trim(),
      input.provider || null,
      input.mycase_link || null,
      input.portal_link || null,
      input.portal_username || null,
      input.portal_password || null,
      Boolean(input.got_mr),
      Boolean(input.approved_by_tl),
      nextSpecialist,
      hearingId,
      id,
    ],
  );

  await logAction(
    "portal_field_updated",
    `Updated portal entry for: ${input.client_name.trim()}`,
  );

  return { success: true };
}

const ALLOWED_FIELDS = [
  "entry_date",
  "hearing_date",
  "client_name",
  "provider",
  "mycase_link",
  "portal_link",
  "portal_username",
  "portal_password",
  "got_mr",
  "approved_by_tl",
  "mr_specialist_id",
] as const;

type AllowedField = (typeof ALLOWED_FIELDS)[number];

export async function updatePortalField(
  id: number,
  field: string,
  value: string | number | boolean | null,
): Promise<{ success: boolean; message?: string }> {
  if (!(ALLOWED_FIELDS as readonly string[]).includes(field))
    return { success: false, message: "Invalid field" };

  const session = await requireAuth();

  // Server-side permission guard for specialist assignment
  if (field === "mr_specialist_id") {
    const role = session.user.role ?? "";
    if (
      !["system_admin", "admin", "manager", "mr_admin", "mr_lead"].includes(
        role,
      )
    )
      return {
        success: false,
        message: "Only Admin or MR Admin can assign specialists",
      };
  }

  // Normalise empty specialist to null
  let dbValue: string | number | boolean | null = value;
  if (field === "mr_specialist_id" && (value === "" || value === 0))
    dbValue = null;

  await db.query(
    `UPDATE mr_patient_portal SET ${field as AllowedField} = $1, updated_at = NOW() WHERE id = $2`,
    [dbValue, id],
  );

  // Fetch client name for activity log
  const { rows } = await db.query(
    "SELECT client_name FROM mr_patient_portal WHERE id = $1",
    [id],
  );

  const LABELS: Record<string, string> = {
    entry_date: "Date",
    hearing_date: "Hearing Date",
    client_name: "Client Name",
    provider: "Provider",
    mycase_link: "MyCase Link",
    portal_link: "Portal Link",
    portal_username: "Username",
    portal_password: "Password",
    got_mr: "Got MR",
    approved_by_tl: "Approved by TL",
    mr_specialist_id: "MR Specialist",
  };

  await logAction(
    "portal_field_updated",
    `Updated ${LABELS[field] ?? field} to '${buildDisplayValue(field, dbValue)}' for: ${rows[0]?.client_name ?? "Unknown"}`,
  );

  return { success: true };
}

export async function deletePortalEntry(
  id: number,
): Promise<{ success: boolean; message?: string }> {
  // Fetch client name before deleting for the activity log
  const { rows } = await db.query(
    "SELECT client_name FROM mr_patient_portal WHERE id = $1",
    [id],
  );
  const clientName = rows[0]?.client_name ?? "Unknown";

  await db.query("DELETE FROM mr_patient_portal WHERE id = $1", [id]);
  await logAction(
    "portal_entry_deleted",
    `Deleted portal entry for: ${clientName}`,
  );

  return { success: true };
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export async function getPortalNotes(
  id: number,
  field: "username" | "password" | "approved" | "got_mr",
): Promise<{
  success: boolean;
  notes?: PortalNote[];
  client_name?: string;
  provider?: string;
}> {
  const col = `${field}_notes`;

  const { rows } = await db.query(
    `SELECT id, client_name, provider, ${col} AS notes FROM mr_patient_portal WHERE id = $1`,
    [id],
  );

  if (!rows[0]) return { success: false };

  return {
    success: true,
    notes: parseNotes(rows[0].notes),
    client_name: rows[0].client_name,
    provider: rows[0].provider ?? undefined,
  };
}

export async function addPortalNote(
  id: number,
  field: "username" | "password" | "approved" | "got_mr",
  note: string,
): Promise<{ success: boolean; message?: string }> {
  if (!note.trim()) return { success: false, message: "Note text is required" };

  const session = await requireAuth();
  const col = `${field}_notes`;

  // Fetch existing notes + client name
  const { rows } = await db.query(
    `SELECT client_name, ${col} AS notes FROM mr_patient_portal WHERE id = $1`,
    [id],
  );
  if (!rows[0]) return { success: false, message: "Entry not found" };

  const existing = parseNotes(rows[0].notes);
  const updated: PortalNote[] = [
    {
      user: session.user.name ?? "Unknown",
      date: new Date().toISOString(),
      note: note.trim(),
    },
    ...existing,
  ];

  await db.query(
    `UPDATE mr_patient_portal SET ${col} = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(updated), id],
  );

  const FIELD_LABELS = {
    username: "Username",
    password: "Password",
    approved: "Approved by TL",
    got_mr: "Got MR",
  };
  await logAction(
    "portal_note_added",
    `Added ${FIELD_LABELS[field]} note for: ${rows[0].client_name}`,
  );

  return { success: true };
}

// ─── Activity Log ─────────────────────────────────────────────────────────────

const PORTAL_ACTIONS = [
  "portal_entry_created",
  "portal_field_updated",
  "portal_entry_deleted",
  "portal_bulk_import",
  "portal_note_added",
  "portal_note_deleted",
];

export async function getPortalActivityLog(filters: {
  page?: number;
  date_range?: "all" | "today" | "week" | "month";
  user_id?: string;
  entry_id?: number; // scopes log to a specific portal entry via client_name lookup
}): Promise<{
  entries: PortalActivityEntry[];
  total: number;
  total_pages: number;
}> {
  const perPage = 50;
  const page = Math.max(1, filters.page ?? 1);
  const offset = (page - 1) * perPage;

  const conditions: string[] = ["a.action = ANY($1::text[])"];
  const params: unknown[] = [PORTAL_ACTIONS];
  let p = 1;

  // Scope to a specific entry by matching client_name in the description
  if (filters.entry_id) {
    const { rows } = await db.query(
      "SELECT client_name FROM mr_patient_portal WHERE id = $1",
      [filters.entry_id],
    );
    const clientName = rows[0]?.client_name as string | undefined;
    if (clientName) {
      p++;
      conditions.push(`a.description LIKE $${p}`);
      params.push(`%for: ${clientName}%`);
    }
  }

  if (filters.date_range === "today") {
    conditions.push("DATE(a.created_at) = CURRENT_DATE");
  } else if (filters.date_range === "week") {
    conditions.push("a.created_at >= NOW() - INTERVAL '7 days'");
  } else if (filters.date_range === "month") {
    conditions.push("a.created_at >= NOW() - INTERVAL '30 days'");
  }

  if (filters.user_id) {
    p++;
    conditions.push(`a.user_id = $${p}`);
    params.push(Number(filters.user_id));
  }

  const where = conditions.join(" AND ");

  const [countRes, dataRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total FROM activity_log a WHERE ${where}`,
      params,
    ),
    db.query(
      `SELECT a.id, a.user_id, a.action, a.description, a.created_at,
              u.full_name AS user_name
       FROM activity_log a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE ${where}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${p + 1} OFFSET $${p + 2}`,
      [...params, perPage, offset],
    ),
  ]);

  const total = countRes.rows[0]?.total ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries: PortalActivityEntry[] = dataRes.rows.map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    user_name: row.user_name ?? "System",
    action: row.action,
    details: row.description ?? "",
    created_at: row.created_at,
  }));

  return {
    entries,
    total,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getPortalActivityUsers(): Promise<
  Array<{ id: number; full_name: string }>
> {
  const { rows } = await db.query(
    `SELECT DISTINCT u.id, u.full_name
     FROM activity_log a
     JOIN users u ON u.id = a.user_id
     WHERE a.action = ANY($1::text[])
     ORDER BY u.full_name`,
    [PORTAL_ACTIONS],
  );
  return rows;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildDisplayValue(
  field: string,
  value: string | number | boolean | null,
): string {
  if (field === "got_mr" || field === "approved_by_tl")
    return value ? "Yes" : "No";
  if (field === "portal_password") return "****";
  if (field === "mr_specialist_id") return value ? String(value) : "Unassigned";
  return value == null ? "(cleared)" : String(value);
}

export async function getPortalStats(): Promise<PortalStats> {
  const [totalRes, portalRes, mrRes, approvedRes] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS n FROM mr_patient_portal"),
    db.query(
      "SELECT COUNT(*)::int AS n FROM mr_patient_portal WHERE portal_link IS NOT NULL AND portal_link <> ''",
    ),
    db.query(
      "SELECT COUNT(*)::int AS n FROM mr_patient_portal WHERE got_mr = true",
    ),
    db.query(
      "SELECT COUNT(*)::int AS n FROM mr_patient_portal WHERE approved_by_tl = true",
    ),
  ]);
  return {
    total: totalRes.rows[0]?.n ?? 0,
    with_portal: portalRes.rows[0]?.n ?? 0,
    got_mr: mrRes.rows[0]?.n ?? 0,
    approved: approvedRes.rows[0]?.n ?? 0,
  };
}

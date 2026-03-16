"use server";

export type {
  RfcUserRole, RfcPermissions, RfcEntry, RfcStats, RfcDocumentType,
  RfcMethodOption, RfcMrTeam, RfcFilters, RfcPaginatedResult,
  RfcPageData, RfcAddEntryInput, RfcActivityLogEntry,
} from "./types";

import { deriveRfcPermissions } from "./types";
import type {
  RfcUserRole, RfcEntry, RfcStats, RfcDocumentType, RfcMethodOption, RfcMrTeam,
  RfcFilters, RfcPaginatedResult, RfcPageData, RfcAddEntryInput, RfcActivityLogEntry,
} from "./types";

import { db } from "@/lib/db";

// ─── Fallback config values (match PHP defaults) ──────────────────────────────

const FALLBACK_DOC_TYPES: RfcDocumentType[] = [
  { value: "RFC",                   label: "RFC",                   color: "#2E7D32" },
  { value: "Childhood Eval",        label: "Childhood Eval",        color: "#1976D2" },
  { value: "Teacher Questionnaire", label: "Teacher Questionnaire", color: "#7E57C2" },
  { value: "DME RX",                label: "DME RX",                color: "#8D4B20" },
  { value: "IEP",                   label: "IEP",                   color: "#6D5A1E" },
  { value: "VA Rating",             label: "VA Rating",             color: "#C7A4E0" },
  { value: "Home Healthcare",       label: "Home Healthcare",       color: "#6FA8B6" },
];

const FALLBACK_METHODS: RfcMethodOption[] = [
  { value: "Email",             label: "Email",             color: "#C8E6A0" },
  { value: "Fax",               label: "Fax",               color: "#9ED0F6" },
  { value: "Mail",              label: "Mail",              color: "#D6C2F0" },
  { value: "CS App",            label: "CS App",            color: "#F6B88E" },
  { value: "Text (sent image)", label: "Text (sent image)", color: "#FBE7A1" },
  { value: "Patient Portal",    label: "Patient Portal",    color: "#A7D6D1" },
];

// ─── Page data loader ─────────────────────────────────────────────────────────

export async function getRfcPageData(
  userRole: RfcUserRole = "mr_agent",
): Promise<RfcPageData> {
  const permissions = deriveRfcPermissions(userRole);

  const [statsRows, docTypeRows, methodRows, teamRows, monthRows] = await Promise.all([
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

    // ── Available months (from hearing_date, last 12) ─────────────────────────
    db.query(`
      SELECT DISTINCT
        TO_CHAR(hearing_date, 'YYYY-MM')    AS val,
        TO_CHAR(hearing_date, 'Month YYYY') AS label
      FROM mr_rfc
      WHERE hearing_date IS NOT NULL
      ORDER BY val DESC
      LIMIT 12
    `),
  ]);

  const s = statsRows.rows[0] ?? {};
  const stats: RfcStats = {
    total:    Number(s.total    ?? 0),
    filed:    Number(s.filed    ?? 0),
    approved: Number(s.approved ?? 0),
    pending:  Number(s.pending  ?? 0),
  };

  const documentTypes: RfcDocumentType[] = docTypeRows.rows.length
    ? docTypeRows.rows as RfcDocumentType[]
    : FALLBACK_DOC_TYPES;

  const methodOptions: RfcMethodOption[] = methodRows.rows.length
    ? methodRows.rows as RfcMethodOption[]
    : FALLBACK_METHODS;

  return {
    stats,
    documentTypes,
    methodOptions,
    mrTeams: teamRows.rows as RfcMrTeam[],
    availableMonths: monthRows.rows.map((r: Record<string, unknown>) => ({
      val:   r.val as string,
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
    where.push(`(r.client_name ILIKE $${params.length} OR r.provider_name ILIKE $${params.length})`);
  }

  // Status
  if (filters.status === "filed")    where.push("r.filed_to_oho = true");
  if (filters.status === "pending")  where.push("(r.filed_to_oho = false OR r.filed_to_oho IS NULL)");
  if (filters.status === "approved") where.push("r.approved_by_tl = true");

  // Month (on hearing_date)
  if (filters.month) {
    params.push(filters.month);
    where.push(`TO_CHAR(r.hearing_date, 'YYYY-MM') = $${params.length}`);
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
  const page    = Math.max(1, filters.page ?? 1);
  const perPage = filters.per_page === "all" ? Math.min(totalCount || 1, 500) : Math.min(500, Number(filters.per_page ?? 50));
  const offset  = (page - 1) * perPage;

  params.push(perPage); const limitIdx  = params.length;
  params.push(offset);  const offsetIdx = params.length;

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
    entries:     entriesResult.rows as RfcEntry[],
    total:       totalCount,
    page,
    per_page:    perPage,
    total_pages: Math.max(1, Math.ceil(totalCount / perPage)),
    stats: {
      total:    totalCount,
      filed:    Number(sr.filed    ?? 0),
      approved: Number(sr.approved ?? 0),
      pending:  Number(sr.pending  ?? 0),
    },
  };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function addRfcEntry(
  input: RfcAddEntryInput,
): Promise<{ success: boolean; id?: number; message?: string }> {
  if (!input.client_name?.trim()) {
    return { success: false, message: "Client name is required" };
  }

  const result = await db.query(
    `INSERT INTO mr_rfc
       (entry_date, mr_team_id, hearing_date, client_name, document_type,
        provider_name, date_signed, mycase_link, method_received, date_received,
        filed_to_oho, approved_by_tl)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      input.entry_date    || null,
      input.mr_team_id    || null,
      input.hearing_date  || null,
      input.client_name.trim(),
      input.document_type  || null,
      input.provider_name  || null,
      input.date_signed    || null,
      input.mycase_link    || null,
      input.method_received || null,
      input.date_received  || null,
      input.filed_to_oho   ?? false,
      input.approved_by_tl ?? false,
    ],
  );

  return { success: true, id: result.rows[0]?.id };
}

export async function updateRfcField(
  id: number,
  field: string,
  value: string | number | boolean | null,
): Promise<{ success: boolean; message?: string }> {
  const allowed = [
    "entry_date", "mr_team_id", "hearing_date", "client_name", "document_type",
    "provider_name", "date_signed", "mycase_link", "method_received",
    "date_received", "filed_to_oho", "approved_by_tl",
  ];
  if (!allowed.includes(field)) {
    return { success: false, message: "Invalid field" };
  }

  // Normalize empty string team to null
  const safeValue = field === "mr_team_id" && (value === "" || value === 0)
    ? null
    : value;

  await db.query(
    `UPDATE mr_rfc SET ${field} = $1, updated_at = NOW() WHERE id = $2`,
    [safeValue, id],
  );
  return { success: true };
}

export async function deleteRfcEntry(
  id: number,
): Promise<{ success: boolean; message?: string }> {
  await db.query(`DELETE FROM mr_rfc WHERE id = $1`, [id]);
  return { success: true };
}

export async function getRfcActivityLog(page = 1): Promise<{
  entries: RfcActivityLogEntry[];
  total: number;
  total_pages: number;
}> {
  const perPage = 50;
  const offset  = (page - 1) * perPage;

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
    entries:     itemsResult.rows as RfcActivityLogEntry[],
    total,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
  };
}

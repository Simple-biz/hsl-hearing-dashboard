"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logAction } from "@/lib/activity-log";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RfcImportRow {
  entry_date: string | null;
  mr_team_name: string | null;
  hearing_date: string | null;
  client_name: string;
  document_type: string | null;
  provider_name: string | null;
  date_signed: string | null;
  mycase_link: string | null;
  method_received: string | null;
  date_received: string | null;
  filed_to_oho: boolean;
  approved_by_tl: boolean;
  comments: string | null;
}

export interface ImportRfcResult {
  imported: number;
  updated: number;
  skipped: number;
  deleted: number;
  errors: string[];
  updatedEntries: {
    row: number;
    id: number;
    client_name: string;
    hearing_date: string | null;
    provider_name: string | null;
  }[];
}

// ─── Team lookup cache ────────────────────────────────────────────────────────

async function loadTeamMap(): Promise<Map<string, number>> {
  const { rows } = await db.query(
    `SELECT id, team_name FROM mr_teams WHERE is_active = true AND team_color IS NOT NULL`,
  );
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set((r.team_name as string).toLowerCase().trim(), r.id as number);
  }
  return map;
}

function resolveTeamId(
  name: string | null,
  teamMap: Map<string, number>,
): number | null {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  // Exact match
  if (teamMap.has(key)) return teamMap.get(key)!;
  // Partial match
  for (const [tName, tId] of teamMap) {
    if (tName.includes(key) || key.includes(tName)) return tId;
  }
  return null;
}

// ─── Import action ────────────────────────────────────────────────────────────

/** Convert plain-text import comment to JSON array format */
function commentToJson(text: string | null): string | null {
  if (!text?.trim()) return null;
  return JSON.stringify([
    { author: "Import", date: new Date().toISOString(), content: text.trim() },
  ]);
}

export async function importRfcData(
  records: RfcImportRow[],
  mode: "skip" | "update" | "replace",
): Promise<ImportRfcResult> {
  const session = await getSession();
  const userId = session?.user?.id ?? null;

  const teamMap = await loadTeamMap();

  let deleted = 0;
  if (mode === "replace") {
    const { rows } = await db.query("SELECT COUNT(*)::int AS cnt FROM mr_rfc");
    deleted = rows[0]?.cnt ?? 0;
    await db.query("DELETE FROM mr_rfc");
    await db.query("ALTER SEQUENCE mr_rfc_id_seq RESTART WITH 1");
  }

  // Pre-load existing records for duplicate checking (skip/update modes)
  let existingMap: Map<string, number> | null = null;
  if (mode !== "replace") {
    const { rows } = await db.query(
      `SELECT id,
              LOWER(TRIM(client_name)) AS cname,
              COALESCE(hearing_date::text, '') AS hdate,
              COALESCE(LOWER(TRIM(provider_name)), '') AS prov,
              COALESCE(LOWER(TRIM(document_type)), '') AS dtype
       FROM mr_rfc`,
    );
    existingMap = new Map();
    for (const r of rows) {
      const key = `${r.cname}|${r.hdate}|${r.prov}|${r.dtype}`;
      existingMap.set(key, r.id as number);
    }
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const updatedEntries: ImportRfcResult["updatedEntries"] = [];

  // Process records in reverse so bottom-of-file gets lower IDs (matching PHP)
  const reversed = [...records].reverse();

  for (let i = 0; i < reversed.length; i++) {
    const rec = reversed[i];
    const rowNum = records.length - i; // original row number

    if (!rec.client_name?.trim()) {
      skipped++;
      continue;
    }

    const mrTeamId = resolveTeamId(rec.mr_team_name, teamMap);

    // Normalize method_received typos
    let methodReceived = rec.method_received;
    if (methodReceived && /portal/i.test(methodReceived)) {
      methodReceived = "Patient Portal";
    }

    // Build duplicate key
    const dupeKey = [
      rec.client_name.toLowerCase().trim(),
      rec.hearing_date ?? "",
      (rec.provider_name ?? "").toLowerCase().trim(),
      (rec.document_type ?? "").toLowerCase().trim(),
    ].join("|");

    const existingId = existingMap?.get(dupeKey);

    if (existingId && mode === "skip") {
      skipped++;
      continue;
    }

    if (existingId && mode === "update") {
      await db.query(
        `UPDATE mr_rfc SET
           entry_date = $1, mr_team_id = $2, date_signed = $3,
           mycase_link = $4, method_received = $5, date_received = $6,
           filed_to_oho = $7, approved_by_tl = $8, comments = $9, updated_at = NOW()
         WHERE id = $10`,
        [
          rec.entry_date || null,
          mrTeamId,
          rec.date_signed || null,
          rec.mycase_link || null,
          methodReceived || null,
          rec.date_received || null,
          rec.filed_to_oho,
          rec.approved_by_tl,
          commentToJson(rec.comments),
          existingId,
        ],
      );
      updatedEntries.push({
        row: rowNum,
        id: existingId,
        client_name: rec.client_name,
        hearing_date: rec.hearing_date,
        provider_name: rec.provider_name,
      });
      updated++;
      continue;
    }

    // Insert new
    try {
      await db.query(
        `INSERT INTO mr_rfc
           (entry_date, mr_team_id, hearing_date, client_name, document_type,
            provider_name, date_signed, mycase_link, method_received, date_received,
            filed_to_oho, approved_by_tl, comments, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          rec.entry_date || null,
          mrTeamId,
          rec.hearing_date || null,
          rec.client_name.trim(),
          rec.document_type || null,
          rec.provider_name || null,
          rec.date_signed || null,
          rec.mycase_link || null,
          methodReceived || null,
          rec.date_received || null,
          rec.filed_to_oho,
          rec.approved_by_tl,
          commentToJson(rec.comments),
          userId,
        ],
      );
      imported++;
    } catch (err) {
      errors.push(
        `Row ${rowNum} (${rec.client_name.trim()}): ${(err as Error).message}`,
      );
    }
  }

  const modeLabel =
    mode === "skip"
      ? "skip duplicates"
      : mode === "update"
        ? "update existing"
        : "replace all";
  const deleteText = deleted > 0 ? `, ${deleted} deleted` : "";

  if (userId) {
    await logAction(
      "rfc_import",
      `Imported RFC data (${modeLabel}): ${imported} new, ${updated} updated, ${skipped} skipped${deleteText}`,
    );
  }

  return { imported, updated, skipped, deleted, errors, updatedEntries };
}

// ─── Preview duplicate check ──────────────────────────────────────────────────

export interface RfcPreviewCounts {
  total: number;
  newRows: number;
  duplicates: number;
  empty: number;
}

export async function checkRfcDuplicates(
  records: RfcImportRow[],
): Promise<RfcPreviewCounts> {
  // Load existing records keyed the same way as import
  const { rows } = await db.query(
    `SELECT
       LOWER(TRIM(client_name)) AS cname,
       COALESCE(hearing_date::text, '') AS hdate,
       COALESCE(LOWER(TRIM(provider_name)), '') AS prov,
       COALESCE(LOWER(TRIM(document_type)), '') AS dtype
     FROM mr_rfc`,
  );
  const existing = new Set<string>();
  for (const r of rows) {
    existing.add(`${r.cname}|${r.hdate}|${r.prov}|${r.dtype}`);
  }

  let newRows = 0;
  let duplicates = 0;
  let empty = 0;

  for (const rec of records) {
    if (!rec.client_name?.trim()) {
      empty++;
      continue;
    }
    const key = [
      rec.client_name.toLowerCase().trim(),
      rec.hearing_date ?? "",
      (rec.provider_name ?? "").toLowerCase().trim(),
      (rec.document_type ?? "").toLowerCase().trim(),
    ].join("|");

    if (existing.has(key)) {
      duplicates++;
    } else {
      newRows++;
    }
  }

  return { total: records.length, newRows, duplicates, empty };
}

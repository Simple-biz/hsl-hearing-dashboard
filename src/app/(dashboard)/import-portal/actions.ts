"use server";

import { db } from "@/lib/db";
import { logAction } from "@/lib/activity-log";
import { requireRole } from "@/lib/session";

// ── Types ──
export interface PortalRecord {
  entry_date: string | null;
  mr_specialist: string | null;
  hearing_date: string | null;
  client_name: string | null;
  provider: string | null;
  mycase_link: string | null;
  portal_link: string | null;
  portal_username: string | null;
  portal_password: string | null;
  got_mr: boolean;
  approved_by_tl: boolean;
  username_notes: string | null;
  password_notes: string | null;
  got_mr_notes: string | null;
  approved_notes: string | null;
}

interface UpdatedEntry {
  row: number;
  id: number;
  client_name: string;
  hearing_date: string | null;
  provider: string;
}

// ── Resolve current user ID from session ──
async function getCurrentUserId(): Promise<number | null> {
  try {
    const session = await requireRole(["system_admin"]);
    if (session?.user?.email) {
      const { rows } = await db.query(
        "SELECT id FROM users WHERE email = $1 LIMIT 1",
        [session.user.email],
      );
      return rows[0]?.id ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Fetch portal stats ──
export async function getPortalStats() {
  const {
    rows: [stats],
  } = await db.query(`
    SELECT COUNT(*)::text as total,
           (COUNT(DISTINCT client_name) FILTER (WHERE client_name IS NOT NULL AND client_name != ''))::text as clients,
           (COUNT(*) FILTER (WHERE got_mr = true))::text as got_mr_count,
           MIN(entry_date)::text as min_date,
           MAX(entry_date)::text as max_date
    FROM mr_patient_portal
  `);
  return stats;
}

// ── Import portal records ──
export async function importPortalRecords(
  records: PortalRecord[],
  mode: "skip" | "update" | "replace",
) {
  const userId = await getCurrentUserId();
  let deleted = 0;

  if (mode === "replace") {
    const {
      rows: [{ count }],
    } = await db.query("SELECT COUNT(*)::int as count FROM mr_patient_portal");

    deleted = count;

    // Use TRUNCATE instead of DELETE to reset IDs
    await db.query("TRUNCATE TABLE mr_patient_portal RESTART IDENTITY");
  }

  // Pre-load MR Specialists for name lookup
  const { rows: specialistRows } = await db.query(
    "SELECT id, name FROM mr_specialists WHERE is_active = true",
  );
  const specialists: Record<string, number> = {};
  for (const row of specialistRows) {
    specialists[row.name.toLowerCase().trim()] = row.id;
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const updatedEntries: UpdatedEntry[] = [];

  // Pre-fetch existing records for skip/update modes
  let existingMap: Map<string, number> | null = null;
  if (mode !== "replace") {
    const { rows: existing } = await db.query(
      `SELECT id, 
              LOWER(TRIM(COALESCE(client_name, ''))) as client_key,
              COALESCE(hearing_date::text, '') as hdate,
              COALESCE(LOWER(TRIM(provider)), '') as prov
       FROM mr_patient_portal`,
    );
    existingMap = new Map();
    for (const row of existing) {
      const key = `${row.client_key}|${row.hdate}|${row.prov}`;
      existingMap.set(key, row.id);
    }
  }

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (!rec.client_name?.trim()) {
      skipped++;
      continue;
    }

    const clientName = rec.client_name.trim();
    const entryDate = rec.entry_date || null;
    const hearingDate = rec.hearing_date || null;
    const provider = rec.provider?.trim() || "";
    const myCaseLink = rec.mycase_link?.trim() || null;
    const portalLink = rec.portal_link?.trim() || null;
    const username = rec.portal_username?.trim() || null;
    const password = rec.portal_password?.trim() || null;
    const gotMr = rec.got_mr === true;
    const approvedByTl = rec.approved_by_tl === true;
    const usernameNotes = rec.username_notes?.trim() || null;
    const passwordNotes = rec.password_notes?.trim() || null;
    const gotMrNotes = rec.got_mr_notes?.trim() || null;
    const approvedNotes = rec.approved_notes?.trim() || null;

    // Look up MR Specialist ID by name
    let mrSpecialistId: number | null = null;
    const specialistName = rec.mr_specialist?.trim() || "";
    if (specialistName) {
      const specialistKey = specialistName.toLowerCase().trim();
      if (specialists[specialistKey]) {
        mrSpecialistId = specialists[specialistKey];
      } else {
        for (const [name, id] of Object.entries(specialists)) {
          if (name.includes(specialistKey) || specialistKey.includes(name)) {
            mrSpecialistId = id;
            break;
          }
        }
      }
    }

    // Match key: client_name + hearing_date + provider
    const matchKey = `${clientName.toLowerCase().trim()}|${hearingDate || ""}|${(provider || "").toLowerCase()}`;

    if (existingMap && existingMap.has(matchKey)) {
      if (mode === "skip") {
        skipped++;
        continue;
      } else if (mode === "update") {
        const existingId = existingMap.get(matchKey)!;
        await db.query(
          `UPDATE mr_patient_portal SET 
            entry_date = $1,
            mycase_link = $2,
            portal_link = $3, 
            portal_username = $4, 
            portal_password = $5,
            got_mr = $6, 
            approved_by_tl = $7,
            mr_specialist_id = $8,
            username_notes = COALESCE($9, username_notes),
            password_notes = COALESCE($10, password_notes),
            got_mr_notes = COALESCE($11, got_mr_notes),
            approved_notes = COALESCE($12, approved_notes),
            updated_at = NOW()
           WHERE id = $13`,
          [
            entryDate,
            myCaseLink,
            portalLink,
            username,
            password,
            gotMr,
            approvedByTl,
            mrSpecialistId,
            usernameNotes,
            passwordNotes,
            gotMrNotes,
            approvedNotes,
            existingId,
          ],
        );
        updatedEntries.push({
          row: i + 1,
          id: existingId,
          client_name: clientName,
          hearing_date: hearingDate,
          provider,
        });
        updated++;
      }
    } else {
      await db.query(
        `INSERT INTO mr_patient_portal 
          (entry_date, hearing_date, client_name, provider, mycase_link, portal_link, 
           portal_username, portal_password, got_mr, approved_by_tl, mr_specialist_id, 
           username_notes, password_notes, got_mr_notes, approved_notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          entryDate,
          hearingDate,
          clientName,
          provider || null,
          myCaseLink,
          portalLink,
          username,
          password,
          gotMr,
          approvedByTl,
          mrSpecialistId,
          usernameNotes,
          passwordNotes,
          gotMrNotes,
          approvedNotes,
          userId,
        ],
      );
      imported++;
    }
  }

  const modeText =
    mode === "skip"
      ? "skip duplicates"
      : mode === "update"
        ? "update existing"
        : "replace all";
  const deleteText = deleted > 0 ? `, ${deleted} deleted` : "";
  await logAction(
    "portal_bulk_import",
    `Imported portal data (${modeText}): ${imported} new, ${updated} updated, ${skipped} skipped${deleteText}`,
  );

  return { imported, updated, skipped, deleted, updatedEntries };
}

// ── Clear portal data ──
export async function clearPortalData() {
  await db.query("DELETE FROM mr_patient_portal");
  await logAction("clear_portal_data", "Cleared all patient portal data");
}

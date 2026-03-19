"use server";

import { db } from "@/lib/db";
import { logAction } from "@/lib/activity-log";

// ── Fetch raw_hearings for CSV compare ──
export async function fetchRawHearingsForCompare() {
  const { rows } = await db.query(
    `SELECT id, claimant, ssn_last_4, hearing_date::text, hearing_time, converted_time, rep
     FROM raw_hearings ORDER BY hearing_date DESC`,
  );
  return { hearings: rows, totalCount: rows.length };
}

// ── Get raw_hearings stats ──
export async function getRawHearingsStats() {
  const {
    rows: [stats],
  } = await db.query(`
    SELECT COUNT(*) as total,
           COUNT(DISTINCT rep) FILTER (WHERE rep IS NOT NULL AND rep != '') as reps,
           MIN(hearing_date)::text as min_date,
           MAX(hearing_date)::text as max_date
    FROM raw_hearings
  `);
  return stats;
}

// ── Import rows into raw_hearings ──
export async function importRawHearings(
  records: Record<string, string | null>[],
  mode: "skip" | "update" | "replace",
) {
  if (mode === "replace") {
    await db.query("TRUNCATE TABLE raw_hearings RESTART IDENTITY");
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  const CHUNK = 100;

  for (let c = 0; c < records.length; c += CHUNK) {
    const chunk = records.slice(c, c + CHUNK);

    for (const rec of chunk) {
      const claimant = rec.claimant?.trim();
      if (!claimant) {
        skipped++;
        continue;
      }

      const ssn = rec.ssn_last_4?.trim() || null;
      const hearingDate = rec.hearing_date || null;

      if (mode !== "replace") {
        // Check for existing record: claimant + ssn + date
        const baseName = claimant
          .replace(/\s*\([^)]+\)\s*$/g, "")
          .trim()
          .toLowerCase();
        const { rows: existing } = await db.query(
          `SELECT id FROM raw_hearings
           WHERE (LOWER(TRIM(claimant)) = $1 OR LOWER(TRIM(regexp_replace(claimant, '\\s*\\([^)]+\\)\\s*$', '', 'g'))) = $1)
           AND COALESCE(ssn_last_4, '') = COALESCE($2, '')
           AND COALESCE(hearing_date::text, '') = COALESCE($3, '')
           LIMIT 1`,
          [baseName, ssn || "", hearingDate || ""],
        );

        if (existing.length > 0) {
          if (mode === "update") {
            await db.query(
              `UPDATE raw_hearings SET
                rep = $1, claim_type = $2, hearing_time = $3, time_zone = $4,
                claimant_location = $5, representative_location = $6,
                city = $7, state = $8, alj = $9, medical_expert = $10,
                vocational_expert = $11, status_date = $12,
                entered_hearing_level_date = $13, download_type = $14,
                time_adjustment = $15, converted_time = $16, month = $17
               WHERE id = $18`,
              [
                rec.rep || null,
                rec.claim_type || null,
                rec.hearing_time || null,
                rec.time_zone || null,
                rec.claimant_location || null,
                rec.representative_location || null,
                rec.city || null,
                rec.state || null,
                rec.alj || null,
                rec.medical_expert || null,
                rec.vocational_expert || null,
                rec.status_date || null,
                rec.entered_hearing_level_date || null,
                rec.download_type || null,
                rec.time_adjustment || null,
                rec.converted_time || null,
                rec.month || null,
                existing[0].id,
              ],
            );
            updated++;
          } else {
            skipped++;
          }
          continue;
        }
      }

      // Insert
      await db.query(
        `INSERT INTO raw_hearings
          (claimant, rep, ssn_last_4, claim_type, hearing_date, hearing_time, time_zone,
           claimant_location, representative_location, city, state, alj,
           medical_expert, vocational_expert, status_date, entered_hearing_level_date,
           download_type, time_adjustment, converted_time, month)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          claimant,
          rec.rep || null,
          ssn,
          rec.claim_type || null,
          hearingDate,
          rec.hearing_time || null,
          rec.time_zone || null,
          rec.claimant_location || null,
          rec.representative_location || null,
          rec.city || null,
          rec.state || null,
          rec.alj || null,
          rec.medical_expert || null,
          rec.vocational_expert || null,
          rec.status_date || null,
          rec.entered_hearing_level_date || null,
          rec.download_type || null,
          rec.time_adjustment || null,
          rec.converted_time || null,
          rec.month || null,
        ],
      );
      imported++;
    }
  }

  const msg =
    mode === "replace"
      ? `Replaced all RAW hearings: ${imported} imported`
      : `RAW import: ${imported} new, ${updated} updated, ${skipped} skipped (mode: ${mode})`;
  await logAction("import_raw_hearings", msg);

  return { imported, updated, skipped };
}

// ── Clear raw_hearings ──
export async function clearRawHearings() {
  await db.query("TRUNCATE TABLE raw_hearings RESTART IDENTITY");
  await logAction("clear_raw_hearings", "Cleared all RAW hearings data");
}

// ── Import Chronicle compare results into raw_hearings ──
export async function importChronicleToRaw(
  entries: Record<string, string | null>[],
) {
  let imported = 0;
  let skipped = 0;

  for (const e of entries) {
    if (!e.claimant) {
      skipped++;
      continue;
    }
    try {
      await db.query(
        `INSERT INTO raw_hearings
          (claimant, ssn_last_4, claim_type, hearing_date, hearing_time, time_zone,
           claimant_location, representative_location, alj, medical_expert,
           vocational_expert, status_date, entered_hearing_level_date, converted_time)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          e.claimant,
          e.ssn_last_4 || null,
          e.claim_type || null,
          e.hearing_date || null,
          e.hearing_time || null,
          e.time_zone || "ET",
          e.claimant_location || null,
          e.representative_location || null,
          e.alj || null,
          e.medical_expert || null,
          e.vocational_expert || null,
          e.status_date || null,
          e.entered_hearing_level_date || null,
          e.converted_time || null,
        ],
      );
      imported++;
    } catch {
      skipped++;
    }
  }

  if (imported > 0)
    await logAction(
      "import_raw_hearings",
      `Imported ${imported} entries from Chronicle CSV compare to RAW`,
    );
  return { imported, skipped };
}

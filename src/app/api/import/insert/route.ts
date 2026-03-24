import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAction } from "@/lib/activity-log";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSSN(raw: string): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "").slice(-4);
  return digits.length > 0 ? digits : null;
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
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
  return null;
}

function parseTime(raw: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const ap = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ap) {
    let h = parseInt(ap[1]);
    if (ap[3].toUpperCase() === "PM" && h !== 12) h += 12;
    if (ap[3].toUpperCase() === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${ap[2]}`;
  }
  if (/^\d{1,2}:\d{2}$/.test(s)) return s;
  const d = Number(s);
  if (!isNaN(d) && d >= 0 && d < 1) {
    const m = Math.round(d * 1440);
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }
  return s;
}

function convertToEST(time: string | null, tz: string): string | null {
  if (!time) return null;
  const t = parseTime(time);
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const offsets: Record<string, number> = {
    ET: 0,
    EST: 0,
    EDT: 0,
    CT: 1,
    CST: 1,
    CDT: 1,
    MT: 2,
    MST: 2,
    MDT: 2,
    PT: 3,
    PST: 3,
    PDT: 3,
    AKT: 4,
    AKST: 4,
    HT: 5,
    HST: 5,
  };
  const off = offsets[(tz || "").toUpperCase().trim()];
  if (off === undefined) return t;
  const adj = (((h - off) % 24) + 24) % 24;
  return `${String(adj).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Importable columns (must match DB schema)
const IMPORTABLE = new Set([
  "claimant",
  "ssn_last_4",
  "claim_type",
  "hearing_date",
  "hearing_time",
  "time_zone",
  "claimant_location",
  "representative_location",
  "city",
  "state",
  "alj",
  "medical_expert",
  "vocational_expert",
  "status_date",
  "entered_hearing_level_date",
  "download_type",
  "manner_of_appearance",
  "hearing_decision_status",
  "phi_sheet_complete",
  "rep_docs_complete",
  "fee_agreement_complete",
  "five_day_notice",
  "rfc_status",
  "task_assigned",
  "brief_assigned_to",
  "mr_team_id",
  "medical_record_status",
  "medical_record_link",
  "claimant_link",
  "post_hrg_deadline",
  "post_hrg_notes",
  "assigned_rep_id",
  "assignment_status",
  "converted_time_est",
]);

async function loadLookups() {
  const [reps, teams] = await Promise.all([
    db.query("SELECT id, name FROM representatives ORDER BY name"),
    db.query("SELECT id, team_name FROM mr_teams ORDER BY team_name"),
  ]);
  const repLookup: Record<string, number> = {};
  for (const r of reps.rows) repLookup[r.name.toLowerCase().trim()] = r.id;
  const teamLookup: Record<string, number> = {};
  for (const t of teams.rows)
    teamLookup[t.team_name.toLowerCase().trim()] = t.id;
  return { repLookup, teamLookup };
}

// ─── POST /api/import/insert ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );

  const body = await req.json();
  const { records, mapping, hyperlinks = {} } = body;

  if (!records || records.length === 0) {
    return NextResponse.json({
      success: false,
      message: "No records to import",
    });
  }

  // Only load lookups if mapping includes fields that need them
  const needsRepLookup = mapping.representative !== undefined;
  const needsTeamLookup = mapping.mr_team_id !== undefined;
  let repLookup: Record<string, number> = {};
  let teamLookup: Record<string, number> = {};
  if (needsRepLookup || needsTeamLookup) {
    const loaded = await loadLookups();
    if (needsRepLookup) repLookup = loaded.repLookup;
    if (needsTeamLookup) teamLookup = loaded.teamLookup;
  }
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const importedIds: number[] = [];

  // ── Phase 1: Process all records into field maps ──
  const processedRows: { fields: Record<string, unknown>; row: number }[] = [];

  for (const record of records) {
    try {
      const row = record.data as string[];
      const fields: Record<string, unknown> = {};

      for (const [dbField, colIdx] of Object.entries(mapping) as [
        string,
        number,
      ][]) {
        if (colIdx === null || colIdx === undefined || colIdx < 0) continue;
        const rawValue = String(row[colIdx] ?? "").trim();
        if (!rawValue) continue;

        if (dbField === "representative") {
          const key = rawValue.toLowerCase().trim();
          if (key === "wd - never assigned" || key === "never assigned") {
            fields.assignment_status = "wd_never_assigned";
          } else if (
            key === "withdrawal" ||
            key === "wd" ||
            key === "withdrawn"
          ) {
            fields.assignment_status = "withdrawal";
          } else if (repLookup[key]) {
            fields.assigned_rep_id = repLookup[key];
          }
          continue;
        }

        if (dbField === "medical_record_source") {
          const colLetter = String.fromCharCode(65 + colIdx);
          const cellRef = `${colLetter}${record.rowIndex + 2}`;
          if (hyperlinks[cellRef])
            fields.medical_record_link = hyperlinks[cellRef];
          continue;
        }

        if (dbField === "mr_team_id") {
          const tid = teamLookup[rawValue.toLowerCase().trim()];
          if (tid) fields.mr_team_id = tid;
          continue;
        }

        if (!IMPORTABLE.has(dbField)) continue;

        if (
          dbField === "hearing_date" ||
          dbField === "status_date" ||
          dbField === "entered_hearing_level_date" ||
          dbField === "post_hrg_deadline"
        ) {
          fields[dbField] = parseDate(rawValue);
        } else if (
          dbField === "hearing_time" ||
          dbField === "converted_time_est"
        ) {
          fields[dbField] = parseTime(rawValue);
        } else if (dbField === "ssn_last_4") {
          fields[dbField] = formatSSN(rawValue);
        } else if (
          [
            "phi_sheet_complete",
            "rep_docs_complete",
            "fee_agreement_complete",
            "five_day_notice",
            "task_assigned",
          ].includes(dbField)
        ) {
          fields[dbField] =
            rawValue === "1" ||
            rawValue.toLowerCase() === "true" ||
            rawValue.toLowerCase() === "yes";
        } else {
          fields[dbField] = rawValue;
        }
      }

      // Apply cross-sheet lookup overrides
      if (record.ssn && !fields.ssn_last_4)
        fields.ssn_last_4 = formatSSN(record.ssn);
      if (record.claimantLocation && !fields.claimant_location)
        fields.claimant_location = record.claimantLocation;
      if (record.repLocation && !fields.representative_location)
        fields.representative_location = record.repLocation;
      if (record.downloadType && !fields.download_type)
        fields.download_type = record.downloadType;
      if (record.statusDate && !fields.status_date)
        fields.status_date = parseDate(record.statusDate);

      if (
        !fields.converted_time_est &&
        fields.hearing_time &&
        fields.time_zone
      ) {
        fields.converted_time_est = convertToEST(
          fields.hearing_time as string,
          fields.time_zone as string,
        );
      }

      if (!fields.claimant || !fields.hearing_date) {
        skipped++;
        continue;
      }

      processedRows.push({ fields, row: record.row });
    } catch (e) {
      errors.push(`Row ${record.row}: ${(e as Error).message}`);
      skipped++;
    }
  }

  // ── Phase 2: Bulk INSERT in chunks of 100 rows ──
  if (processedRows.length > 0) {
    // Collect all unique column names across all rows
    const allKeys = new Set<string>();
    for (const { fields } of processedRows) {
      for (const k of Object.keys(fields)) {
        if (IMPORTABLE.has(k)) allKeys.add(k);
      }
    }
    const columns = Array.from(allKeys);
    const CHUNK = 100; // 100 rows × ~30 cols = ~3000 params per query (well under 32k limit)

    for (let c = 0; c < processedRows.length; c += CHUNK) {
      const chunk = processedRows.slice(c, c + CHUNK);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const { fields } of chunk) {
        const ph: string[] = [];
        for (const col of columns) {
          ph.push(`$${idx++}`);
          values.push(fields[col] ?? null);
        }
        placeholders.push(`(${ph.join(", ")})`);
      }

      try {
        const result = await db.query(
          `INSERT INTO hearings (${columns.join(", ")}) VALUES ${placeholders.join(", ")} RETURNING id`,
          values,
        );
        for (const row of result.rows) {
          importedIds.push(row.id);
          imported++;
        }
      } catch {
        // Fallback: insert individually for this chunk
        for (const { fields, row: rowNum } of chunk) {
          try {
            const keys = Object.keys(fields).filter((k) => IMPORTABLE.has(k));
            const vals = keys.map((k) => fields[k]);
            const ph = keys.map((_, i) => `$${i + 1}`);
            const result = await db.query(
              `INSERT INTO hearings (${keys.join(", ")}) VALUES (${ph.join(", ")}) RETURNING id`,
              vals,
            );
            if (result.rows[0]?.id) {
              importedIds.push(result.rows[0].id);
              imported++;
            }
          } catch (err) {
            errors.push(`Row ${rowNum}: ${(err as Error).message}`);
            skipped++;
          }
        }
      }
    }
  }

  // Log activity
  if (imported > 0) {
    await logAction(
      "hearing_created",
      `Imported ${imported} hearings from spreadsheet (${skipped} skipped)`,
    );
  }

  return NextResponse.json({
    success: true,
    imported,
    skipped,
    errors,
    importedIds,
  });
}

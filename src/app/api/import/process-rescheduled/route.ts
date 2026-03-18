import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAction } from "@/lib/activity-log";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSSN(raw: string): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "").slice(-4);
  return digits.length === 4 ? digits : null;
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

const UPDATABLE = new Set([
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
  "medical_record_link",
  "claimant_link",
  "assigned_rep_id",
  "assignment_status",
  "converted_time_est",
]);

// ─── POST /api/import/process-rescheduled ───────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );

  const body = await req.json();
  const { records, mapping, hyperlinks = {}, preserveExisting = false } = body;

  if (!records || records.length === 0) {
    return NextResponse.json({
      success: false,
      message: "No records to process",
    });
  }

  // Pre-load lookups
  const [repsRes, teamsRes] = await Promise.all([
    db.query("SELECT id, name FROM representatives ORDER BY name"),
    db.query("SELECT id, team_name FROM mr_teams ORDER BY team_name"),
  ]);
  const repLookup: Record<string, number> = {};
  for (const r of repsRes.rows) repLookup[r.name.toLowerCase().trim()] = r.id;
  const teamLookup: Record<string, number> = {};
  for (const t of teamsRes.rows)
    teamLookup[t.team_name.toLowerCase().trim()] = t.id;

  // Fields that are "assignment" fields — preserved when preserveExisting is on
  // Note: claimant and hearing_date are NEVER protected — they're the rescheduled data
  const PROTECTED_FIELDS = new Set([
    "assigned_rep_id",
    "assignment_status",
    "mr_team_id",
    "medical_record_status",
    "medical_record_link",
    "rfc_status",
    "brief_assigned_to",
    "hearing_decision_status",
    "rep_docs_assigned_to",
    "task_assigned",
    "rep_docs_complete",
    "fee_agreement_complete",
    "phi_sheet_complete",
    "five_day_notice",
    "post_hrg_review",
    "post_hrg_deadline",
    "post_hrg_notes",
  ]);

  let updated = 0;
  const errors: string[] = [];

  for (const rec of records) {
    const originalId = rec.original_id;
    if (!originalId) continue;

    try {
      // Get original record — full row when preserveExisting, minimal otherwise
      const { rows: origRows } = await db.query(
        preserveExisting
          ? "SELECT * FROM hearings WHERE id = $1"
          : "SELECT claimant, hearing_date::text, assigned_rep_id FROM hearings WHERE id = $1",
        [originalId],
      );
      if (origRows.length === 0) {
        errors.push(`Original record #${originalId} not found`);
        continue;
      }
      const original = origRows[0];

      // Build update data from sheet row using mapping
      const rowData = rec.data as string[];
      const updateData: Record<string, unknown> = {};

      for (const [dbField, colIdx] of Object.entries(mapping) as [
        string,
        number,
      ][]) {
        if (colIdx === null || colIdx === undefined || colIdx < 0) continue;
        const rawValue = String(rowData[colIdx] ?? "").trim();
        if (!rawValue) continue;

        // Handle representative lookup
        if (dbField === "representative") {
          const repName = rawValue.toLowerCase().trim();
          if (
            repName === "not assigned" ||
            repName === "n/a" ||
            repName === "none"
          ) {
            updateData.assigned_rep_id = null;
            updateData.assignment_status = null;
          } else if (
            repName === "wd - never assigned" ||
            repName === "never assigned"
          ) {
            updateData.assigned_rep_id = null;
            updateData.assignment_status = "wd_never_assigned";
          } else if (
            repName === "withdrawal" ||
            repName === "wd" ||
            repName === "withdrawn"
          ) {
            updateData.assigned_rep_id = null;
            updateData.assignment_status = "withdrawal";
          } else if (repLookup[repName]) {
            updateData.assigned_rep_id = repLookup[repName];
            updateData.assignment_status = null;
          }
          continue;
        }

        if (dbField === "medical_record_source") {
          const colLetter = String.fromCharCode(65 + colIdx);
          const cellRef = `${colLetter}${rec.rowIndex + 2}`;
          if (hyperlinks[cellRef])
            updateData.medical_record_link = hyperlinks[cellRef];
          continue;
        }

        if (dbField === "mr_team_id" && !/^\d+$/.test(rawValue)) {
          const tid = teamLookup[rawValue.toLowerCase().trim()];
          if (tid) updateData.mr_team_id = tid;
          continue;
        }

        if (!UPDATABLE.has(dbField)) continue;

        // Parse special field types
        if (
          [
            "hearing_date",
            "status_date",
            "entered_hearing_level_date",
            "post_hrg_deadline",
          ].includes(dbField)
        ) {
          const parsed = parseDate(rawValue);
          if (parsed) updateData[dbField] = parsed;
        } else if (dbField === "hearing_time") {
          const parsed = parseTime(rawValue);
          if (parsed) updateData[dbField] = parsed;
        } else if (dbField === "ssn_last_4") {
          const formatted = formatSSN(rawValue);
          if (formatted) updateData[dbField] = formatted;
        } else {
          updateData[dbField] = rawValue;
        }
      }

      // Apply cross-sheet lookup overrides
      if (rec.ssn)
        updateData.ssn_last_4 = formatSSN(rec.ssn) ?? updateData.ssn_last_4;
      if (rec.claimantLocation)
        updateData.claimant_location = rec.claimantLocation;
      if (rec.repLocation) updateData.representative_location = rec.repLocation;
      if (rec.downloadType) updateData.download_type = rec.downloadType;
      if (rec.statusDate) {
        const d = parseDate(rec.statusDate);
        if (d) updateData.status_date = d;
      }

      // ALWAYS set the claimant name to the rescheduled version
      // e.g. "John Doe (Rescheduled)" or "John Doe (Rescheduled 2)"
      updateData.claimant = rec.claimant;

      // Compute converted_time_est if time/timezone updated
      if (updateData.hearing_time) {
        // Get timezone from update or existing record
        let tz = updateData.time_zone as string | undefined;
        if (!tz) {
          const { rows: tzRows } = await db.query(
            "SELECT time_zone FROM hearings WHERE id = $1",
            [originalId],
          );
          tz = tzRows[0]?.time_zone;
        }
        if (tz) {
          updateData.converted_time_est = convertToEST(
            updateData.hearing_time as string,
            tz,
          );
        }
      }

      // Build UPDATE
      const keys = Object.keys(updateData).filter((k) => {
        if (updateData[k] === undefined) return false;
        // If preserveExisting, skip protected fields that already have values in DB
        // But ALWAYS allow claimant and hearing_date (these are the rescheduled data)
        if (preserveExisting && PROTECTED_FIELDS.has(k)) {
          const existing = original[k];
          if (
            existing !== null &&
            existing !== undefined &&
            existing !== "" &&
            existing !== false
          )
            return false;
        }
        return true;
      });
      if (keys.length === 0) {
        errors.push(`Row ${rec.row}: No data to update`);
        continue;
      }

      const setClauses = keys.map((k, i) => `${k} = $${i + 1}`);
      const values = keys.map((k) => updateData[k]);
      values.push(originalId);

      await db.query(
        `UPDATE hearings SET ${setClauses.join(", ")} WHERE id = $${values.length}`,
        values,
      );
      updated++;

      const newDate = (updateData.hearing_date as string) || "same date";
      await logAction(
        "hearing_rescheduled",
        `Updated hearing #${originalId} (${original.claimant} - ${original.hearing_date}) → rescheduled to ${newDate} as "${rec.claimant}"`,
      );
    } catch (e) {
      errors.push(`Row ${rec.row}: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({ success: true, updated, errors });
}

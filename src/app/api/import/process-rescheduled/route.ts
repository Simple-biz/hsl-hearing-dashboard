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

// ─── POST /api/import/process-rescheduled ───────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );

  const body = await req.json();
  const { records, mapping } = body;

  if (!records || records.length === 0) {
    return NextResponse.json({
      success: false,
      message: "No records to process",
    });
  }

  const userName = session.user.name || session.user.email || "Unknown";

  let updated = 0;
  const errors: string[] = [];

  for (const rec of records) {
    const originalId = rec.original_id;
    if (!originalId) continue;

    try {
      // Fetch original record with rep name and team name
      const { rows: origRows } = await db.query(
        `SELECT h.*, 
                r.name AS rep_name,
                t.team_name AS mr_team_name
         FROM hearings h 
         LEFT JOIN representatives r ON r.id = h.assigned_rep_id 
         LEFT JOIN mr_teams t ON t.id = h.mr_team_id
         WHERE h.id = $1`,
        [originalId],
      );
      if (origRows.length === 0) {
        errors.push(`Original record #${originalId} not found`);
        continue;
      }
      const original = origRows[0];

      // ── Extract new values from the sheet row ──
      const rowData = rec.data as string[];

      const newClaimant = rec.claimant || original.claimant;

      // Hearing Date
      let newHearingDate = original.hearing_date;
      if (mapping.hearing_date !== undefined && mapping.hearing_date !== null) {
        const raw = String(rowData[mapping.hearing_date] ?? "").trim();
        if (raw) {
          const parsed = parseDate(raw);
          if (parsed) newHearingDate = parsed;
        }
      }

      // Hearing Time
      let newHearingTime: string | null = null;
      if (mapping.hearing_time !== undefined && mapping.hearing_time !== null) {
        const raw = String(rowData[mapping.hearing_time] ?? "").trim();
        if (raw) newHearingTime = parseTime(raw);
      }

      // Time Zone
      let newTimeZone: string | null = null;
      if (mapping.time_zone !== undefined && mapping.time_zone !== null) {
        const raw = String(rowData[mapping.time_zone] ?? "").trim();
        if (raw) newTimeZone = raw;
      }

      // ALJ
      let newAlj: string | null = null;
      if (mapping.alj !== undefined && mapping.alj !== null) {
        const raw = String(rowData[mapping.alj] ?? "").trim();
        if (raw) newAlj = raw;
      }

      // SSN (keep existing or update)
      let newSsn = original.ssn_last_4;
      if (mapping.ssn_last_4 !== undefined && mapping.ssn_last_4 !== null) {
        const raw = String(rowData[mapping.ssn_last_4] ?? "").trim();
        if (raw) {
          const formatted = formatSSN(raw);
          if (formatted) newSsn = formatted;
        }
      }
      if (rec.ssn) {
        const formatted = formatSSN(rec.ssn);
        if (formatted) newSsn = formatted;
      }

      // Claim Type (keep existing or update)
      let newClaimType = original.claim_type;
      if (mapping.claim_type !== undefined && mapping.claim_type !== null) {
        const raw = String(rowData[mapping.claim_type] ?? "").trim();
        if (raw) newClaimType = raw;
      }

      // Compute converted_time_est
      let newConvertedTimeEst: string | null = null;
      if (newHearingTime) {
        const tz = newTimeZone || original.time_zone || "";
        newConvertedTimeEst = convertToEST(newHearingTime, tz);
      }

      // ── Insert into rescheduled_history before clearing ──
      await db.query(
        `INSERT INTO rescheduled_history 
          (hearing_id, original_claimant, original_hearing_date, new_claimant, new_hearing_date,
           previous_rep_id, previous_rep_name, previous_decision, previous_mr_team, previous_mr_team_id,
           previous_brief, previous_mr_status, previous_alj, previous_assignment_status, rescheduled_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          originalId,
          original.claimant,
          original.hearing_date,
          newClaimant,
          newHearingDate,
          original.assigned_rep_id || null,
          original.rep_name || null,
          original.hearing_decision_status || null,
          original.mr_team_name || null,
          original.mr_team_id || null,
          original.brief_assigned_to || null,
          original.medical_record_status || null,
          original.alj || null,
          original.assignment_status || null,
          userName,
        ],
      );

      // ── Update the hearing: keep specific fields, clear everything else ──
      await db.query(
        `UPDATE hearings SET
          -- Kept / updated fields
          claimant = $1,
          ssn_last_4 = $2,
          claim_type = $3,
          hearing_date = $4,
          hearing_time = $5,
          time_zone = $6,
          converted_time_est = $7,
          alj = $8,
          -- Clear all other fields
          city = NULL,
          state = NULL,
          claimant_location = NULL,
          representative_location = NULL,
          medical_expert = NULL,
          vocational_expert = NULL,
          status_date = NULL,
          entered_hearing_level_date = NULL,
          download_type = NULL,
          manner_of_appearance = NULL,
          hearing_decision_status = NULL,
          assigned_rep_id = NULL,
          assignment_status = NULL,
          mr_team_id = NULL,
          medical_record_status = NULL,
          medical_record_link = NULL,
          brief_assigned_to = NULL,
          rep_docs_assigned_to = NULL,
          rfc_status = NULL,
          task_assigned = false,
          rep_docs_complete = false,
          fee_agreement_complete = false,
          five_day_notice = false,
          phi_sheet_complete = false,
          post_hrg_review = false,
          post_hrg_notes = NULL,
          post_hrg_deadline = NULL,
          post_hrg_dev_status = NULL,
          post_hrg_requirements = NULL
        WHERE id = $9`,
        [
          newClaimant,
          newSsn,
          newClaimType,
          newHearingDate,
          newHearingTime || original.hearing_time,
          newTimeZone || original.time_zone,
          newConvertedTimeEst || original.converted_time_est,
          newAlj || original.alj,
          originalId,
        ],
      );
      // ── Reset representative_docs workflow (retains assigned_to only) ──
      // claimant_link, chronicle_link, and ssn_last_4 live on the hearings row
      // and are preserved by the UPDATE above.
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
        [originalId],
      );

      updated++;

      await logAction(
        "hearing_rescheduled",
        `Rescheduled hearing #${originalId}: "${original.claimant}" (${original.hearing_date}) → "${newClaimant}" (${newHearingDate})${original.rep_name ? ` | Prev rep: ${original.rep_name}` : ""}`,
      );
    } catch (e) {
      errors.push(`Row ${rec.row}: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({ success: true, updated, errors });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAction } from "@/lib/activity-log";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MappedRow {
  rowIndex: number;
  data: Record<string, string>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSSN(raw: string): string {
  return raw.replace(/\D/g, "").slice(-4);
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const y = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${y}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const n = Number(raw);
  if (!isNaN(n) && n > 40000 && n < 60000) {
    return new Date((n - 25569) * 86400000).toISOString().split("T")[0];
  }
  return null;
}

function parseTime(raw: string): string | null {
  if (!raw) return null;
  const ap = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ap) {
    let h = parseInt(ap[1]);
    if (ap[3].toUpperCase() === "PM" && h !== 12) h += 12;
    if (ap[3].toUpperCase() === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${ap[2]}`;
  }
  if (/^\d{1,2}:\d{2}$/.test(raw)) return raw;
  const d = Number(raw);
  if (!isNaN(d) && d >= 0 && d < 1) {
    const m = Math.round(d * 1440);
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }
  return raw;
}

function convertToEST(time: string, tz: string): string | null {
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

async function loadLookups() {
  const [reps, teams] = await Promise.all([
    db.query("SELECT id, name FROM representatives ORDER BY name"),
    db.query("SELECT id, team_name FROM mr_teams ORDER BY team_name"),
  ]);
  const repLookup: Record<string, { id: number; name: string }> = {};
  for (const r of reps.rows)
    repLookup[r.name.toLowerCase().trim()] = { id: r.id, name: r.name };
  const teamLookup: Record<string, { id: number; name: string }> = {};
  for (const t of teams.rows)
    teamLookup[t.team_name.toLowerCase().trim()] = {
      id: t.id,
      name: t.team_name,
    };
  return { repLookup, teamLookup };
}

function resolveRep(
  name: string,
  lookup: Record<string, { id: number; name: string }>,
): { repId?: number; repName?: string; status?: string; matched: boolean } {
  const n = name.toLowerCase().trim();
  if (!n || n === "not assigned" || n === "n/a" || n === "none")
    return { matched: true };
  if (n === "wd - never assigned" || n === "never assigned")
    return { status: "wd_never_assigned", matched: true };
  if (n === "withdrawal" || n === "wd" || n === "withdrawn")
    return { status: "withdrawal", matched: true };
  if (lookup[n])
    return { repId: lookup[n].id, repName: lookup[n].name, matched: true };
  return { matched: false };
}

// ─── Column list ────────────────────────────────────────────────────────────

const COLS = [
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
  "post_hrg_deadline",
  "mr_team_id",
  "hearing_decision_status",
  "medical_record_status",
  "medical_record_link",
  "claimant_link",
  "phi_sheet_complete",
  "rep_docs_complete",
  "fee_agreement_complete",
  "five_day_notice",
  "rfc_status",
  "task_assigned",
  "brief_assigned_to",
  "post_hrg_notes",
];

function buildVals(data: Record<string, string>) {
  const cols: string[] = [];
  const vals: (string | null)[] = [];
  for (const c of COLS) {
    const raw = (data[c] || "").trim();
    if (!raw) continue;
    if (
      [
        "hearing_date",
        "status_date",
        "entered_hearing_level_date",
        "post_hrg_deadline",
      ].includes(c)
    ) {
      const d = parseDate(raw);
      if (d) {
        cols.push(c);
        vals.push(d);
      }
    } else if (c === "hearing_time") {
      const t = parseTime(raw);
      if (t) {
        cols.push(c);
        vals.push(t);
      }
    } else if (c === "ssn_last_4") {
      cols.push(c);
      vals.push(formatSSN(raw));
    } else {
      cols.push(c);
      vals.push(raw);
    }
  }
  if (data._assigned_rep_id) {
    cols.push("assigned_rep_id");
    vals.push(data._assigned_rep_id);
  }
  if (data._assignment_status) {
    cols.push("assignment_status");
    vals.push(data._assignment_status);
  }
  if (data._converted_time_est) {
    cols.push("converted_time_est");
    vals.push(data._converted_time_est);
  }
  return { cols, vals };
}

// ─── Auth check helper ──────────────────────────────────────────────────────

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  if (session.user.role !== "system_admin" && session.user.id !== 1)
    return null;
  return session;
}

// ─── POST handler — routes by action param ──────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await checkAuth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  try {
    switch (action) {
      case "analyze":
        return handleAnalyze(body.rows);
      case "notInSheet":
        return handleNotInSheet(body.matchedIds);
      case "import":
        return handleImport(body.records);
      case "update":
        return handleUpdate(body.records);
      case "updateRescheduled":
        return handleUpdateRescheduled(body.records);
      case "deleteNotInSheet":
        return handleDeleteNotInSheet(body.ids);
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}

// ─── Analyze batch (bulk in-memory matching — 1 query instead of N*3) ───────

async function handleAnalyze(rows: MappedRow[]) {
  const { repLookup, teamLookup } = await loadLookups();

  // Load ALL existing hearings into memory for fast matching
  // This is ~5-10k rows with 4 small columns — well under 10MB
  const { rows: existing } = await db.query(
    "SELECT id, LOWER(claimant) as claimant, ssn_last_4, hearing_date::text as hearing_date FROM hearings",
  );

  // Build lookup indexes for three-tier duplicate detection
  // Tier 1: claimant+ssn+date → id
  const byClaimantSsnDate: Record<string, number> = {};
  // Tier 2: claimant+ssn → id
  const byClaimantSsn: Record<string, number> = {};
  // Tier 3: claimant+date → id
  const byClaimantDate: Record<string, number> = {};

  for (const h of existing) {
    const c = (h.claimant || "").trim();
    if (h.ssn_last_4 && h.hearing_date)
      byClaimantSsnDate[`${c}|${h.ssn_last_4}|${h.hearing_date}`] = h.id;
    if (h.ssn_last_4) byClaimantSsn[`${c}|${h.ssn_last_4}`] = h.id;
    if (h.hearing_date) byClaimantDate[`${c}|${h.hearing_date}`] = h.id;
  }

  const result = {
    newRecords: [] as MappedRow[],
    duplicateRecords: [] as (MappedRow & { existingId: number })[],
    rescheduledRecords: [] as (MappedRow & {
      originalId: number;
      baseName: string;
    })[],
    skippedRecords: [] as (MappedRow & { reason: string })[],
    repsMatched: 0,
    repsUnmatched: 0,
    teamsMatched: 0,
    teamsUnmatched: 0,
  };

  // Track which DB IDs were matched (for Not in Sheet calculation)
  const matchedDbIds = new Set<number>();

  for (const row of rows) {
    const claimant = (row.data.claimant || "").trim();
    const hearingDate = parseDate(row.data.hearing_date || "");
    const ssn = row.data.ssn_last_4 ? formatSSN(row.data.ssn_last_4) : null;
    const claimantLower = claimant.toLowerCase();

    if (!claimant || claimant === "0" || claimant.toLowerCase() === "false") {
      result.skippedRecords.push({ ...row, reason: "Empty/invalid claimant" });
      continue;
    }
    if (!hearingDate) {
      result.skippedRecords.push({ ...row, reason: "Missing hearing date" });
      continue;
    }

    // Resolve rep
    if (row.data.representative) {
      const rep = resolveRep(row.data.representative, repLookup);
      if (rep.repId) {
        row.data._assigned_rep_id = String(rep.repId);
        row.data._assigned_rep_name = rep.repName || "";
        result.repsMatched++;
      }
      if (rep.status) row.data._assignment_status = rep.status;
      if (!rep.matched && row.data.representative.trim()) {
        row.data._unmatched_rep = row.data.representative;
        result.repsUnmatched++;
      }
      // Keep original representative value for preview display
    }

    // Resolve MR team
    if (row.data.mr_team_id && isNaN(Number(row.data.mr_team_id))) {
      const tn = row.data.mr_team_id.toLowerCase().trim();
      if (teamLookup[tn]) {
        row.data._mr_team_name = teamLookup[tn].name;
        row.data.mr_team_id = String(teamLookup[tn].id);
        result.teamsMatched++;
      } else {
        row.data._unmatched_team = row.data.mr_team_id;
        delete row.data.mr_team_id;
        result.teamsUnmatched++;
      }
    }

    // EST conversion
    if (row.data.hearing_time && row.data.time_zone) {
      const est = convertToEST(row.data.hearing_time, row.data.time_zone);
      if (est) row.data._converted_time_est = est;
    }

    // Rescheduled check — matching old PHP logic exactly:
    // 1. If claimant ends with "(Rescheduled)" or "(Rescheduled N)"
    // 2. First check: does EXACT rescheduled name already exist in DB? → treat as normal duplicate
    // 3. Otherwise find original by baseName + SSN → classify as rescheduled
    const rm = claimant.match(/\s*\(Rescheduled(?:\s+\d+)?\)\s*$/i);
    if (rm) {
      const baseName = claimant
        .replace(/\s*\(Rescheduled(?:\s+\d+)?\)\s*$/i, "")
        .trim();
      const baseLower = baseName.toLowerCase();

      // Step 1: Does the exact rescheduled name already exist in DB?
      // If yes, it was imported before — fall through to normal duplicate detection
      let alreadyImported = false;
      if (ssn) {
        alreadyImported = existing.some(
          (h) => h.claimant === claimantLower && h.ssn_last_4 === ssn,
        );
      }

      if (!alreadyImported && ssn) {
        // Step 2: Find original by base name + SSN
        const orig = existing.find(
          (h) => h.ssn_last_4 === ssn && h.claimant === baseLower,
        );
        if (orig) {
          result.rescheduledRecords.push({
            ...row,
            originalId: orig.id,
            baseName,
          });
          matchedDbIds.add(orig.id);
          continue;
        }
      }
      // If already imported or no original found, fall through to normal duplicate/new detection
    }

    // Three-tier duplicate detection — pure in-memory lookups
    let eid: number | null = null;
    if (ssn && hearingDate)
      eid = byClaimantSsnDate[`${claimantLower}|${ssn}|${hearingDate}`] ?? null;
    if (!eid && ssn) eid = byClaimantSsn[`${claimantLower}|${ssn}`] ?? null;
    if (!eid && hearingDate)
      eid = byClaimantDate[`${claimantLower}|${hearingDate}`] ?? null;

    if (eid) {
      result.duplicateRecords.push({ ...row, existingId: eid });
      matchedDbIds.add(eid);
    } else {
      result.newRecords.push(row);
    }
  }

  return NextResponse.json({
    ...result,
    matchedDbIds: Array.from(matchedDbIds),
    totalDbCount: existing.length,
  });
}

// ─── Not in Sheet — DB records not matched by any sheet row ─────────────────

async function handleNotInSheet(matchedIds: number[]) {
  const matchedSet = new Set(matchedIds);

  if (matchedSet.size === 0) {
    // No matches at all — return all DB records (limited)
    const { rows } = await db.query(
      `SELECT h.id, h.claimant, h.hearing_date::text, h.ssn_last_4, h.hearing_time, r.name as rep_name
       FROM hearings h LEFT JOIN representatives r ON h.assigned_rep_id = r.id
       ORDER BY h.hearing_date DESC LIMIT 100`,
    );
    return NextResponse.json(rows);
  }

  // Find records whose ID was NOT matched as duplicate or rescheduled original
  const { rows } = await db.query(
    `SELECT h.id, h.claimant, h.hearing_date::text, h.ssn_last_4, h.hearing_time, r.name as rep_name
     FROM hearings h LEFT JOIN representatives r ON h.assigned_rep_id = r.id
     ORDER BY h.hearing_date DESC`,
  );

  const unmatched = rows.filter((r) => !matchedSet.has(r.id));
  // Return first 100 like old PHP
  return NextResponse.json(unmatched.slice(0, 100));
}

// ─── Import batch ───────────────────────────────────────────────────────────

async function handleImport(records: MappedRow[]) {
  let imported = 0;
  const errors: string[] = [];
  for (const rec of records) {
    try {
      const { cols, vals } = buildVals(rec.data);
      if (!cols.length) {
        errors.push(`Row ${rec.rowIndex + 2}: No data`);
        continue;
      }
      await db.query(
        `INSERT INTO hearings (${cols.join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")})`,
        vals,
      );
      imported++;
    } catch (e: unknown) {
      errors.push(
        `Row ${rec.rowIndex + 2}: ${e instanceof Error ? e.message : "Error"}`,
      );
    }
  }
  if (imported > 0)
    await logAction("hearing_imported", `Imported ${imported} new hearings`);
  return NextResponse.json({ imported, errors });
}

// ─── Update batch ───────────────────────────────────────────────────────────

async function handleUpdate(records: (MappedRow & { existingId: number })[]) {
  let updated = 0;
  const errors: string[] = [];
  for (const rec of records) {
    try {
      const { cols, vals } = buildVals(rec.data);
      if (!cols.length) continue;
      // Preserve rep assignments unless explicitly set
      const fc: string[] = [];
      const fv: (string | null)[] = [];
      cols.forEach((c, i) => {
        if (
          (c === "assigned_rep_id" || c === "assignment_status") &&
          !rec.data[`_${c}`]
        )
          return;
        fc.push(c);
        fv.push(vals[i]);
      });
      if (!fc.length) continue;
      await db.query(
        `UPDATE hearings SET ${fc.map((c, i) => `${c}=$${i + 1}`).join(",")} WHERE id=$${fc.length + 1}`,
        [...fv, rec.existingId],
      );
      updated++;
    } catch (e: unknown) {
      errors.push(
        `Row ${rec.rowIndex + 2}: ${e instanceof Error ? e.message : "Error"}`,
      );
    }
  }
  if (updated > 0)
    await logAction("hearing_imported", `Updated ${updated} hearings`);
  return NextResponse.json({ updated, errors });
}

// ─── Update rescheduled ─────────────────────────────────────────────────────

async function handleUpdateRescheduled(
  records: (MappedRow & { originalId: number })[],
) {
  let count = 0;
  const errors: string[] = [];
  for (const rec of records) {
    try {
      const { cols, vals } = buildVals(rec.data);
      if (!cols.length) continue;
      await db.query(
        `UPDATE hearings SET ${cols.map((c, i) => `${c}=$${i + 1}`).join(",")} WHERE id=$${cols.length + 1}`,
        [...vals, rec.originalId],
      );
      count++;
    } catch (e: unknown) {
      errors.push(
        `Row ${rec.rowIndex + 2}: ${e instanceof Error ? e.message : "Error"}`,
      );
    }
  }
  if (count > 0)
    await logAction(
      "hearing_imported",
      `Updated ${count} rescheduled hearings`,
    );
  return NextResponse.json({ count, errors });
}

// ─── Delete not in sheet ────────────────────────────────────────────────────

async function handleDeleteNotInSheet(ids: number[]) {
  if (!ids.length) return NextResponse.json({ deleted: 0 });
  await db.query(
    `DELETE FROM hearings WHERE id IN (${ids.map((_, i) => `$${i + 1}`).join(",")})`,
    ids,
  );
  await logAction(
    "hearing_deleted",
    `Deleted ${ids.length} hearings not in sheet`,
  );
  return NextResponse.json({ deleted: ids.length });
}

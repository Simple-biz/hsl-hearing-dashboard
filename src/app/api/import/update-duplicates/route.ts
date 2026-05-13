import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAction } from "@/lib/activity-log";
import { syncRepDocsStatusForHearing } from "@/lib/rep-docs-decision-sync";

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

// Fields that the original import flow can update via column mapping
const UPDATABLE = new Set([
  "ssn_last_4",
  "claim_type",
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
  "medical_record_link",
  "claimant_link",
]);

// All fields that the compare-and-update flow is allowed to write
const COMPARE_UPDATABLE = new Set([
  // Basic hearing data
  "claimant",
  "ssn_last_4",
  "claim_type",
  "hearing_date",
  "hearing_time",
  "converted_time_est",
  "time_zone",
  "city",
  "state",
  "claimant_location",
  "representative_location",
  "alj",
  "medical_expert",
  "vocational_expert",
  "status_date",
  "entered_hearing_level_date",
  "download_type",
  // Assignment / status fields
  "manner_of_appearance",
  "hearing_decision_status",
  "assignment_status", // ← added
  "medical_record_status",
  "medical_record_link",
  "claimant_link",
  "rfc_status",
  "brief_assigned_to",
  "rep_docs_assigned_to",
  // Boolean fields
  "task_assigned",
  "rep_docs_complete",
  "fee_agreement_complete",
  "five_day_notice",
  "phi_sheet_complete",
  // Post HRG
  "post_hrg_deadline",
  "post_hrg_notes",
  "post_hrg_dev_status",
  "post_hrg_requirements",
]);

// Fields that need special value parsing
const BOOLEAN_FIELDS = new Set([
  "task_assigned",
  "rep_docs_complete",
  "fee_agreement_complete",
  "five_day_notice",
  "phi_sheet_complete",
  "post_hrg_review",
]);

const DATE_FIELDS = new Set([
  "hearing_date",
  "status_date",
  "entered_hearing_level_date",
  "post_hrg_deadline",
]);

function parseFieldValue(
  field: string,
  value: string,
): string | boolean | null {
  if (value === "" || value === null || value === undefined) return null;

  if (BOOLEAN_FIELDS.has(field)) {
    const lower = String(value).toLowerCase().trim();
    return ["true", "yes", "1", "✓", "y"].includes(lower);
  }

  if (DATE_FIELDS.has(field)) {
    return parseDate(value);
  }

  if (field === "ssn_last_4") {
    return formatSSN(value);
  }

  return String(value).trim();
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );

  const body = await req.json();
  const {
    records,
    mapping,
    hyperlinks = {},
    preserveExisting = false,
    selectedFields,
  } = body;

  if (!records || records.length === 0) {
    return NextResponse.json({
      success: false,
      message: "No records to update",
    });
  }

  // ── Detect mode: compare-and-update (has selectedFields) vs legacy import ──
  const isCompareMode =
    Array.isArray(selectedFields) && selectedFields.length > 0;

  // Fields that are "assignment" fields — these get preserved when preserveExisting is on (legacy mode only)
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

  // Pre-fetch lookups once if compare mode might need FK resolution.
  // Mirror the import-insert path: load all reps/teams (no is_active filter)
  // so legacy assignments still resolve.
  // Each rep also gets its `name_aliases` (TEXT[]) flattened into the lookup
  // so the sheet's shortened/married-name variants resolve to the right id
  // without admins having to rename the canonical record.
  let allReps: { id: number; name: string; aliases: string[] }[] = [];
  let allTeams: { id: number; team_name: string }[] = [];
  if (isCompareMode) {
    const sel = selectedFields as string[];
    if (sel.includes("representative")) {
      const { rows } = await db.query(
        "SELECT id, name, name_aliases FROM representatives",
      );
      allReps = rows.map((r) => ({
        id: r.id as number,
        name: String(r.name || ""),
        aliases: Array.isArray(r.name_aliases)
          ? (r.name_aliases as unknown[]).map((a) => String(a || ""))
          : [],
      }));
    }
    if (sel.includes("mr_team_id")) {
      const { rows } = await db.query(
        "SELECT id, team_name FROM mr_teams",
      );
      allTeams = rows;
    }
  }

  for (const record of records) {
    if (!record.existing_id) continue;

    try {
      if (isCompareMode) {
        // ── Compare-and-update mode ──
        // Use field_diffs to get new values, only for selectedFields
        const fieldDiffs = record.field_diffs as
          | Record<string, { old: string; new: string }>
          | undefined;
        if (!fieldDiffs || Object.keys(fieldDiffs).length === 0) continue;

        const updates: Record<string, unknown> = {};

        for (const field of selectedFields as string[]) {
          const diff = fieldDiffs[field];
          if (!diff) continue;

          // Representative: resolve name → assigned_rep_id FK.
          // Match against the canonical name first; if that misses, try each
          // rep's aliases (so "Alecia Reed" resolves to "Alecia Reed-Owens"
          // when the alias is on file). Bad/unknown names still no-op rather
          // than writing a bogus FK.
          if (field === "representative") {
            if (!diff.new) continue;
            const repName = diff.new.trim().toLowerCase();
            const match =
              allReps.find((r) => r.name.trim().toLowerCase() === repName) ||
              allReps.find((r) =>
                r.aliases.some((a) => a.trim().toLowerCase() === repName),
              );
            if (match) {
              updates["assigned_rep_id"] = match.id;
              updates["assignment_status"] = null; // clear any withdrawal/status
            }
            // If no match found, skip — don't write a bad FK
            continue;
          }

          // Medical team: resolve team name → mr_team_id FK
          if (field === "mr_team_id") {
            if (!diff.new) continue;
            const teamName = diff.new.trim().toLowerCase();
            const match = allTeams.find(
              (t) => t.team_name.trim().toLowerCase() === teamName,
            );
            if (match) {
              updates["mr_team_id"] = match.id;
            }
            continue;
          }

          // assignment_status and other direct-write fields
          if (!COMPARE_UPDATABLE.has(field)) continue;

          // ── Special case: post_hrg_notes must be stored as JSON array ──
          // The diff.new value is raw comment text from the sheet.
          // We need to append it to the existing notes array rather than
          // overwriting, so the dashboard's parseNotes() can render it correctly.
          if (field === "post_hrg_notes") {
            if (!diff.new || !diff.new.trim()) continue;

            const { rows: noteRows } = await db.query(
              "SELECT post_hrg_notes FROM hearings WHERE id = $1",
              [record.existing_id],
            );
            const rawExisting = noteRows[0]?.post_hrg_notes || "";

            let existingArr: { user: string; date: string; note: string }[] =
              [];
            try {
              const parsed = JSON.parse(rawExisting);
              if (Array.isArray(parsed)) existingArr = parsed;
            } catch {
              if (rawExisting.trim()) {
                existingArr = [
                  { user: "System", date: "", note: rawExisting.trim() },
                ];
              }
            }

            // Same normalization as check-duplicates to handle encoding mismatches
            const normalizeNote = (text: string): string =>
              text
                .replace(/\u00A0/g, " ")
                .replace(/\u00C2\u00A0/g, " ")
                .replace(/\u00C2/g, "")
                .replace(/Â/g, "")
                .replace(/[\u200B-\u200D\uFEFF]/g, "")
                .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
                .replace(/[\uD800-\uDFFF]/g, "")
                .replace(/ð[\x80-\xBF]{3}/g, "")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&nbsp;/g, " ")
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase();

            const existingNoteTexts = new Set(
              existingArr.map((n) => normalizeNote(n.note)),
            );

            const newLines = diff.new
              .split("\n")
              .map((l: string) => l.trim())
              .filter(Boolean);

            for (const line of newLines) {
              if (!existingNoteTexts.has(normalizeNote(line))) {
                existingArr.push({
                  user: "Import",
                  date: new Date().toISOString().split("T")[0],
                  note: line,
                });
                existingNoteTexts.add(normalizeNote(line));
              }
            }

            updates["post_hrg_notes"] = JSON.stringify(existingArr);
            continue;
          }

          const parsed = parseFieldValue(field, diff.new);
          // Allow setting to null (clearing a field) — only skip if parse returned null for non-empty input
          if (parsed === null && diff.new !== "" && diff.new !== null) continue;
          updates[field] = parsed;
        }

        const keys = Object.keys(updates);
        if (keys.length === 0) continue;

        const setClauses = keys.map((k, i) => `${k} = $${i + 1}`);
        const values = keys.map((k) => updates[k]);
        values.push(record.existing_id);

        await db.query(
          `UPDATE hearings SET ${setClauses.join(", ")} WHERE id = $${values.length}`,
          values,
        );

        // Mirror the dashboard's hearing_decision_status → rep_docs.overall_status
        // sync so import-compare changes (e.g. "Withdrawal - SGA") flow into the
        // Withdrawn modal automatically.
        if ("hearing_decision_status" in updates) {
          await syncRepDocsStatusForHearing(
            record.existing_id,
            updates.hearing_decision_status as string | null,
          );
        }

        updated++;
      } else {
        // ── Legacy import mode ──
        // Build updates from mapping + raw row data
        let existingRecord: Record<string, unknown> | null = null;
        if (preserveExisting) {
          const { rows: existRows } = await db.query(
            "SELECT * FROM hearings WHERE id = $1",
            [record.existing_id],
          );
          existingRecord = existRows[0] || null;
        }

        const row = record.data as string[];
        const updates: Record<string, unknown> = {};

        for (const [dbField, colIdx] of Object.entries(mapping) as [
          string,
          number,
        ][]) {
          if (colIdx === null || colIdx === undefined || colIdx < 0) continue;
          const rawValue = String(row[colIdx] ?? "").trim();
          if (!rawValue) continue;

          if (dbField === "medical_record_source") {
            const colLetter = String.fromCharCode(65 + colIdx);
            const cellRef = `${colLetter}${record.rowIndex + 2}`;
            if (hyperlinks[cellRef])
              updates.medical_record_link = hyperlinks[cellRef];
            continue;
          }

          if (!UPDATABLE.has(dbField)) continue;

          if (dbField === "ssn_last_4") updates[dbField] = formatSSN(rawValue);
          else if (
            dbField === "status_date" ||
            dbField === "entered_hearing_level_date"
          )
            updates[dbField] = parseDate(rawValue);
          else updates[dbField] = rawValue;
        }

        // Apply cross-sheet lookup overrides
        if (record.ssn) updates.ssn_last_4 = formatSSN(record.ssn);
        if (record.claimantLocation)
          updates.claimant_location = record.claimantLocation;
        if (record.repLocation)
          updates.representative_location = record.repLocation;
        if (record.downloadType) updates.download_type = record.downloadType;
        if (record.statusDate)
          updates.status_date = parseDate(record.statusDate);

        const keys = Object.keys(updates).filter((k) => {
          if (updates[k] === null || updates[k] === undefined) return false;
          if (preserveExisting && existingRecord && PROTECTED_FIELDS.has(k)) {
            const existing = existingRecord[k];
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
        if (keys.length === 0) continue;

        const setClauses = keys.map((k, i) => `${k} = $${i + 1}`);
        const values = keys.map((k) => updates[k]);
        values.push(record.existing_id);

        await db.query(
          `UPDATE hearings SET ${setClauses.join(", ")} WHERE id = $${values.length}`,
          values,
        );

        // Same sync as above — legacy-mode imports also need it.
        if ("hearing_decision_status" in updates) {
          await syncRepDocsStatusForHearing(
            record.existing_id,
            updates.hearing_decision_status as string | null,
          );
        }

        updated++;
      }
    } catch (e) {
      errors.push(`Row ${record.row}: ${(e as Error).message}`);
    }
  }

  if (updated > 0) {
    const action = isCompareMode ? "hearing_updated" : "hearing_updated";
    const detail = isCompareMode
      ? `Compare & Update: updated ${updated} hearings (fields: ${(selectedFields as string[]).join(", ")})`
      : `Updated ${updated} existing hearings from import`;
    await logAction(action, detail);
  }

  return NextResponse.json({ success: true, updated, errors });
}

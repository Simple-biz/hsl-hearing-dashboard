import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

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

// ─── POST /api/import/check-duplicates ──────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );

  const body = await req.json();
  const {
    mapping,
    rows,
    crossSheetLookups = {},
    rowOffset = 0,
    compare_mode = false,
  } = body;

  // Compare mode: return minimal claimant+date+ssn for all hearings
  if (compare_mode) {
    const { rows: allH } = await db.query(
      "SELECT claimant, hearing_date::text, ssn_last_4 FROM hearings",
    );
    return NextResponse.json({ success: true, all_hearings: allH });
  }

  if (!mapping || !rows || rows.length === 0) {
    return NextResponse.json({ success: false, message: "No data to check" });
  }

  // ── Pre-fetch all existing hearings into lookup maps (single query) ──
  const { rows: existing } = await db.query(
    `SELECT id, claimant, ssn_last_4, hearing_date::text, hearing_time, time_zone,
            claim_type, converted_time_est,
            city, state, claimant_location, representative_location, alj,
            medical_expert, vocational_expert, status_date::text,
            entered_hearing_level_date::text, download_type, manner_of_appearance,
            hearing_decision_status, medical_record_status, medical_record_link,
            rfc_status, claimant_link, assigned_rep_id, mr_team_id,
            brief_assigned_to, task_assigned, rep_docs_complete, fee_agreement_complete,
            phi_sheet_complete, five_day_notice, post_hrg_deadline::text, post_hrg_notes,
            rep_docs_assigned_to, post_hrg_review
     FROM hearings`,
  );

  // Full record lookup by id (for diff comparison on duplicates)
  const byId = new Map<number, Record<string, unknown>>();
  for (const row of existing) byId.set(row.id as number, row);

  // Build 3 lookup maps for three-tier matching
  const tier1 = new Map<string, number>(); // claimant|ssn|date → id
  const tier2 = new Map<string, number>(); // claimant|ssn → id
  const tier3 = new Map<string, number>(); // claimant|date → id

  for (const row of existing) {
    const c = (row.claimant || "").trim();
    const s = row.ssn_last_4 || "";
    const d = row.hearing_date || "";
    const id = row.id as number;

    if (c && s && d) tier1.set(`${c}|${s}|${d}`, id);
    if (c && s && !tier2.has(`${c}|${s}`)) tier2.set(`${c}|${s}`, id);
    if (c && d && !tier3.has(`${c}|${d}`)) tier3.set(`${c}|${d}`, id);
  }

  // Also build a lookup by claimant name + SSN (for rescheduled base-name matching)
  // Index both the exact name AND the base name (stripped of Rescheduled/SSN tags)
  const RESCHED_RE = /\s*\(Rescheduled(?:\s+\d+)?\)\s*$/i;
  const SSN_SUFFIX_RE = /\s*\(\d{4}\)\s*$/;

  const byNameAndSsn = new Map<
    string,
    { id: number; claimant: string; hearing_date: string }
  >();
  for (const row of existing) {
    const c = (row.claimant || "").trim();
    const s = row.ssn_last_4 || "";
    if (c && s) {
      const id = row.id as number;
      const entry = { id, claimant: c, hearing_date: row.hearing_date || "" };

      // Index by exact name
      const exactKey = `${c.toLowerCase()}|${s}`;
      const prev = byNameAndSsn.get(exactKey);
      if (!prev || id > prev.id) byNameAndSsn.set(exactKey, entry);

      // Also index by base name (strip Rescheduled and SSN suffix tags)
      // So "John Doe (Rescheduled 2)" → "john doe" and "Jane Doe (1234)" → "jane doe"
      const baseName = c
        .replace(RESCHED_RE, "")
        .replace(SSN_SUFFIX_RE, "")
        .trim();
      if (baseName.toLowerCase() !== c.toLowerCase()) {
        const baseKey = `${baseName.toLowerCase()}|${s}`;
        const basePrev = byNameAndSsn.get(baseKey);
        if (!basePrev || id > basePrev.id) byNameAndSsn.set(baseKey, entry);
      }
    }
  }

  // ── Process rows using in-memory lookups (zero DB queries per row) ──
  const newRecords: Record<string, unknown>[] = [];
  const duplicateRecords: Record<string, unknown>[] = [];
  const skippedRecords: Record<string, unknown>[] = [];
  const rescheduledRecords: Record<string, unknown>[] = [];
  const debugResched: Record<string, unknown>[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] as string[];

    const claimant =
      mapping.claimant !== undefined
        ? String(row[mapping.claimant] || "").trim()
        : "";
    const hearingDate =
      mapping.hearing_date !== undefined
        ? parseDate(String(row[mapping.hearing_date] || ""))
        : null;
    let ssn =
      mapping.ssn_last_4 !== undefined
        ? String(row[mapping.ssn_last_4] || "").trim()
        : "";
    const claimType =
      mapping.claim_type !== undefined
        ? String(row[mapping.claim_type] || "").trim()
        : "";
    let claimantLocation =
      mapping.claimant_location !== undefined
        ? String(row[mapping.claimant_location] || "").trim()
        : "";
    let repLocation =
      mapping.representative_location !== undefined
        ? String(row[mapping.representative_location] || "").trim()
        : "";
    let downloadType =
      mapping.download_type !== undefined
        ? String(row[mapping.download_type] || "").trim()
        : "";
    let statusDate =
      mapping.status_date !== undefined
        ? String(row[mapping.status_date] || "").trim()
        : "";

    const lookupData = crossSheetLookups[String(rowIndex)];
    if (lookupData) {
      if (!ssn && lookupData.ssn) ssn = lookupData.ssn;
      if (lookupData.claimantLocation)
        claimantLocation = lookupData.claimantLocation;
      if (lookupData.repLocation) repLocation = lookupData.repLocation;
      if (lookupData.downloadType) downloadType = lookupData.downloadType;
      if (lookupData.statusDate) statusDate = lookupData.statusDate;
    }

    if (
      !claimant ||
      claimant === "0" ||
      claimant === "1" ||
      claimant.toLowerCase() === "false" ||
      claimant.toLowerCase() === "true"
    ) {
      skippedRecords.push({
        row: rowOffset + rowIndex + 2,
        rowIndex: rowOffset + rowIndex,
        claimant: claimant || "(empty)",
        hearing_date: hearingDate,
        ssn: null,
        claim_type: claimType,
        claimantLocation,
        repLocation,
        downloadType,
        statusDate,
        reason: "Empty or invalid claimant",
      });
      continue;
    }

    if (!hearingDate) {
      skippedRecords.push({
        row: rowOffset + rowIndex + 2,
        rowIndex: rowOffset + rowIndex,
        claimant,
        hearing_date: null,
        ssn: null,
        claim_type: claimType,
        claimantLocation,
        repLocation,
        downloadType,
        statusDate,
        reason: "Missing hearing date",
      });
      continue;
    }

    const ssnFormatted = formatSSN(ssn);

    // ── Rescheduled detection ──
    if (RESCHED_RE.test(claimant)) {
      const baseName = claimant.replace(RESCHED_RE, "").trim();
      const debugEntry: Record<string, unknown> = {
        claimant,
        baseName,
        ssn_raw: ssn,
        ssnFormatted,
        hearingDate,
        hasLookup: !!crossSheetLookups[String(rowIndex)],
        lookupSsn: crossSheetLookups[String(rowIndex)]?.ssn || null,
      };

      if (!ssnFormatted) {
        debugEntry.reason = "No SSN formatted — skipping rescheduled check";
        debugResched.push(debugEntry);
        // Fall through to normal check
      } else {
        // Check if this EXACT rescheduled name + SSN + date already exists (true duplicate)
        // If name+SSN match but date is different → it's a NEW reschedule, not already imported
        const exactTier1Key = `${claimant}|${ssnFormatted}|${hearingDate}`;
        const alreadyImported = tier1.has(exactTier1Key);

        if (!alreadyImported) {
          // Find the record to update: first try exact name+SSN (update existing rescheduled),
          // then try base name+SSN (first-time reschedule of original)
          const exactKey = `${claimant.toLowerCase()}|${ssnFormatted}`;
          const origKey = `${baseName.toLowerCase()}|${ssnFormatted}`;
          const existing =
            byNameAndSsn.get(exactKey) || byNameAndSsn.get(origKey);

          if (existing) {
            rescheduledRecords.push({
              row: rowOffset + rowIndex + 2,
              rowIndex: rowOffset + rowIndex,
              claimant,
              hearing_date: hearingDate,
              ssn: ssnFormatted,
              claim_type: claimType,
              claimantLocation,
              repLocation,
              downloadType,
              statusDate,
              is_rescheduled: true,
              original_id: existing.id,
              base_name: baseName,
              original_claimant: existing.claimant,
              original_date: existing.hearing_date,
            });
            debugEntry.reason = "MATCHED as rescheduled";
            debugEntry.originalId = existing.id;
            debugResched.push(debugEntry);
            continue;
          } else {
            debugEntry.reason = "No original found in DB";
            debugEntry.exactKey = `${claimant.toLowerCase()}|${ssnFormatted}`;
            debugEntry.origKey = `${baseName.toLowerCase()}|${ssnFormatted}`;
            debugResched.push(debugEntry);
          }
        } else {
          debugEntry.reason = "Already imported (exact match exists)";
          debugResched.push(debugEntry);
        }
      }
      // If already imported or no original found, fall through to normal duplicate check
    }

    // ── Normal three-tier duplicate matching ──
    let existingId: number | null = null;

    if (ssnFormatted && hearingDate) {
      existingId =
        tier1.get(`${claimant}|${ssnFormatted}|${hearingDate}`) ?? null;
    }
    if (!existingId && ssnFormatted) {
      existingId = tier2.get(`${claimant}|${ssnFormatted}`) ?? null;
    }
    if (!existingId && hearingDate) {
      existingId = tier3.get(`${claimant}|${hearingDate}`) ?? null;
    }

    const record: Record<string, unknown> = {
      row: rowOffset + rowIndex + 2,
      rowIndex: rowOffset + rowIndex,
      claimant,
      hearing_date: hearingDate,
      ssn: ssnFormatted,
      claim_type: claimType,
      claimantLocation,
      repLocation,
      downloadType,
      statusDate,
      existing_id: existingId,
    };

    if (existingId) {
      // Diff: compare import values against existing DB record
      // We normalize the import value the SAME way the insert route transforms it,
      // then compare against what the DB actually has.
      const dbRec = byId.get(existingId);
      const changedFields: string[] = [];
      const fieldDiffs: Record<string, { old: string; new: string }> = {};
      if (dbRec) {
        const DATE_FIELDS = new Set([
          "hearing_date",
          "status_date",
          "entered_hearing_level_date",
          "post_hrg_deadline",
        ]);
        const TIME_FIELDS = new Set(["hearing_time", "converted_time_est"]);
        const BOOL_FIELDS = new Set([
          "phi_sheet_complete",
          "rep_docs_complete",
          "fee_agreement_complete",
          "five_day_notice",
          "task_assigned",
        ]);
        // Skip fields that map to different DB columns or need special lookup
        const SKIP_FIELDS = new Set([
          "representative",
          "medical_record_source",
          "claimant",
          "mr_team_id",
        ]);

        const normalizeTime = (t: string): string => {
          if (!t) return "";
          const s = t.trim();
          // "8:30 AM" → "08:30"
          const ap = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
          if (ap) {
            let h = parseInt(ap[1]);
            if (ap[3].toUpperCase() === "PM" && h !== 12) h += 12;
            if (ap[3].toUpperCase() === "AM" && h === 12) h = 0;
            return `${String(h).padStart(2, "0")}:${ap[2]}`;
          }
          // "08:30:00" → "08:30", "8:30" → "08:30"
          const hm = s.match(/^(\d{1,2}):(\d{2})/);
          if (hm) return `${hm[1].padStart(2, "0")}:${hm[2]}`;
          return s;
        };

        const normalizeBool = (v: unknown): string => {
          if (v === true || v === "true" || v === "t" || v === "1" || v === 1)
            return "T";
          if (typeof v === "string" && v.toLowerCase() === "yes") return "T";
          return "F";
        };

        for (const [field, colIdx] of Object.entries(mapping) as [
          string,
          number,
        ][]) {
          if (colIdx === null || colIdx === undefined || colIdx < 0) continue;
          if (SKIP_FIELDS.has(field)) continue;
          const importVal = String(row[colIdx] ?? "").trim();
          if (!importVal) continue; // empty import value = no change

          const dbRaw = dbRec[field];
          // If DB value is null/empty and import has a value → that's a real change
          const dbIsEmpty =
            dbRaw === null ||
            dbRaw === undefined ||
            String(dbRaw).trim() === "";

          if (dbIsEmpty) {
            // DB is empty, import has value — skip (not a real "change")
            continue;
          }

          let normImport: string;
          let normDb: string;

          if (DATE_FIELDS.has(field)) {
            normImport = parseDate(importVal) || "";
            normDb = parseDate(String(dbRaw)) || String(dbRaw).trim();
            if (!normImport) continue; // unparseable import date — skip
          } else if (TIME_FIELDS.has(field)) {
            normImport = normalizeTime(importVal);
            normDb = normalizeTime(String(dbRaw));
          } else if (field === "ssn_last_4") {
            normImport = importVal.replace(/\D/g, "").slice(-4);
            normDb = String(dbRaw).replace(/\D/g, "").slice(-4);
          } else if (BOOL_FIELDS.has(field)) {
            normImport = normalizeBool(importVal);
            normDb = normalizeBool(dbRaw);
          } else {
            // Plain string — normalize hidden XLSX chars (non-breaking spaces, zero-width, \r)
            normImport = importVal
              .replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF\r]+/g, " ")
              .trim();
            normDb = String(dbRaw)
              .replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF\r]+/g, " ")
              .trim();
          }

          if (normImport.toLowerCase() !== normDb.toLowerCase()) {
            changedFields.push(field);
            fieldDiffs[field] = { old: String(dbRaw).trim(), new: importVal };
          }
        }
      }
      record.changed_fields = changedFields;
      record.field_diffs = fieldDiffs;
      record.has_changes = changedFields.length > 0;
      duplicateRecords.push(record);
    } else {
      newRecords.push(record);
    }
  }

  // Build summary of which fields trigger changes most often
  const fieldChangeCounts: Record<string, number> = {};
  for (const rec of duplicateRecords) {
    const cf = rec.changed_fields as string[] | undefined;
    if (cf)
      for (const f of cf)
        fieldChangeCounts[f] = (fieldChangeCounts[f] || 0) + 1;
  }

  return NextResponse.json({
    success: true,
    total: rows.length,
    new_count: newRecords.length,
    duplicate_count: duplicateRecords.length,
    duplicates_with_changes: duplicateRecords.filter((r) => r.has_changes)
      .length,
    skipped_count: skippedRecords.length,
    rescheduled_count: rescheduledRecords.length,
    field_change_summary: fieldChangeCounts,
    new_records: newRecords,
    duplicate_records: duplicateRecords,
    skipped_records: skippedRecords,
    rescheduled_records: rescheduledRecords,
    debug_rescheduled: debugResched,
  });
}

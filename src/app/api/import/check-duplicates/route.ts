import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

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

// ─── POST /api/import/check-duplicates ──────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );

  const body = await req.json();
  const { mapping, rows, crossSheetLookups = {}, rowOffset = 0 } = body;

  if (!mapping || !rows || rows.length === 0) {
    return NextResponse.json({ success: false, message: "No data to check" });
  }

  // ── Pre-fetch all existing hearings into lookup maps (single query) ──
  // Replaces 3 queries per row → 1 query total for entire batch
  const { rows: existing } = await db.query(
    "SELECT id, claimant, ssn_last_4, hearing_date::text FROM hearings",
  );

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
        data: row,
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
        data: row,
        reason: "Missing hearing date",
      });
      continue;
    }

    const ssnFormatted = formatSSN(ssn);

    // ── Rescheduled detection ──
    // If claimant has "(Rescheduled)" or "(Rescheduled N)", find the original
    if (RESCHED_RE.test(claimant) && ssnFormatted) {
      const baseName = claimant.replace(RESCHED_RE, "").trim();

      // Check if this exact rescheduled name + SSN already exists (already imported before)
      const exactKey = `${claimant.toLowerCase()}|${ssnFormatted}`;
      const alreadyImported = byNameAndSsn.has(exactKey);

      if (!alreadyImported) {
        // Find original by base name + SSN
        const origKey = `${baseName.toLowerCase()}|${ssnFormatted}`;
        const original = byNameAndSsn.get(origKey);

        if (original) {
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
            data: row,
            is_rescheduled: true,
            original_id: original.id,
            base_name: baseName,
            original_claimant: original.claimant,
            original_date: original.hearing_date,
          });
          continue;
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

    const record = {
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
      data: row,
      existing_id: existingId,
    };

    if (existingId) duplicateRecords.push(record);
    else newRecords.push(record);
  }

  return NextResponse.json({
    success: true,
    total: rows.length,
    new_count: newRecords.length,
    duplicate_count: duplicateRecords.length,
    skipped_count: skippedRecords.length,
    rescheduled_count: rescheduledRecords.length,
    new_records: newRecords,
    duplicate_records: duplicateRecords,
    skipped_records: skippedRecords,
    rescheduled_records: rescheduledRecords,
  });
}

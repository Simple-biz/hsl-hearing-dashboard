"use server";

import { db } from "@/lib/db";
import { logAction } from "@/lib/activity-log";

export interface RepDocsImportResult {
  matched: number;
  skipped: number;
  notFound: number;
  errors: string[];
}

export interface RepDocsPreviewRow {
  lineNum: number;
  claimant: string;
  hearingDateRaw: string;
  hearingDate: string | null;
  status: "match" | "fuzzy" | "not_found" | "skipped";
  note?: string;
  hearingId?: number;
  matchedClaimant?: string;
  assignedTo: string | null;
  overallStatus: string | null;
  uploadedNoh: boolean;
  sentRepdocsToCl: boolean;
  repdocsSigned: boolean;
  contactLtr: boolean;
  repdocsSplit: boolean;
  repdocsUploadedChronicle: boolean;
  ohoConfirmation: boolean;
}

export interface RepDocsImportPreview {
  rows: RepDocsPreviewRow[];
  matched: number;
  fuzzy: number;
  notFound: number;
  skipped: number;
}

function parseBoolean(val: string): boolean {
  return val?.trim().toUpperCase() === "TRUE";
}

function parseTimestamp(val: string): string | null {
  if (!val?.trim()) return null;
  try {
    const d = new Date(val.trim());
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

function parseDate(val: string): string | null {
  if (!val?.trim()) return null;
  try {
    const d = new Date(val.trim());
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0];
  } catch {
    return null;
  }
}

function normalizeClaimant(name: string): string {
  return name
    .replace(/\s*\(Rescheduled[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

interface ParsedCsvRow {
  lineNum: number;
  cols: string[];
  hrgDateRaw: string;
  claimantRaw: string;
  assignedTo: string | null;
  overallStatus: string | null;
  hrgDate: string | null;
}

function parseCsvRows(csvText: string): ParsedCsvRow[] {
  const lines = csvText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Skip the first 2 header rows
  const dataLines = lines.slice(2);
  const out: ParsedCsvRow[] = [];

  dataLines.forEach((line, i) => {
    const cols = parseCSVLine(line);
    const hrgDateRaw = cols[1]?.trim() ?? "";
    const claimantRaw = cols[3]?.trim() ?? "";
    const assignedTo = cols[4]?.trim() || null;
    const overallStatus = cols[5]?.trim() || null;
    const hrgDate = parseDate(hrgDateRaw);
    out.push({
      lineNum: i + 3, // +3 because we sliced 2 header rows, 1-based
      cols,
      hrgDateRaw,
      claimantRaw,
      assignedTo,
      overallStatus,
      hrgDate,
    });
  });

  return out;
}

async function matchHearing(
  normalizedCsvClaimant: string,
  hrgDate: string,
): Promise<{ id: number; claimant: string; matchType: "match" | "fuzzy" } | null> {
  const { rows: hearingRows } = await db.query(
    `SELECT h.id, h.claimant
     FROM hearings h
     WHERE h.hearing_date = $1::date
       AND LOWER(REGEXP_REPLACE(h.claimant, '\\s*\\(Rescheduled[^)]*\\)', '', 'gi')) = $2
     ORDER BY h.id DESC
     LIMIT 1`,
    [hrgDate, normalizedCsvClaimant],
  );

  if (hearingRows.length > 0) {
    return {
      id: hearingRows[0].id,
      claimant: hearingRows[0].claimant,
      matchType: "match",
    };
  }

  const { rows: fuzzyRows } = await db.query(
    `SELECT h.id, h.claimant
     FROM hearings h
     WHERE LOWER(REGEXP_REPLACE(h.claimant, '\\s*\\(Rescheduled[^)]*\\)', '', 'gi')) = $1
       AND h.hearing_date >= $2::date - 7
       AND h.hearing_date <= $2::date + 7
     ORDER BY ABS(h.hearing_date - $2::date) ASC, h.id DESC
     LIMIT 1`,
    [normalizedCsvClaimant, hrgDate],
  );

  if (fuzzyRows.length > 0) {
    return {
      id: fuzzyRows[0].id,
      claimant: fuzzyRows[0].claimant,
      matchType: "fuzzy",
    };
  }

  return null;
}

export async function previewRepDocsImport(
  csvText: string,
): Promise<RepDocsImportPreview> {
  const { requireRole } = await import("@/lib/session");
  await requireRole(["system_admin"]);

  const parsed = parseCsvRows(csvText);
  const rows: RepDocsPreviewRow[] = [];
  let matched = 0;
  let fuzzy = 0;
  let notFound = 0;
  let skipped = 0;

  for (const p of parsed) {
    const base: RepDocsPreviewRow = {
      lineNum: p.lineNum,
      claimant: p.claimantRaw,
      hearingDateRaw: p.hrgDateRaw,
      hearingDate: p.hrgDate,
      status: "skipped",
      assignedTo: p.assignedTo,
      overallStatus: p.overallStatus,
      uploadedNoh: parseBoolean(p.cols[6]),
      sentRepdocsToCl: parseBoolean(p.cols[8]),
      repdocsSigned: parseBoolean(p.cols[10]),
      contactLtr: parseBoolean(p.cols[12]),
      repdocsSplit: parseBoolean(p.cols[14]),
      repdocsUploadedChronicle: parseBoolean(p.cols[16]),
      ohoConfirmation: parseBoolean(p.cols[18]),
    };

    if (!p.claimantRaw && !p.hrgDateRaw) {
      skipped++;
      base.note = "Empty row";
      rows.push(base);
      continue;
    }
    if (!p.claimantRaw || !p.hrgDateRaw) {
      skipped++;
      base.note = "Missing claimant or date";
      rows.push(base);
      continue;
    }
    if (!p.hrgDate) {
      skipped++;
      base.note = "Invalid date";
      rows.push(base);
      continue;
    }

    const normalized = normalizeClaimant(p.claimantRaw);
    const match = await matchHearing(normalized, p.hrgDate);

    if (!match) {
      notFound++;
      base.status = "not_found";
      base.note = "No matching hearing";
      rows.push(base);
      continue;
    }

    base.hearingId = match.id;
    base.matchedClaimant = match.claimant;
    if (match.matchType === "match") {
      matched++;
      base.status = "match";
    } else {
      fuzzy++;
      base.status = "fuzzy";
      base.note = "Matched within ±7 days";
    }
    rows.push(base);
  }

  return { rows, matched, fuzzy, notFound, skipped };
}

export async function importRepDocsFromCsv(
  csvText: string,
): Promise<RepDocsImportResult> {
  const { requireRole } = await import("@/lib/session");
  await requireRole(["system_admin"]);

  const parsed = parseCsvRows(csvText);

  let matched = 0;
  let skipped = 0;
  let notFound = 0;
  const errors: string[] = [];

  for (const p of parsed) {
    if (!p.claimantRaw || !p.hrgDateRaw || !p.hrgDate) {
      skipped++;
      continue;
    }

    const normalized = normalizeClaimant(p.claimantRaw);
    const match = await matchHearing(normalized, p.hrgDate);

    if (!match) {
      notFound++;
      if (errors.length < 50) {
        errors.push(`Not found: "${p.claimantRaw}" on ${p.hrgDate}`);
      }
      continue;
    }

    const hearingId = match.id;

    await db.query(
      `INSERT INTO representative_docs (hearing_id)
       VALUES ($1)
       ON CONFLICT (hearing_id) DO NOTHING`,
      [hearingId],
    );

    const { rows: rdRows } = await db.query(
      `SELECT id FROM representative_docs WHERE hearing_id = $1`,
      [hearingId],
    );
    if (rdRows.length === 0) {
      errors.push(`Failed to get rep docs row for hearing ${hearingId}`);
      continue;
    }
    const rdId = rdRows[0].id;

    const cols = p.cols;
    const uploadedNoh = parseBoolean(cols[6]);
    const uploadedNohAt = parseTimestamp(cols[7]);
    const sentRepdocsToCl = parseBoolean(cols[8]);
    const sentRepdocsToClAt = parseTimestamp(cols[9]);
    const repdocsSigned = parseBoolean(cols[10]);
    const repdocsSignedAt = parseTimestamp(cols[11]);
    const contactLtr = parseBoolean(cols[12]);
    const contactLtrAt = parseTimestamp(cols[13]);
    const repdocsSplit = parseBoolean(cols[14]);
    const repdocsSplitAt = parseTimestamp(cols[15]);
    const repdocsUploadedChronicle = parseBoolean(cols[16]);
    const repdocsUploadedChronicleAt = parseTimestamp(cols[17]);
    const ohoConfirmation = parseBoolean(cols[18]);
    const ohoConfirmationAt = parseTimestamp(cols[19]);
    const ohoAssignedTo = cols[20]?.trim() || null;
    const checkerCalendar = parseBoolean(cols[21]);
    const checkerChronicleClaim = parseBoolean(cols[22]);
    const checkerNoh = parseBoolean(cols[23]);
    const checkerContactLtr = parseBoolean(cols[24]);
    const checkerStatusRaw = cols[25]?.trim() || null;

    const assignedTo = p.assignedTo;
    const overallStatus = p.overallStatus;
    const isWithdrawn =
      assignedTo?.toUpperCase() === "WITHDRAWN" ||
      overallStatus?.toUpperCase() === "WITHDRAWN";
    const normalizedAssignedTo =
      assignedTo?.toUpperCase() === "WITHDRAWN" ? null : assignedTo;

    // Status is driven purely by the 7 workflow checkboxes — ignore the
    // overall-status column from the sheet. Withdrawn stays as an override.
    const flags = [
      uploadedNoh,
      sentRepdocsToCl,
      repdocsSigned,
      contactLtr,
      repdocsSplit,
      repdocsUploadedChronicle,
      ohoConfirmation,
    ];
    const truthy = flags.filter(Boolean).length;
    let computedStatus: string;
    if (isWithdrawn) computedStatus = "Withdrawn";
    else if (truthy === 0) computedStatus = "Not Started";
    else if (truthy === flags.length) computedStatus = "Complete";
    else computedStatus = "Incomplete";

    const validCheckerStatuses = [
      "Pending",
      "Reviewed",
      "Issues Found",
      "Complete",
    ];
    const normalizedCheckerStatus = validCheckerStatuses.includes(
      checkerStatusRaw ?? "",
    )
      ? checkerStatusRaw
      : null;

    await db.query(
      `UPDATE representative_docs SET
        assigned_to = $1,
        overall_status = $2,
        uploaded_noh = $3,
        uploaded_noh_at = $4,
        sent_repdocs_to_cl = $5,
        sent_repdocs_to_cl_at = $6,
        repdocs_signed = $7,
        repdocs_signed_at = $8,
        contact_ltr = $9,
        contact_ltr_at = $10,
        repdocs_split = $11,
        repdocs_split_at = $12,
        repdocs_uploaded_chronicle = $13,
        repdocs_uploaded_chronicle_at = $14,
        oho_confirmation = $15,
        oho_confirmation_at = $16,
        oho_assigned_to = $17,
        checker_calendar = $18,
        checker_chronicle_claim = $19,
        checker_noh = $20,
        checker_contact_ltr = $21,
        checker_status = $22,
        updated_at = NOW()
      WHERE id = $23`,
      [
        normalizedAssignedTo,
        computedStatus,
        uploadedNoh,
        uploadedNohAt,
        sentRepdocsToCl,
        sentRepdocsToClAt,
        repdocsSigned,
        repdocsSignedAt,
        contactLtr,
        contactLtrAt,
        repdocsSplit,
        repdocsSplitAt,
        repdocsUploadedChronicle,
        repdocsUploadedChronicleAt,
        ohoConfirmation,
        ohoConfirmationAt,
        ohoAssignedTo,
        checkerCalendar,
        checkerChronicleClaim,
        checkerNoh,
        checkerContactLtr,
        normalizedCheckerStatus,
        rdId,
      ],
    );

    matched++;
  }

  if (matched > 0) {
    await logAction(
      "rep_docs_imported",
      `Imported rep docs: ${matched} matched, ${notFound} not found, ${skipped} skipped`,
    );
  }

  return { matched, skipped, notFound, errors };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

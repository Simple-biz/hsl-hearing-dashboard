import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAction } from "@/lib/activity-log";

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
      message: "No records to update",
    });
  }

  let updated = 0;
  const errors: string[] = [];

  for (const record of records) {
    if (!record.existing_id) continue;

    try {
      const row = record.data as string[];
      const updates: Record<string, unknown> = {};

      for (const [dbField, colIdx] of Object.entries(mapping) as [
        string,
        number,
      ][]) {
        if (colIdx === null || colIdx === undefined || colIdx < 0) continue;
        const rawValue = String(row[colIdx] ?? "").trim();
        if (!rawValue) continue; // Only update fields that have values

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
      if (record.statusDate) updates.status_date = parseDate(record.statusDate);

      const keys = Object.keys(updates).filter(
        (k) => updates[k] !== null && updates[k] !== undefined,
      );
      if (keys.length === 0) continue;

      const setClauses = keys.map((k, i) => `${k} = $${i + 1}`);
      const values = keys.map((k) => updates[k]);
      values.push(record.existing_id);

      await db.query(
        `UPDATE hearings SET ${setClauses.join(", ")} WHERE id = $${values.length}`,
        values,
      );
      updated++;
    } catch (e) {
      errors.push(`Row ${record.row}: ${(e as Error).message}`);
    }
  }

  if (updated > 0) {
    await logAction(
      "hearing_updated",
      `Updated ${updated} existing hearings from import`,
    );
  }

  return NextResponse.json({ success: true, updated, errors });
}

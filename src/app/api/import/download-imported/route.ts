import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import * as XLSX from "xlsx";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );

  const body = await req.json();
  const { ids } = body;

  if (!ids || ids.length === 0) {
    return NextResponse.json(
      { success: false, message: "No IDs provided" },
      { status: 400 },
    );
  }

  // Fetch imported records
  const placeholders = ids
    .map((_: number, i: number) => `$${i + 1}`)
    .join(", ");
  const { rows } = await db.query(
    `SELECT h.*, r.name as rep_name, t.team_name as mr_team_name
     FROM hearings h
     LEFT JOIN representatives r ON h.assigned_rep_id = r.id
     LEFT JOIN mr_teams t ON h.mr_team_id = t.id
     WHERE h.id IN (${placeholders})
     ORDER BY h.hearing_date, h.claimant`,
    ids,
  );

  // Build spreadsheet
  const headers = [
    "Claimant",
    "SSN (Last 4)",
    "Claim Type",
    "Hearing Date",
    "Hearing Time",
    "Time Zone",
    "EST Time",
    "City",
    "State",
    "Claimant Location",
    "Rep Location",
    "ALJ",
    "Medical Expert",
    "Vocational Expert",
    "Representative",
    "Decision",
    "MOA",
    "Download Type",
    "Status Date",
    "MR Status",
    "MR Team",
    "MR Worksheet",
    "RFC",
    "5-Day",
    "Task",
    "Rep Docs",
    "Fee Agmt",
    "PHI",
    "Brief",
    "Post HRG Deadline",
    "Post HRG Notes",
    "Claimant Link",
  ];

  const data = rows.map((r: Record<string, unknown>) => [
    r.claimant,
    r.ssn_last_4,
    r.claim_type,
    r.hearing_date,
    r.hearing_time,
    r.time_zone,
    r.converted_time_est,
    r.city,
    r.state,
    r.claimant_location,
    r.representative_location,
    r.alj,
    r.medical_expert,
    r.vocational_expert,
    r.rep_name,
    r.hearing_decision_status,
    r.manner_of_appearance,
    r.download_type,
    r.status_date,
    r.medical_record_status,
    r.mr_team_name,
    r.medical_record_link,
    r.rfc_status,
    r.five_day_notice ? "Yes" : "No",
    r.task_assigned ? "Yes" : "No",
    r.rep_docs_complete ? "Yes" : "No",
    r.fee_agreement_complete ? "Yes" : "No",
    r.phi_sheet_complete ? "Yes" : "No",
    r.brief_assigned_to,
    r.post_hrg_deadline,
    r.post_hrg_notes,
    r.claimant_link,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Imported Hearings");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="imported_hearings.xlsx"`,
    },
  });
}

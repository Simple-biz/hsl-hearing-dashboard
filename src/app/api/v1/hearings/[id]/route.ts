// GET /api/v1/hearings/:id — fetch one hearing.
//
// Same column subset as the list endpoint. 404 when no row matches the id.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-keys";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiKey(req);
  if (auth instanceof Response) return auth;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json(
      {
        error: {
          code: "bad_request",
          message: "Hearing id must be a positive integer.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const { rows } = await db.query(
      `SELECT h.id, h.claimant, h.ssn_last_4, h.claim_type,
              h.hearing_date::text, h.hearing_time::text, h.time_zone,
              h.converted_time_est::text,
              h.city, h.state, h.alj, h.manner_of_appearance,
              h.hearing_decision_status,
              NULLIF(h.assignment_status::text, '') AS assignment_status,
              h.assigned_rep_id, r.name AS rep_name,
              h.mr_team_id, t.team_name AS mr_team_name,
              h.medical_record_status, h.medical_record_link,
              h.claimant_link, h.chronicle_link,
              h.task_assigned, h.task_assigned_at::text,
              h.rep_docs_complete, h.rep_docs_complete_at::text,
              h.rep_docs_assigned_to,
              h.fee_agreement_complete, h.fee_agreement_complete_at::text,
              h.five_day_notice, h.five_day_notice_at::text,
              h.phi_sheet_complete, h.phi_sheet_complete_at::text,
              h.post_hrg_review, h.post_hrg_deadline::text,
              h.post_hrg_dev_status,
              h.post_hrg_report, h.post_hrg_report_at::text
         FROM hearings h
         LEFT JOIN representatives r ON r.id = h.assigned_rep_id
         LEFT JOIN mr_teams t        ON t.id = h.mr_team_id
        WHERE h.id = $1
        LIMIT 1`,
      [id],
    );
    if (rows.length === 0) {
      return Response.json(
        {
          error: { code: "not_found", message: `Hearing ${id} not found.` },
        },
        { status: 404 },
      );
    }
    return Response.json({ data: rows[0] });
  } catch (e) {
    console.error("/api/v1/hearings/[id] query failed", e);
    return Response.json(
      {
        error: { code: "internal_error", message: "Failed to fetch hearing." },
      },
      { status: 500 },
    );
  }
}

// GET /api/v1/hearings — list hearings (read-only).
//
// Public REST endpoint consumed by sister projects. Auth via API key
// (X-API-Key header or Authorization: Bearer). Returns a stable subset of
// hearing columns — internal-only fields (deadline_prev, download_type,
// editor-state booleans) are intentionally excluded so the public contract
// stays small and easy to evolve.
//
// Query parameters:
//   from_date     ISO date    Lower bound on hearing_date (inclusive)
//   to_date       ISO date    Upper bound on hearing_date (inclusive)
//   rep_id        integer     Filter by assigned representative
//   status        string      Filter on hearing_decision_status (exact)
//   search        string      Case-insensitive claimant substring match
//   page          integer     1-based page number; default 1
//   per_page      integer     Page size; default 50, max 200
//
// Response shape:
//   { data: Hearing[], pagination: { page, per_page, total, total_pages } }
// Error shape:
//   { error: { code, message } }

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-keys";

const MAX_PER_PAGE = 200;
const DEFAULT_PER_PAGE = 50;

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth instanceof Response) return auth;

  const sp = req.nextUrl.searchParams;
  const fromDate = sp.get("from_date");
  const toDate = sp.get("to_date");
  const repId = sp.get("rep_id");
  const status = sp.get("status");
  const search = sp.get("search");
  const ssnLast4 = sp.get("ssn_last_4");

  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const perPageRaw =
    parseInt(sp.get("per_page") ?? String(DEFAULT_PER_PAGE), 10) ||
    DEFAULT_PER_PAGE;
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, perPageRaw));
  const offset = (page - 1) * perPage;

  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    where.push(clause.replace(/\$\?/g, `$${params.length}`));
  };

  if (fromDate) add(`h.hearing_date >= $?::date`, fromDate);
  if (toDate) add(`h.hearing_date <= $?::date`, toDate);
  if (repId) add(`h.assigned_rep_id = $?::int`, parseInt(repId, 10));
  if (status) add(`h.hearing_decision_status = $?`, status);
  if (search) add(`h.claimant ILIKE $?`, `%${search}%`);
  if (ssnLast4) add(`h.ssn_last_4 = $?`, ssnLast4);

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  let total = 0;
  let rows: unknown[] = [];
  try {
    const countRes = await db.query(
      `SELECT COUNT(*)::int AS n FROM hearings h ${whereClause}`,
      params,
    );
    total = countRes.rows[0]?.n ?? 0;

    const dataParams = [...params, perPage, offset];
    const dataRes = await db.query(
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
         ${whereClause}
         ORDER BY h.hearing_date DESC NULLS LAST, h.id DESC
         LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams,
    );
    rows = dataRes.rows;
  } catch (e) {
    console.error("/api/v1/hearings query failed", e);
    return Response.json(
      {
        error: {
          code: "internal_error",
          message: "Failed to fetch hearings.",
        },
      },
      { status: 500 },
    );
  }

  return Response.json({
    data: rows,
    pagination: {
      page,
      per_page: perPage,
      total,
      total_pages: Math.max(1, Math.ceil(total / perPage)),
    },
  });
}

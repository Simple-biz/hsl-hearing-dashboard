"use server";

import { db } from "@/lib/db";

export interface RescheduledHistoryRow {
  id: number;
  hearing_id: number;
  original_claimant: string;
  original_hearing_date: string | null;
  new_claimant: string;
  new_hearing_date: string | null;
  previous_rep_id: number | null;
  previous_rep_name: string | null;
  previous_decision: string | null;
  previous_mr_team: string | null;
  previous_brief: string | null;
  previous_mr_status: string | null;
  previous_alj: string | null;
  previous_assignment_status: string | null;
  rescheduled_at: string;
  rescheduled_by: string | null;
}

export async function fetchRescheduledHistory(params: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  records: RescheduledHistoryRow[];
  total: number;
  totalPages: number;
}> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 50);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = ["1=1"];
  const values: unknown[] = [];
  let p = 0;

  if (params.search?.trim()) {
    p += 1;
    conditions.push(
      `(rh.original_claimant ILIKE $${p} OR rh.new_claimant ILIKE $${p} OR rh.previous_rep_name ILIKE $${p})`,
    );
    values.push(`%${params.search.trim()}%`);
  }

  const where = conditions.join(" AND ");

  const [countRes, dataRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total FROM rescheduled_history rh WHERE ${where}`,
      values,
    ),
    db.query(
      `SELECT rh.id, rh.hearing_id, rh.original_claimant, rh.original_hearing_date::text,
              rh.new_claimant, rh.new_hearing_date::text,
              rh.previous_rep_id, rh.previous_rep_name, rh.previous_decision,
              rh.previous_mr_team, rh.previous_brief, rh.previous_mr_status,
              rh.previous_alj, rh.previous_assignment_status,
              rh.rescheduled_at::text, rh.rescheduled_by
       FROM rescheduled_history rh
       WHERE ${where}
       ORDER BY rh.rescheduled_at DESC, rh.id DESC
       LIMIT $${p + 1} OFFSET $${p + 2}`,
      [...values, pageSize, offset],
    ),
  ]);

  const total = countRes.rows[0]?.total ?? 0;

  return {
    records: dataRes.rows as RescheduledHistoryRow[],
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

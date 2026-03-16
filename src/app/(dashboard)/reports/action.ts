"use server";

import { db } from "@/lib/db";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface MonthlyTrend {
  month: string;
  count: number;
  favorable: number;
  unfavorable: number;
}

export interface HearingStatus {
  status: string;
  count: number;
  color: string;
}

export interface AssignedRep {
  name: string;
  hearings: number;
}

export interface RepStatusRow {
  rep: string;
  Continued: number;
  Dismissal: number;
  Favorable: number;
  "Good Cause": number;
  OTR: number;
  Pending: number;
  "Post HRG": number;
  Scheduled: number;
  Unfavorable: number;
  Withdrawal: number;
  Total: number;
}

/** Renamed from StatCard to avoid collision with the StatCard UI component. */
export interface StatCardData {
  label: string;
  value: string;
  bg: string;
}

export interface ReportsFilters {
  /** Preset date range bucket */
  quickSelect?: "All Time" | "Last 30 Days" | "Last 90 Days" | "This Year" | "";
  /** Single month string matching MonthlyTrend.month, e.g. "Jan '25" */
  month?: string;
  /** Rep name matching AssignedRep.name */
  rep?: string;
}

export interface ReportsData {
  monthly: MonthlyTrend[];
  hearingStatus: HearingStatus[];
  assignedReps: AssignedRep[];
  repStatusRows: RepStatusRow[];
  statCards: StatCardData[];
  /** Total withdrawal hearing count — used in the Assigned Cases modal withdrawal row */
  withdrawalTotal: number;
  /** All unique month labels across the full dataset — used to populate the Month filter */
  allMonths: string[];
  /** All rep names across the full dataset — used to populate the Rep filter */
  allReps: string[];
}

// ─── Color map for hearing decision statuses (UI-only, not stored in DB) ──────

const STATUS_COLORS: Record<string, string> = {
  "Continued": "#3b82f6",
  "Dismissal": "#ec4899",
  "Favorable": "#22c55e",
  "Good Cause Ltr": "#14b8a6",
  "OTR at Hrg": "#a3e635",
  "Pending Decision": "#facc15",
  "Post HRG Review": "#f97316",
  "Scheduled": "#7c3aed",
  "Unfavorable": "#ef4444",
  "WD Clmt Deceased": "#64748b",
  "Withdrawal": "#9ca3af",
};

// ─── Filter helpers ───────────────────────────────────────────────────────────

/**
 * Resolves the rep name filter to a rep ID.
 * Returns null if no rep filter is active or the name isn't found.
 */
async function resolveRepId(repName?: string): Promise<number | null> {
  if (!repName) return null;
  const { rows } = await db.query(
    "SELECT id FROM representatives WHERE name = $1 AND is_active = true LIMIT 1",
    [repName],
  );
  return rows.length > 0 ? (rows[0].id as number) : null;
}

/**
 * Converts a quickSelect preset to a SQL date condition fragment + params.
 * Returns an object with the WHERE clause snippet and any bound values.
 */
function quickSelectToDateRange(
  quickSelect: ReportsFilters["quickSelect"],
): { clause: string; params: unknown[] } {
  switch (quickSelect) {
    case "Last 30 Days":
      return { clause: `AND h.hearing_date >= CURRENT_DATE - INTERVAL '30 days'`, params: [] };
    case "Last 90 Days":
      return { clause: `AND h.hearing_date >= CURRENT_DATE - INTERVAL '90 days'`, params: [] };
    case "This Year":
      return { clause: `AND EXTRACT(YEAR FROM h.hearing_date) = EXTRACT(YEAR FROM CURRENT_DATE)`, params: [] };
    default:
      return { clause: "", params: [] };
  }
}

/**
 * Converts a month label like "Jan '25" to a SQL date range condition.
 * Returns an object with the WHERE clause snippet and bound values.
 */
function monthLabelToDateRange(
  month: string | undefined,
  startIdx: number,
): { clause: string; params: unknown[] } {
  if (!month) return { clause: "", params: [] };
  // Parse "Jan '25" → first/last day of that calendar month
  const match = month.match(/^(\w{3})\s+'(\d{2})$/);
  if (!match) return { clause: "", params: [] };
  const MONTH_NUM: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04",
    May: "05", Jun: "06", Jul: "07", Aug: "08",
    Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const [, abbr, yr] = match;
  const mm = MONTH_NUM[abbr] ?? "01";
  const fullYear = `20${yr}`;
  const firstDay = `${fullYear}-${mm}-01`;
  return {
    clause: `AND h.hearing_date >= $${startIdx}::date AND h.hearing_date < ($${startIdx}::date + INTERVAL '1 month')`,
    params: [firstDay],
  };
}

// ─── DB fetch helpers ─────────────────────────────────────────────────────────

async function fetchAllMonthly(
  repId: number | null,
  qs: ReportsFilters["quickSelect"],
): Promise<MonthlyTrend[]> {
  const conditions: string[] = ["h.hearing_date IS NOT NULL"];
  const params: unknown[] = [];
  let idx = 1;

  if (repId !== null) {
    conditions.push(`h.assigned_rep_id = $${idx}`);
    params.push(repId);
    idx++;
  }

  const { clause: qsClause, params: qsParams } = quickSelectToDateRange(qs);
  if (qsClause) {
    conditions.push(qsClause.replace(/^AND /, ""));
    params.push(...qsParams);
    idx += qsParams.length;
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const { rows } = await db.query(
    `SELECT
       TO_CHAR(h.hearing_date, 'Mon ''YY') AS month,
       COUNT(*)::int AS count,
       COUNT(*) FILTER (WHERE h.hearing_decision_status = 'Favorable')::int AS favorable,
       COUNT(*) FILTER (WHERE h.hearing_decision_status = 'Unfavorable')::int AS unfavorable
     FROM hearings h
     ${where}
     GROUP BY TO_CHAR(h.hearing_date, 'Mon ''YY'), DATE_TRUNC('month', h.hearing_date)
     ORDER BY DATE_TRUNC('month', h.hearing_date)`,
    params,
  );
  return rows as MonthlyTrend[];
}

async function fetchAllHearingStatuses(
  repId: number | null,
  qs: ReportsFilters["quickSelect"],
): Promise<HearingStatus[]> {
  const conditions: string[] = [
    "h.hearing_decision_status IS NOT NULL",
    "h.hearing_decision_status != ''",
  ];
  const params: unknown[] = [];
  let idx = 1;

  if (repId !== null) {
    conditions.push(`h.assigned_rep_id = $${idx}`);
    params.push(repId);
    idx++;
  }

  const { clause: qsClause, params: qsParams } = quickSelectToDateRange(qs);
  if (qsClause) {
    conditions.push(qsClause.replace(/^AND /, ""));
    params.push(...qsParams);
  }

  const { rows } = await db.query(
    `SELECT
       h.hearing_decision_status AS status,
       COUNT(*)::int AS count
     FROM hearings h
     WHERE ${conditions.join(" AND ")}
     GROUP BY h.hearing_decision_status
     ORDER BY count DESC`,
    params,
  );

  return (rows as { status: string; count: number }[]).map((r) => ({
    status: r.status,
    count:  r.count,
    color:  STATUS_COLORS[r.status] ?? "#94a3b8",
  }));
}

async function fetchAllAssignedReps(
  qs: ReportsFilters["quickSelect"],
): Promise<AssignedRep[]> {
  const conditions: string[] = ["r.is_active = true"];
  const params: unknown[] = [];

  const { clause: qsClause, params: qsParams } = quickSelectToDateRange(qs);
  if (qsClause) {
    conditions.push(qsClause.replace(/^AND h\./, "h.").replace(/^AND /, ""));
    params.push(...qsParams);
  }

  const { rows } = await db.query(
    `SELECT r.name, COUNT(h.id)::int AS hearings
     FROM representatives r
     JOIN hearings h ON h.assigned_rep_id = r.id
     WHERE ${conditions.join(" AND ")}
     GROUP BY r.id, r.name
     HAVING COUNT(h.id) > 0
     ORDER BY r.name`,
    params,
  );
  return rows as AssignedRep[];
}

async function fetchAllRepStatusRows(
  repId: number | null,
  qs: ReportsFilters["quickSelect"],
): Promise<RepStatusRow[]> {
  const conditions: string[] = ["r.is_active = true"];
  const params: unknown[] = [];
  let idx = 1;

  if (repId !== null) {
    conditions.push(`r.id = $${idx}`);
    params.push(repId);
    idx++;
  }

  const { clause: qsClause, params: qsParams } = quickSelectToDateRange(qs);
  if (qsClause) {
    conditions.push(qsClause.replace(/^AND h\./, "h.").replace(/^AND /, ""));
    params.push(...qsParams);
  }

  const { rows } = await db.query(
    `SELECT
       r.name AS rep,
       COUNT(*) FILTER (WHERE h.hearing_decision_status = 'Continued')::int AS "Continued",
       COUNT(*) FILTER (WHERE h.hearing_decision_status = 'Dismissal')::int AS "Dismissal",
       COUNT(*) FILTER (WHERE h.hearing_decision_status = 'Favorable')::int AS "Favorable",
       COUNT(*) FILTER (WHERE h.hearing_decision_status = 'Good Cause Ltr')::int AS "Good Cause",
       COUNT(*) FILTER (WHERE h.hearing_decision_status = 'OTR at Hrg')::int AS "OTR",
       COUNT(*) FILTER (WHERE h.hearing_decision_status = 'Pending Decision')::int AS "Pending",
       COUNT(*) FILTER (WHERE h.hearing_decision_status = 'Post HRG Review')::int AS "Post HRG",
       COUNT(*) FILTER (WHERE h.hearing_decision_status = 'Scheduled')::int AS "Scheduled",
       COUNT(*) FILTER (WHERE h.hearing_decision_status = 'Unfavorable')::int AS "Unfavorable",
       COUNT(*) FILTER (WHERE h.hearing_decision_status = 'Withdrawal'
                           OR h.hearing_decision_status = 'WD Clmt Deceased')::int AS "Withdrawal",
       COUNT(*)::int AS "Total"
     FROM representatives r
     JOIN hearings h ON h.assigned_rep_id = r.id
     WHERE ${conditions.join(" AND ")}
     GROUP BY r.id, r.name
     HAVING COUNT(h.id) > 0
     ORDER BY r.name`,
    params,
  );
  return rows as RepStatusRow[];
}

async function fetchStatCards(
  repId: number | null,
  qs: ReportsFilters["quickSelect"],
): Promise<StatCardData[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (repId !== null) {
    conditions.push(`assigned_rep_id = $${idx}`);
    params.push(repId);
    idx++;
  }

  const { clause: qsClause, params: qsParams } = quickSelectToDateRange(qs);
  if (qsClause) {
    conditions.push(qsClause.replace(/^AND h\./, "").replace(/^AND /, ""));
    params.push(...qsParams);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE assigned_rep_id IS NOT NULL)::int AS assigned,
       COUNT(*) FILTER (WHERE assigned_rep_id IS NULL
                          AND (assignment_status IS NULL OR assignment_status = ''))::int AS unassigned,
       COUNT(*) FILTER (WHERE hearing_decision_status = 'Favorable')::int AS favorable,
       COUNT(*) FILTER (WHERE hearing_decision_status = 'Unfavorable')::int AS unfavorable,
       COUNT(*) FILTER (WHERE hearing_decision_status = 'Scheduled')::int AS scheduled,
       COUNT(*) FILTER (WHERE hearing_decision_status = 'Pending Decision')::int AS pending
     FROM hearings ${where}`,
    params,
  );

  const s = rows[0] as {
    total: number; assigned: number; unassigned: number;
    favorable: number; unfavorable: number; scheduled: number; pending: number;
  };

  return [
    { label: "Total Hearings", value: s.total.toLocaleString(), bg: "bg-violet-600"  },
    { label: "Assigned", value: s.assigned.toLocaleString(), bg: "bg-emerald-500" },
    { label: "Unassigned", value: s.unassigned.toLocaleString(), bg: "bg-pink-500" },
    { label: "Favorable", value: s.favorable.toLocaleString(), bg: "bg-lime-500"},
    { label: "Unfavorable", value: s.unfavorable.toLocaleString(), bg: "bg-red-500" },
    { label: "Scheduled", value: s.scheduled.toLocaleString(), bg: "bg-cyan-500" },
    { label: "Pending", value: s.pending.toLocaleString(), bg: "bg-amber-400" },
  ];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getReportsData(
  filters: ReportsFilters = {}
): Promise<ReportsData> {
  // Resolve rep name → ID once; all queries reuse the same ID.
  const repId = await resolveRepId(filters.rep);
  const qs    = filters.quickSelect;

  // Fetch unfiltered option lists in parallel with filtered data.
  // allMonths and allReps are always the full set so dropdowns don't shrink.
  const [
    monthly,
    hearingStatus,
    assignedReps,
    repStatusRows,
    statCards,
    allRepsRows,
    allMonthsRows,
  ] = await Promise.all([
    fetchAllMonthly(repId, qs),
    fetchAllHearingStatuses(repId, qs),
    fetchAllAssignedReps(qs),
    fetchAllRepStatusRows(repId, qs),
    fetchStatCards(repId, qs),
    // Full unfiltered rep list for the dropdown
    db.query(
      "SELECT name FROM representatives WHERE is_active = true ORDER BY name",
    ),
    // Full unfiltered month list for the dropdown
    db.query(
      `SELECT DISTINCT TO_CHAR(hearing_date, 'Mon ''YY') AS month,
              DATE_TRUNC('month', hearing_date) AS sort_key
       FROM hearings
       WHERE hearing_date IS NOT NULL
       ORDER BY sort_key`,
    ),
  ]);

  // Apply month filter in-memory after fetching (month is already pushed to SQL
  // for the trend chart query; the other queries use repId/qs only).
  // When all filters are pushed to SQL, remove this block.
  const { clause: mClause } = monthLabelToDateRange(filters.month, 1);
  const filteredMonthly = filters.month && !mClause
    ? monthly.filter((m) => m.month === filters.month)
    : monthly;

  // Derive withdrawalTotal from hearingStatus — sum all withdrawal-type statuses
  const WITHDRAWAL_STATUSES = [
    "Withdrawal", "WD Clmt Deceased", "Withdrawal - No Contact",
    "Withdrawal - UFD", "Withdrawal - Client Terminated Rep",
    "Withdrawal - Client Working/ Doing Better/WD Hrg Req",
    "Withdrawal - In-Person", "Withdrawal - Receiving Benefits",
    "Withdrawal - SGA", "Withdrawal - Misc",
  ];
  const withdrawalTotal = hearingStatus
    .filter((s) => WITHDRAWAL_STATUSES.includes(s.status) || s.status.startsWith("Withdrawal"))
    .reduce((sum, s) => sum + s.count, 0);

  return {
    monthly:      filteredMonthly,
    hearingStatus,
    assignedReps,
    repStatusRows,
    statCards,
    withdrawalTotal,
    allMonths: allMonthsRows.rows.map((r) => r.month as string),
    allReps:   allRepsRows.rows.map((r)   => r.name  as string),
  };
}

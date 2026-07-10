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
  /** Preset date range bucket. "Specific Date" / "Custom Range" pair with the
   *  `specificDate` / `dateFrom`+`dateTo` fields respectively. */
  quickSelect?:
    | "All Time"
    | "Last 30 Days"
    | "Last 90 Days"
    | "This Year"
    | "Specific Date"
    | "Custom Range"
    | "";
  /** Month abbreviation: "Jan" | "Feb" | ... | "Dec" or "". Independent of
   *  year, so "Jan" alone filters every January in the dataset. */
  month?: string;
  /** 4-digit year as string: "2024" | "2025" | ... or "". Independent of
   *  month, so "2025" alone filters all months in 2025. */
  year?: string;
  /** ISO YYYY-MM-DD — only meaningful when quickSelect = "Specific Date". */
  specificDate?: string;
  /** ISO YYYY-MM-DD — only meaningful when quickSelect = "Custom Range". */
  dateFrom?: string;
  dateTo?: string;
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
  /** All distinct years present in the dataset, descending — populates the Year filter */
  allYears: string[];
  /** All rep names across the full dataset — used to populate the Rep filter */
  allReps: string[];
}

/** Subset of ReportsFilters that drives the SQL date constraint. Passed as one
 *  bundle so the per-fetcher signatures don't grow with each new date control. */
type DateFilterInput = {
  qs: ReportsFilters["quickSelect"];
  month: string | undefined;
  year: string | undefined;
  specificDate: string | undefined;
  dateFrom: string | undefined;
  dateTo: string | undefined;
};

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
 * Builds the combined date-range WHERE fragments for every date-style filter:
 *  - quickSelect presets (Last 30 / 90, This Year)
 *  - quickSelect = "Specific Date" → bound `specificDate`
 *  - quickSelect = "Custom Range"  → bound `dateFrom` / `dateTo`
 *  - independent `month` name (Jan…Dec) and/or `year` (4-digit)
 *
 * All clauses are AND'd by the caller. Numeric month / year are inlined as
 * SQL literals after validation — no params consumed for those. Pass
 * `prefix=""` when the query has no alias on hearings (e.g. fetchStatCards
 * uses `FROM hearings` without `h`).
 */
function buildDateRangeFilter(
  date: DateFilterInput,
  startIdx: number,
  prefix: string = "h.",
): { clauses: string[]; params: unknown[] } {
  const { qs, month, year, specificDate, dateFrom, dateTo } = date;
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = startIdx;

  switch (qs) {
    case "Last 30 Days":
      clauses.push(`${prefix}hearing_date >= CURRENT_DATE - INTERVAL '30 days'`);
      break;
    case "Last 90 Days":
      clauses.push(`${prefix}hearing_date >= CURRENT_DATE - INTERVAL '90 days'`);
      break;
    case "This Year":
      clauses.push(`EXTRACT(YEAR FROM ${prefix}hearing_date) = EXTRACT(YEAR FROM CURRENT_DATE)`);
      break;
    case "Specific Date":
      if (specificDate) {
        clauses.push(`${prefix}hearing_date = $${idx}::date`);
        params.push(specificDate);
        idx++;
      }
      break;
    case "Custom Range":
      if (dateFrom) {
        clauses.push(`${prefix}hearing_date >= $${idx}::date`);
        params.push(dateFrom);
        idx++;
      }
      if (dateTo) {
        clauses.push(`${prefix}hearing_date <= $${idx}::date`);
        params.push(dateTo);
        idx++;
      }
      break;
  }

  if (month) {
    const MONTH_NUM: Record<string, number> = {
      Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
      Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
    };
    const mm = MONTH_NUM[month];
    if (mm) {
      clauses.push(`EXTRACT(MONTH FROM ${prefix}hearing_date) = ${mm}`);
    }
  }

  if (year) {
    const yr = parseInt(year, 10);
    if (Number.isFinite(yr) && yr >= 1900 && yr <= 9999) {
      clauses.push(`EXTRACT(YEAR FROM ${prefix}hearing_date) = ${yr}`);
    }
  }

  return { clauses, params };
}

// ─── DB fetch helpers ─────────────────────────────────────────────────────────

async function fetchAllMonthly(
  repId: number | null,
  date: DateFilterInput,
): Promise<MonthlyTrend[]> {
  const conditions: string[] = ["h.hearing_date IS NOT NULL"];
  const params: unknown[] = [];
  let idx = 1;

  if (repId !== null) {
    conditions.push(`h.assigned_rep_id = $${idx}`);
    params.push(repId);
    idx++;
  }

  const { clauses: dateClauses, params: dateParams } = buildDateRangeFilter(date, idx);
  conditions.push(...dateClauses);
  params.push(...dateParams);
  idx += dateParams.length;

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
  date: DateFilterInput,
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

  const { clauses: dateClauses, params: dateParams } = buildDateRangeFilter(date, idx);
  conditions.push(...dateClauses);
  params.push(...dateParams);
  idx += dateParams.length;

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
  date: DateFilterInput,
): Promise<AssignedRep[]> {
  const conditions: string[] = ["r.is_active = true"];
  const params: unknown[] = [];

  const { clauses: dateClauses, params: dateParams } = buildDateRangeFilter(
    date,
    params.length + 1,
  );
  conditions.push(...dateClauses);
  params.push(...dateParams);

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
  date: DateFilterInput,
): Promise<RepStatusRow[]> {
  const conditions: string[] = ["r.is_active = true"];
  const params: unknown[] = [];
  let idx = 1;

  if (repId !== null) {
    conditions.push(`r.id = $${idx}`);
    params.push(repId);
    idx++;
  }

  const { clauses: dateClauses, params: dateParams } = buildDateRangeFilter(date, idx);
  conditions.push(...dateClauses);
  params.push(...dateParams);
  idx += dateParams.length;

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
  date: DateFilterInput,
): Promise<StatCardData[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (repId !== null) {
    conditions.push(`assigned_rep_id = $${idx}`);
    params.push(repId);
    idx++;
  }

  // No alias on hearings in this query — pass prefix="" so column refs stay bare.
  const { clauses: dateClauses, params: dateParams } = buildDateRangeFilter(date, idx, "");
  conditions.push(...dateClauses);
  params.push(...dateParams);
  idx += dateParams.length;

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

// ─── Win Rate Calculator ─────────────────────────────────────────────────────

export interface WinRateFilters {
  rep?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface WinRateRow {
  rep: string;
  favorable: number;
  partiallyFavorable: number;
  unfavorable: number;
  total: number;
  winRate: number;
}

export interface WinRateData {
  rows: WinRateRow[];
  overall: { favorable: number; partiallyFavorable: number; unfavorable: number; total: number; winRate: number };
}

export async function fetchWinRateData(
  filters: WinRateFilters = {},
): Promise<WinRateData> {
  const conditions: string[] = [
    "r.is_active = true",
    "h.hearing_decision_status IN ('Favorable', 'Partially Favorable', 'Unfavorable')",
  ];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.rep) {
    conditions.push(`r.name = $${idx}`);
    params.push(filters.rep);
    idx++;
  }
  if (filters.dateFrom) {
    conditions.push(`h.hearing_date >= $${idx}::date`);
    params.push(filters.dateFrom);
    idx++;
  }
  if (filters.dateTo) {
    conditions.push(`h.hearing_date <= $${idx}::date`);
    params.push(filters.dateTo);
    idx++;
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const { rows } = await db.query(
    `SELECT
       r.name AS rep,
       COUNT(*) FILTER (WHERE h.hearing_decision_status = 'Favorable')::int AS favorable,
       COUNT(*) FILTER (WHERE h.hearing_decision_status = 'Partially Favorable')::int AS partially_favorable,
       COUNT(*) FILTER (WHERE h.hearing_decision_status = 'Unfavorable')::int AS unfavorable,
       COUNT(*)::int AS total
     FROM representatives r
     JOIN hearings h ON h.assigned_rep_id = r.id
     ${where}
     GROUP BY r.id, r.name
     HAVING COUNT(*) > 0
     ORDER BY
       CASE WHEN COUNT(*) = 0 THEN 0
            ELSE ((COUNT(*) FILTER (WHERE h.hearing_decision_status = 'Favorable') +
                   COUNT(*) FILTER (WHERE h.hearing_decision_status = 'Partially Favorable'))::float / COUNT(*)) END DESC,
       r.name ASC`,
    params,
  );

  const winRateRows: WinRateRow[] = (rows as { rep: string; favorable: number; partially_favorable: number; unfavorable: number; total: number }[]).map((r) => ({
    rep: r.rep,
    favorable: r.favorable,
    partiallyFavorable: r.partially_favorable,
    unfavorable: r.unfavorable,
    total: r.total,
    winRate: r.total > 0 ? Math.round(((r.favorable + r.partially_favorable) / r.total) * 1000) / 10 : 0,
  }));

  const overallFav = winRateRows.reduce((s, r) => s + r.favorable, 0);
  const overallPartial = winRateRows.reduce((s, r) => s + r.partiallyFavorable, 0);
  const overallUnfav = winRateRows.reduce((s, r) => s + r.unfavorable, 0);
  const overallTotal = overallFav + overallPartial + overallUnfav;

  return {
    rows: winRateRows,
    overall: {
      favorable: overallFav,
      partiallyFavorable: overallPartial,
      unfavorable: overallUnfav,
      total: overallTotal,
      winRate: overallTotal > 0 ? Math.round(((overallFav + overallPartial) / overallTotal) * 1000) / 10 : 0,
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getReportsData(
  filters: ReportsFilters = {}
): Promise<ReportsData> {
  // Resolve rep name → ID once; all queries reuse the same ID.
  const repId = await resolveRepId(filters.rep);
  const date: DateFilterInput = {
    qs:           filters.quickSelect,
    month:        filters.month,
    year:         filters.year,
    specificDate: filters.specificDate,
    dateFrom:     filters.dateFrom,
    dateTo:       filters.dateTo,
  };

  // Fetch unfiltered option lists in parallel with filtered data.
  // allYears and allReps are always the full set so dropdowns don't shrink.
  const [
    monthly,
    hearingStatus,
    assignedReps,
    repStatusRows,
    statCards,
    allRepsRows,
    allYearsRows,
  ] = await Promise.all([
    fetchAllMonthly(repId, date),
    fetchAllHearingStatuses(repId, date),
    fetchAllAssignedReps(date),
    fetchAllRepStatusRows(repId, date),
    fetchStatCards(repId, date),
    // Full unfiltered rep list for the dropdown
    db.query(
      "SELECT name FROM representatives WHERE is_active = true ORDER BY name",
    ),
    // Full unfiltered year list for the dropdown (descending — newest first).
    db.query(
      `SELECT DISTINCT EXTRACT(YEAR FROM hearing_date)::int AS year
       FROM hearings
       WHERE hearing_date IS NOT NULL
       ORDER BY year DESC`,
    ),
  ]);

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
    monthly,
    hearingStatus,
    assignedReps,
    repStatusRows,
    statCards,
    withdrawalTotal,
    allYears: allYearsRows.rows.map((r) => String(r.year)),
    allReps:  allRepsRows.rows.map((r) => r.name as string),
  };
}

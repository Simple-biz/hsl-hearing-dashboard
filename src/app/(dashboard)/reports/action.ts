"use server";

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

export interface StatCard {
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
  statCards: StatCard[];
  /** All unique month labels across the full dataset — used to populate the Month filter */
  allMonths: string[];
  /** All rep names across the full dataset — used to populate the Rep filter */
  allReps: string[];
}

// ─── Raw data helpers (replace bodies with db.query() when live) ──────────────

async function fetchAllMonthly(): Promise<MonthlyTrend[]> {
  return [
    { month: "Oct '24",  count: 3,   favorable: 0,   unfavorable: 0  },
    { month: "Nov '24",  count: 14,  favorable: 2,   unfavorable: 1  },
    { month: "Dec '24",  count: 18,  favorable: 4,   unfavorable: 2  },
    { month: "Jan '25",  count: 29,  favorable: 8,   unfavorable: 3  },
    { month: "Feb '25",  count: 44,  favorable: 12,  unfavorable: 6  },
    { month: "Mar '25",  count: 63,  favorable: 18,  unfavorable: 8  },
    { month: "Apr '25",  count: 116, favorable: 40,  unfavorable: 20 },
    { month: "May '25",  count: 109, favorable: 38,  unfavorable: 18 },
    { month: "Jun '25",  count: 155, favorable: 55,  unfavorable: 30 },
    { month: "Jul '25",  count: 192, favorable: 70,  unfavorable: 40 },
    { month: "Aug '25",  count: 194, favorable: 72,  unfavorable: 42 },
    { month: "Sep '25",  count: 241, favorable: 90,  unfavorable: 55 },
    { month: "Oct '25",  count: 310, favorable: 116, unfavorable: 70 },
    { month: "Nov '25",  count: 264, favorable: 98,  unfavorable: 60 },
    { month: "Dec '25",  count: 362, favorable: 135, unfavorable: 80 },
    { month: "Jan '26",  count: 284, favorable: 105, unfavorable: 65 },
    { month: "Feb '26",  count: 132, favorable: 48,  unfavorable: 28 },
    { month: "Feb '26+", count: 420, favorable: 160, unfavorable: 95 },
  ];
}

async function fetchAllHearingStatuses(): Promise<HearingStatus[]> {
  return [
    { status: "Continued",        count: 20, color: "#3b82f6" },
    { status: "Dismissal",        count: 10, color: "#ec4899" },
    { status: "Favorable",        count: 50, color: "#22c55e" },
    { status: "Good Cause Ltr",   count: 5,  color: "#14b8a6" },
    { status: "OTR at Hrg",       count: 2,  color: "#a3e635" },
    { status: "Pending Decision",  count: 8,  color: "#facc15" },
    { status: "Post HRG Review",  count: 3,  color: "#f97316" },
    { status: "Scheduled",        count: 15, color: "#7c3aed" },
    { status: "Unfavorable",      count: 12, color: "#ef4444" },
    { status: "WD Clmt Deceased", count: 1,  color: "#64748b" },
    { status: "Withdrawal",       count: 0,  color: "#9ca3af" },
  ];
}

async function fetchAllAssignedReps(): Promise<AssignedRep[]> {
  return [
    { name: "Sarah Johnson",   hearings: 238 },
    { name: "Michael Chen",    hearings: 196 },
    { name: "Emily Rodriguez", hearings: 25  },
    { name: "James Wilson",    hearings: 276 },
    { name: "Linda Park",      hearings: 142 },
    { name: "David Torres",    hearings: 89  },
  ];
}

async function fetchAllRepStatusRows(): Promise<RepStatusRow[]> {
  return [
    { rep: "Sarah Johnson",   Continued: 2,  Dismissal: 3, Favorable: 33, "Good Cause": 2, OTR: 0, Pending: 22, "Post HRG": 15, Scheduled: 90, Unfavorable: 44, Withdrawal: 27, Total: 238 },
    { rep: "Michael Chen",    Continued: 0,  Dismissal: 4, Favorable: 62, "Good Cause": 0, OTR: 0, Pending: 4,  "Post HRG": 3,  Scheduled: 27, Unfavorable: 77, Withdrawal: 19, Total: 196 },
    { rep: "Emily Rodriguez", Continued: 0,  Dismissal: 0, Favorable: 0,  "Good Cause": 0, OTR: 1, Pending: 1,  "Post HRG": 0,  Scheduled: 18, Unfavorable: 3,  Withdrawal: 2,  Total: 23  },
    { rep: "James Wilson",    Continued: 5,  Dismissal: 2, Favorable: 80, "Good Cause": 1, OTR: 0, Pending: 30, "Post HRG": 12, Scheduled: 95, Unfavorable: 40, Withdrawal: 11, Total: 276 },
    { rep: "Linda Park",      Continued: 1,  Dismissal: 1, Favorable: 45, "Good Cause": 0, OTR: 0, Pending: 15, "Post HRG": 8,  Scheduled: 48, Unfavorable: 18, Withdrawal: 6,  Total: 142 },
    { rep: "David Torres",    Continued: 0,  Dismissal: 0, Favorable: 22, "Good Cause": 0, OTR: 0, Pending: 10, "Post HRG": 5,  Scheduled: 30, Unfavorable: 15, Withdrawal: 7,  Total: 89  },
  ];
}

async function fetchAllStatCards(): Promise<StatCard[]> {
  return [
    { label: "Total Hearings", value: "5,484", bg: "bg-violet-600"  },
    { label: "Assigned",       value: "4,117", bg: "bg-emerald-500" },
    { label: "Unassigned",     value: "1,367", bg: "bg-pink-500"    },
    { label: "Favorable",      value: "817",   bg: "bg-lime-500"    },
    { label: "Unfavorable",    value: "964",   bg: "bg-red-500"     },
    { label: "Scheduled",      value: "2,553", bg: "bg-cyan-500"    },
    { label: "Pending",        value: "181",   bg: "bg-amber-400"   },
  ];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches all reports data, optionally filtered.
 *
 * When the backing data source is a real DB, replace the fetch* helpers above
 * with parameterised db.query() calls and push filtering to SQL WHERE clauses.
 * The filter interface and call-sites in the client component stay identical.
 */
export async function getReportsData(
  filters: ReportsFilters = {}
): Promise<ReportsData> {
  const [monthly, hearingStatus, assignedReps, repStatusRows, statCards] =
    await Promise.all([
      fetchAllMonthly(),
      fetchAllHearingStatuses(),
      fetchAllAssignedReps(),
      fetchAllRepStatusRows(),
      fetchAllStatCards(),
    ]);

  // Derive option lists from the *full* unfiltered sets so the dropdowns
  // always show every choice regardless of active filters.
  const allMonths = monthly.map((m) => m.month);
  const allReps   = assignedReps.map((r) => r.name);

  // ── Apply filters ──────────────────────────────────────────────────────────
  // TODO: when live, replace these in-memory filters with DB WHERE clauses.

  const filteredMonthly = filters.month
    ? monthly.filter((m) => m.month === filters.month)
    : monthly;

  const filteredReps = filters.rep
    ? assignedReps.filter((r) => r.name === filters.rep)
    : assignedReps;

  const filteredRepRows = filters.rep
    ? repStatusRows.filter((r) => r.rep === filters.rep)
    : repStatusRows;

  // quickSelect is a date-range preset; with live data this maps to a
  // WHERE hearing_date BETWEEN x AND y. Stub: treated same as "All Time".
  // TODO: implement date-range slicing once DB query is wired.

  return {
    monthly: filteredMonthly,
    hearingStatus,   // status distribution is always the full cross-section
    assignedReps: filteredReps,
    repStatusRows: filteredRepRows,
    statCards,       // aggregate cards reflect the full dataset for now
    allMonths,
    allReps,
  };
}

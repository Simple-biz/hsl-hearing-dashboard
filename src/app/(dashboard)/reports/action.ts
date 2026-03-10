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

export interface ReportsData {
  monthly: MonthlyTrend[];
  hearingStatus: HearingStatus[];
  assignedReps: AssignedRep[];
  repStatusRows: RepStatusRow[];
  statCards: StatCard[];
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

export async function getMonthlyTrends(): Promise<MonthlyTrend[]> {
  // TODO: replace with db.query when live data is ready
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

export async function getHearingStatuses(): Promise<HearingStatus[]> {
  // TODO: replace with db.query when live data is ready
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

export async function getAssignedReps(): Promise<AssignedRep[]> {
  // TODO: replace with db.query when live data is ready
  return [
    { name: "Sarah Johnson",   hearings: 238 },
    { name: "Michael Chen",    hearings: 196 },
    { name: "Emily Rodriguez", hearings: 25  },
    { name: "James Wilson",    hearings: 276 },
    { name: "Linda Park",      hearings: 142 },
    { name: "David Torres",    hearings: 89  },
  ];
}

export async function getRepStatusRows(): Promise<RepStatusRow[]> {
  // TODO: replace with db.query when live data is ready
  return [
    { rep: "Sarah Johnson",   Continued: 2,  Dismissal: 3, Favorable: 33, "Good Cause": 2, OTR: 0, Pending: 22, "Post HRG": 15, Scheduled: 90, Unfavorable: 44, Withdrawal: 27, Total: 238 },
    { rep: "Michael Chen",    Continued: 0,  Dismissal: 4, Favorable: 62, "Good Cause": 0, OTR: 0, Pending: 4,  "Post HRG": 3,  Scheduled: 27, Unfavorable: 77, Withdrawal: 19, Total: 196 },
    { rep: "Emily Rodriguez", Continued: 0,  Dismissal: 0, Favorable: 0,  "Good Cause": 0, OTR: 1, Pending: 1,  "Post HRG": 0,  Scheduled: 18, Unfavorable: 3,  Withdrawal: 2,  Total: 23  },
  ];
}

export async function getStatCards(): Promise<StatCard[]> {
  // TODO: replace with db.query when live data is ready
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

export async function getReportsData(): Promise<ReportsData> {
  const [monthly, hearingStatus, assignedReps, repStatusRows, statCards] =
    await Promise.all([
      getMonthlyTrends(),
      getHearingStatuses(),
      getAssignedReps(),
      getRepStatusRows(),
      getStatCards(),
    ]);

  return { monthly, hearingStatus, assignedReps, repStatusRows, statCards };
}

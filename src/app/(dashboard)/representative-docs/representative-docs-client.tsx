"use client";

import { useState, useTransition, useMemo, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ExternalLink,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { StatCard, StatCardGrid } from "@/components/stat-card";
import { cn } from "@/lib/utils";
import {
  fetchRepDocsPage,
  updateRepDocsField,
  type RepDocsRow,
  type RepDocsStats,
  type RepDocsAssigneeOption,
} from "./actions";
import type { UserRole } from "@/lib/roles";

interface Props {
  userRole: UserRole;
  initialRecords: RepDocsRow[];
  initialTotalFiltered: number;
  initialStats: RepDocsStats;
  assignees: RepDocsAssigneeOption[];
}

const WORKFLOW_COLUMNS: {
  key: keyof RepDocsRow;
  atKey: keyof RepDocsRow;
  label: string;
  shortLabel: string;
}[] = [
  {
    key: "uploaded_noh",
    atKey: "uploaded_noh_at",
    label: "Uploaded NOH",
    shortLabel: "NOH",
  },
  {
    key: "sent_repdocs_to_cl",
    atKey: "sent_repdocs_to_cl_at",
    label: "Sent RepDocs to CL",
    shortLabel: "Sent",
  },
  {
    key: "repdocs_signed",
    atKey: "repdocs_signed_at",
    label: "RepDocs Signed",
    shortLabel: "Signed",
  },
  {
    key: "contact_ltr",
    atKey: "contact_ltr_at",
    label: "Contact Ltr",
    shortLabel: "Cont. Ltr",
  },
  {
    key: "repdocs_split",
    atKey: "repdocs_split_at",
    label: "RepDocs Split",
    shortLabel: "Split",
  },
  {
    key: "repdocs_uploaded_chronicle",
    atKey: "repdocs_uploaded_chronicle_at",
    label: "Uploaded in Chronicle",
    shortLabel: "Chronicle",
  },
  {
    key: "oho_confirmation",
    atKey: "oho_confirmation_at",
    label: "OHO Confirmation",
    shortLabel: "OHO Conf.",
  },
];

const CHECKER_COLUMNS: {
  key: keyof RepDocsRow;
  label: string;
  shortLabel: string;
}[] = [
  { key: "checker_calendar", label: "Calendar", shortLabel: "Cal." },
  {
    key: "checker_chronicle_claim",
    label: "Chronicle Claim",
    shortLabel: "Chr. Claim",
  },
  { key: "checker_noh", label: "NOH", shortLabel: "NOH" },
  { key: "checker_contact_ltr", label: "Contact Ltr", shortLabel: "Cont. Ltr" },
];

const STATUS_OPTIONS = ["Not Started", "Incomplete", "Complete", "Withdrawn"];
const CHECKER_STATUS_OPTIONS = [
  "Pending",
  "Reviewed",
  "Issues Found",
  "Complete",
];

interface DateFilters {
  preset: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_DATE_FILTERS: DateFilters = {
  preset: "",
  dateFrom: "",
  dateTo: "",
};

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function StatusBadge({ status }: { status: string | null }) {
  const s = (status || "Not Started").toLowerCase();
  if (s === "complete")
    return (
      <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
        Complete
      </span>
    );
  if (s === "incomplete")
    return (
      <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
        Incomplete
      </span>
    );
  if (s === "withdrawn")
    return (
      <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-900/30 dark:text-red-400">
        Withdrawn
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
      Not Started
    </span>
  );
}

function CheckerStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const s = status.toLowerCase();
  if (s === "complete")
    return (
      <span className="inline-flex items-center rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
        Complete
      </span>
    );
  if (s === "issues found")
    return (
      <span className="inline-flex items-center rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-900/30 dark:text-red-400">
        Issues
      </span>
    );
  if (s === "reviewed")
    return (
      <span className="inline-flex items-center rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
        Reviewed
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
      Pending
    </span>
  );
}

export function RepresentativeDocsClient({
  initialRecords,
  initialTotalFiltered,
  initialStats,
  assignees,
}: Props) {
  const [records, setRecords] = useState<RepDocsRow[]>(initialRecords);
  const [totalFiltered, setTotalFiltered] = useState(initialTotalFiltered);
  const [stats] = useState<RepDocsStats>(initialStats);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [dateFilters, setDateFilters] =
    useState<DateFilters>(EMPTY_DATE_FILTERS);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pageSize = 100;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

  const assigneeNames = useMemo(
    () => assignees.map((a) => a.name),
    [assignees],
  );

  const buildDateParams = useCallback((df: DateFilters) => {
    if (!df.preset || df.preset === "custom") {
      return {
        dateFrom: df.dateFrom || undefined,
        dateTo: df.dateTo || undefined,
      };
    }
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    switch (df.preset) {
      case "today":
        return { dateFrom: fmt(today), dateTo: fmt(today) };
      case "tomorrow": {
        const t = new Date(today);
        t.setDate(t.getDate() + 1);
        return { dateFrom: fmt(t), dateTo: fmt(t) };
      }
      case "this-week": {
        const mon = new Date(today);
        mon.setDate(mon.getDate() - mon.getDay() + 1);
        const fri = new Date(mon);
        fri.setDate(fri.getDate() + 4);
        return { dateFrom: fmt(mon), dateTo: fmt(fri) };
      }
      case "next-week": {
        const mon = new Date(today);
        mon.setDate(mon.getDate() - mon.getDay() + 8);
        const fri = new Date(mon);
        fri.setDate(fri.getDate() + 4);
        return { dateFrom: fmt(mon), dateTo: fmt(fri) };
      }
      case "this-month": {
        return {
          dateFrom: fmt(new Date(today.getFullYear(), today.getMonth(), 1)),
          dateTo: fmt(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
        };
      }
      case "last-month": {
        return {
          dateFrom: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
          dateTo: fmt(new Date(today.getFullYear(), today.getMonth(), 0)),
        };
      }
      case "next-30": {
        const end = new Date(today);
        end.setDate(end.getDate() + 30);
        return { dateFrom: fmt(today), dateTo: fmt(end) };
      }
      default:
        return {};
    }
  }, []);

  const reload = useCallback(
    (
      overrides: {
        page?: number;
        search?: string;
        status?: string;
        assignedTo?: string;
        dateFilters?: DateFilters;
      } = {},
    ) => {
      const df = overrides.dateFilters ?? dateFilters;
      const dateParams = buildDateParams(df);
      startTransition(async () => {
        const res = await fetchRepDocsPage({
          page: overrides.page ?? page,
          pageSize,
          search: overrides.search ?? search,
          status: overrides.status ?? statusFilter,
          assignedTo: overrides.assignedTo ?? assigneeFilter,
          ...dateParams,
        });
        setRecords(res.records);
        setTotalFiltered(res.totalFiltered);
      });
    },
    [page, search, statusFilter, assigneeFilter, dateFilters, buildDateParams],
  );

  const handleSearchChange = useCallback(
    (val: string) => {
      setSearch(val);
      setPage(1);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        reload({ page: 1, search: val });
      }, 300);
    },
    [reload],
  );

  const handleDatePreset = useCallback(
    (preset: string) => {
      const next: DateFilters = { preset, dateFrom: "", dateTo: "" };
      setDateFilters(next);
      setPage(1);
      reload({ page: 1, dateFilters: next });
    },
    [reload],
  );

  const clearAllFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
    setAssigneeFilter("all");
    setDateFilters(EMPTY_DATE_FILTERS);
    setPage(1);
    startTransition(async () => {
      const res = await fetchRepDocsPage({ page: 1, pageSize });
      setRecords(res.records);
      setTotalFiltered(res.totalFiltered);
    });
  }, []);

  function updateLocal(id: number, patch: Partial<RepDocsRow>) {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  async function handleField(
    id: number,
    field: string,
    value: string | boolean | null,
  ) {
    try {
      await updateRepDocsField(id, field, value);
      const patch: Record<string, unknown> = { [field]: value };
      const wf = WORKFLOW_COLUMNS.find((c) => c.key === field);
      if (wf)
        patch[wf.atKey as string] = value ? new Date().toISOString() : null;
      updateLocal(id, patch as Partial<RepDocsRow>);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  const hasActiveFilters =
    search ||
    statusFilter !== "all" ||
    assigneeFilter !== "all" ||
    dateFilters.preset ||
    dateFilters.dateFrom ||
    dateFilters.dateTo;

  const SEL =
    "h-8 rounded-md border border-input bg-card px-2 text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="flex min-w-0 flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Representative Docs</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalFiltered} records
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <StatCardGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Total"
          value={stats.total}
          gradient="from-indigo-500 to-purple-600"
        />
        <StatCard
          label="Not Started"
          value={stats.notStarted}
          gradient="from-zinc-400 to-zinc-500"
        />
        <StatCard
          label="Incomplete"
          value={stats.incomplete}
          gradient="from-amber-500 to-amber-600"
        />
        <StatCard
          label="Complete"
          value={stats.complete}
          gradient="from-emerald-500 to-green-400"
        />
        <StatCard
          label="Withdrawn"
          value={stats.withdrawn}
          gradient="from-red-400 to-rose-500"
        />
      </StatCardGrid>

      {/* Filters */}
      <div className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative w-full sm:w-auto sm:max-w-56 sm:flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search claimant, rep, assignee..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          {/* Status */}
          <select
            className={SEL + " min-w-32"}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
              reload({ page: 1, status: e.target.value });
            }}
          >
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Assignee */}
          <select
            className={SEL + " min-w-36"}
            value={assigneeFilter}
            onChange={(e) => {
              setAssigneeFilter(e.target.value);
              setPage(1);
              reload({ page: 1, assignedTo: e.target.value });
            }}
          >
            <option value="all">All Assignees</option>
            {assigneeNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          {/* Date Preset */}
          <select
            className={SEL + " min-w-36"}
            value={dateFilters.preset}
            onChange={(e) => handleDatePreset(e.target.value)}
          >
            <option value="">All Dates</option>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="this-week">This Week</option>
            <option value="next-week">Next Week</option>
            <option value="this-month">This Month</option>
            <option value="last-month">Last Month</option>
            <option value="next-30">Next 30 Days</option>
            <option value="custom">Custom Range...</option>
          </select>

          {/* Custom date range */}
          {dateFilters.preset === "custom" && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={dateFilters.dateFrom}
                onChange={(e) => {
                  const next = { ...dateFilters, dateFrom: e.target.value };
                  setDateFilters(next);
                  reload({ page: 1, dateFilters: next });
                }}
                className="h-8 w-32 text-xs"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={dateFilters.dateTo}
                onChange={(e) => {
                  const next = { ...dateFilters, dateTo: e.target.value };
                  setDateFilters(next);
                  reload({ page: 1, dateFilters: next });
                }}
                className="h-8 w-32 text-xs"
              />
            </div>
          )}

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs text-muted-foreground"
              onClick={clearAllFilters}
            >
              <X className="h-3 w-3" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* Pagination bar */}
      <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          Showing {totalFiltered === 0 ? 0 : (page - 1) * pageSize + 1}–
          {Math.min(page * pageSize, totalFiltered)} of {totalFiltered}
          {isPending && " (loading...)"}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={page <= 1 || isPending}
            onClick={() => {
              const p = page - 1;
              setPage(p);
              reload({ page: p });
            }}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground px-1">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={page >= totalPages || isPending}
            onClick={() => {
              const p = page + 1;
              setPage(p);
              reload({ page: p });
            }}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Table */}
      <div
        className={cn(
          "w-full overflow-hidden rounded-lg border",
          isPending && "opacity-50 pointer-events-none",
        )}
      >
        <div
          className="overflow-x-auto overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 340px)" }}
          onWheel={(e) => {
            if (e.shiftKey) {
              e.currentTarget.scrollLeft += e.deltaY;
              e.preventDefault();
            }
          }}
        >
          <table className="border-collapse text-sm w-full">
            <thead className="sticky top-0 z-30">
              <tr>
                {/* Frozen columns */}
                {[
                  { label: "Date", w: 80 },
                  { label: "Claimant", w: 160 },
                  { label: "Rep", w: 130 },
                  { label: "Assigned To", w: 130 },
                  { label: "Status", w: 90 },
                ].map((col, i) => (
                  <th
                    key={col.label}
                    className={cn(
                      "h-10 whitespace-nowrap border-b-2 border-border px-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground/80 bg-zinc-100 dark:bg-zinc-900 sticky z-20",
                      i === 4 &&
                        "border-r-2 border-r-blue-400/40 dark:border-r-blue-500/40",
                    )}
                    style={{
                      width: col.w,
                      minWidth: col.w,
                      left: [0, 80, 240, 370, 500][i],
                    }}
                  >
                    {col.label}
                  </th>
                ))}
                {/* Workflow columns */}
                {WORKFLOW_COLUMNS.map((c) => (
                  <th
                    key={c.key as string}
                    className="h-10 whitespace-nowrap border-b-2 border-border px-2 text-center text-[11px] font-bold uppercase tracking-wide text-foreground/80 bg-zinc-100 dark:bg-zinc-900"
                    style={{ width: 72, minWidth: 72 }}
                    title={c.label}
                  >
                    {c.shortLabel}
                  </th>
                ))}
                {/* OHO Assigned */}
                <th
                  className="h-10 whitespace-nowrap border-b-2 border-border px-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground/80 bg-zinc-100 dark:bg-zinc-900"
                  style={{ width: 110, minWidth: 110 }}
                >
                  OHO Assigned
                </th>
                {/* Checker columns */}
                {CHECKER_COLUMNS.map((c) => (
                  <th
                    key={c.key as string}
                    className="h-10 whitespace-nowrap border-b-2 border-border px-2 text-center text-[11px] font-bold uppercase tracking-wide text-foreground/80 bg-zinc-100 dark:bg-zinc-900"
                    style={{ width: 72, minWidth: 72 }}
                    title={c.label}
                  >
                    {c.shortLabel}
                  </th>
                ))}
                <th
                  className="h-10 whitespace-nowrap border-b-2 border-border px-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground/80 bg-zinc-100 dark:bg-zinc-900"
                  style={{ width: 100, minWidth: 100 }}
                >
                  Chk Status
                </th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      5 +
                      WORKFLOW_COLUMNS.length +
                      1 +
                      CHECKER_COLUMNS.length +
                      1
                    }
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No records found.
                  </td>
                </tr>
              ) : (
                records.map((r, ri) => {
                  const evenBg =
                    ri % 2 === 0
                      ? "bg-white dark:bg-zinc-950"
                      : "bg-zinc-50 dark:bg-zinc-900";
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        "border-b border-border/40 last:border-0",
                        evenBg,
                      )}
                    >
                      {/* Date — frozen */}
                      <td
                        className={cn(
                          "px-2 py-1.5 sticky z-10 overflow-hidden",
                          evenBg,
                        )}
                        style={{ width: 80, minWidth: 80, left: 0 }}
                      >
                        <span className="text-xs tabular-nums">
                          {formatDate(r.hearing_date)}
                        </span>
                      </td>
                      {/* Claimant — frozen */}
                      <td
                        className={cn(
                          "px-2 py-1.5 sticky z-10 overflow-hidden",
                          evenBg,
                        )}
                        style={{ width: 160, minWidth: 160, left: 80 }}
                      >
                        <div className="flex items-center gap-1 min-w-0">
                          {r.claimant_link ? (
                            <button
                              type="button"
                              onClick={() =>
                                window.open(
                                  r.claimant_link!,
                                  "_blank",
                                  "noopener,noreferrer",
                                )
                              }
                              className="truncate text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 text-left"
                            >
                              {r.claimant}
                            </button>
                          ) : (
                            <span className="truncate text-xs font-medium">
                              {r.claimant}
                            </span>
                          )}
                        </div>
                        {r.ssn_last_4 && (
                          <span className="text-[10px] text-muted-foreground">
                            {r.ssn_last_4}
                          </span>
                        )}
                      </td>
                      {/* Rep — frozen */}
                      <td
                        className={cn(
                          "px-2 py-1.5 sticky z-10 overflow-hidden",
                          evenBg,
                        )}
                        style={{ width: 130, minWidth: 130, left: 240 }}
                      >
                        <span className="truncate text-xs block max-w-30">
                          {r.representative_name || "—"}
                        </span>
                      </td>
                      {/* Assigned To — frozen */}
                      <td
                        className={cn(
                          "px-2 py-1.5 sticky z-10 overflow-hidden",
                          evenBg,
                        )}
                        style={{ width: 130, minWidth: 130, left: 370 }}
                      >
                        <select
                          className="h-6 w-full rounded border border-transparent px-1 text-[11px] cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400 hover:border-border bg-card text-foreground"
                          value={r.assigned_to ?? ""}
                          onChange={(e) =>
                            handleField(
                              r.id,
                              "assigned_to",
                              e.target.value || null,
                            )
                          }
                        >
                          <option value="">—</option>
                          {assigneeNames.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </td>
                      {/* Status — frozen + right border */}
                      <td
                        className={cn(
                          "px-2 py-1.5 sticky z-10 overflow-hidden border-r-2 border-r-blue-400/40 dark:border-r-blue-500/40",
                          evenBg,
                        )}
                        style={{ width: 90, minWidth: 90, left: 500 }}
                      >
                        <StatusBadge status={r.overall_status} />
                      </td>

                      {/* Workflow checkboxes */}
                      {WORKFLOW_COLUMNS.map((c) => {
                        const checked = Boolean(r[c.key]);
                        const ts = r[c.atKey] as string | null;
                        return (
                          <td
                            key={c.key as string}
                            className="px-2 py-1.5 text-center"
                            style={{ width: 72, minWidth: 72 }}
                          >
                            <div className="flex flex-col items-center gap-0.5">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  handleField(
                                    r.id,
                                    c.key as string,
                                    e.target.checked,
                                  )
                                }
                                className="h-4 w-4 accent-emerald-600 cursor-pointer rounded"
                              />
                              {ts && (
                                <span className="text-[9px] text-muted-foreground leading-tight">
                                  {formatDate(ts)}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      {/* OHO Assigned */}
                      <td
                        className="px-2 py-1.5"
                        style={{ width: 110, minWidth: 110 }}
                      >
                        <input
                          className="h-6 w-full rounded border border-transparent bg-transparent px-1 text-xs hover:border-border focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                          defaultValue={r.oho_assigned_to ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value.trim() || null;
                            if (v !== (r.oho_assigned_to ?? null)) {
                              handleField(r.id, "oho_assigned_to", v);
                            }
                          }}
                        />
                      </td>

                      {/* Checker checkboxes */}
                      {CHECKER_COLUMNS.map((c) => (
                        <td
                          key={c.key as string}
                          className="px-2 py-1.5 text-center"
                          style={{ width: 72, minWidth: 72 }}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(r[c.key])}
                            onChange={(e) =>
                              handleField(
                                r.id,
                                c.key as string,
                                e.target.checked,
                              )
                            }
                            className="h-4 w-4 accent-blue-600 cursor-pointer rounded"
                          />
                        </td>
                      ))}

                      {/* Checker Status */}
                      <td
                        className="px-2 py-1.5"
                        style={{ width: 100, minWidth: 100 }}
                      >
                        <select
                          className="h-6 w-full rounded border border-transparent px-1 text-[11px] cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400 hover:border-border bg-card text-foreground"
                          value={r.checker_status ?? ""}
                          onChange={(e) =>
                            handleField(
                              r.id,
                              "checker_status",
                              e.target.value || null,
                            )
                          }
                        >
                          <option value="">—</option>
                          {CHECKER_STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom scroll hint */}
      <div className="hidden items-center gap-2 text-[10px] text-muted-foreground md:flex">
        <span>Shift + scroll to pan right</span>
        <span className="text-border">|</span>
        <span>First 5 columns frozen</span>
      </div>
    </div>
  );
}

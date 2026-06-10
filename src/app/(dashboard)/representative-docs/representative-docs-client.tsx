"use client";

import {
  useState,
  useTransition,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  memo,
} from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClaimantCopyButton } from "@/components/ui/claimant-copy-button";
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Pencil,
  ClipboardList,
  AlertTriangle,
  Bell,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { StatCard, StatCardGrid } from "@/components/stat-card";
import { AppHeader } from "@/components/layout/app-header";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { cn } from "@/lib/utils";
import {
  fetchRepDocsPage,
  updateRepDocsField,
  updateHearingLink,
  acknowledgeRepDocs,
  type RepDocsRow,
  type RepDocsStats,
  type RepDocsAssigneeOption,
  type RepDocsFilteredBreakdown,
} from "./actions";
import type { UserRole } from "@/lib/roles";
import { resolveFieldAccess } from "@/lib/field-access";
import { RepDocsImportModal } from "@/components/modals/rep-docs-import-modal";
import { ActivityLogModal } from "@/components/modals/activity-log-modal";
import { RepDocsWithdrawnModal } from "@/components/modals/rep-docs-withdrawn-modal";
import { RepDocsChangesModal } from "@/components/modals/rep-docs-changes-modal";
import { RepDocsDetailPanel } from "./rep-docs-detail-panel";
import { RepDocsNotesPanel } from "./rep-docs-notes-panel";
import { countRepDocsChangesSince } from "./actions";

interface Props {
  userRole: UserRole;
  userName: string;
  initialRecords: RepDocsRow[];
  initialTotalFiltered: number;
  initialStats: RepDocsStats;
  assignees: RepDocsAssigneeOption[];
  ohoAssignees: RepDocsAssigneeOption[];
  /**
   * Plain map of field_key → can_edit override for this user on the
   * representative_docs page. Empty = inherit role default.
   */
  fieldOverrides: Record<string, boolean>;
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

// ── Contrast helper — dark text on light backgrounds, white on dark ──
function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

// ── Overall status config (single source of truth) ──
const STATUS_CONFIG: {
  value: string;
  label: string;
  badgeClass: string;
}[] = [
  {
    value: "Not Started",
    label: "Not Started",
    badgeClass: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  },
  {
    value: "Incomplete",
    label: "Incomplete",
    badgeClass:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  {
    value: "Complete",
    label: "Complete",
    badgeClass:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  {
    value: "Withdrawn",
    label: "Withdrawn",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  {
    value: "Postponed",
    label: "Postponed",
    badgeClass: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
  },
  {
    value: "Favorable",
    label: "Favorable",
    badgeClass:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
];

const STATUS_OPTIONS = STATUS_CONFIG.map((s) => s.value);

const WORKFLOW_KEYS = [
  "uploaded_noh",
  "sent_repdocs_to_cl",
  "repdocs_signed",
  "contact_ltr",
  "repdocs_split",
  "repdocs_uploaded_chronicle",
  "oho_confirmation",
] as const;

function computeOverallStatus(row: RepDocsRow): string {
  // Withdrawn is an override (set by import or hearing status) — preserve it.
  if ((row.overall_status || "").toLowerCase() === "withdrawn")
    return "Withdrawn";
  const flags = WORKFLOW_KEYS.map((k) => Boolean(row[k]));
  const truthy = flags.filter(Boolean).length;
  if (truthy === 0) return "Not Started";
  if (truthy === flags.length) return "Complete";
  return "Incomplete";
}
// ── Checker status config (single source of truth) ──
const CHECKER_STATUS_CONFIG: {
  value: string;
  label: string;
  badgeClass: string;
}[] = [
  {
    value: "Not Started",
    label: "Not Started",
    badgeClass: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  },
  {
    value: "Incomplete",
    label: "Incomplete",
    badgeClass:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  {
    value: "Complete",
    label: "Complete",
    badgeClass:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
];

const FIELD_LABELS: Record<string, string> = {
  assigned_to: "Assignee",
  overall_status: "Status",
  uploaded_noh: "Uploaded NOH",
  sent_repdocs_to_cl: "Sent Rep Docs to CL",
  repdocs_signed: "Rep Docs Signed",
  contact_ltr: "Contact Letter",
  repdocs_split: "Rep Docs Split",
  repdocs_uploaded_chronicle: "Uploaded in Chronicle",
  oho_confirmation: "OHO Confirmation",
  oho_assigned_to: "OHO Assignee",
  checker_calendar: "Checker — Calendar",
  checker_chronicle_claim: "Checker — Chronicle Claim",
  checker_noh: "Checker — NOH",
  checker_contact_ltr: "Checker — Contact Ltr",
  checker_status: "Checker Status",
};

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
  // Date-only strings ("2026-05-12") parse as UTC midnight and drift to the
  // previous day in negative-UTC timezones. Pin to noon so the date stays put.
  const input = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  const d = new Date(input);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function StatusBadge({ status }: { status: string | null }) {
  const normalized = (status || "Not Started").toLowerCase();
  const cfg =
    STATUS_CONFIG.find((s) => s.value.toLowerCase() === normalized) ??
    STATUS_CONFIG[0];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold",
        cfg.badgeClass,
      )}
    >
      {cfg.label}
    </span>
  );
}

// ── Rep badge (mirrors dashboard-client styling) ──
const REP_BADGE_COLORS: Record<string, string> = {
  "in-house":
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  internal_advocates:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  contract:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  external_advocates:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

function RepBadge({ row }: { row: RepDocsRow }) {
  if (row.representative_name) {
    const isInternal =
      row.rep_type === "in-house" || row.rep_type === "internal_advocates";
    const icon = isInternal ? "🏠" : "📋";
    const colorClass =
      REP_BADGE_COLORS[row.rep_type || ""] || "bg-muted text-muted-foreground";
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold",
          colorClass,
        )}
        title={row.representative_name}
      >
        {icon} {row.representative_name}
      </span>
    );
  }
  if (row.assignment_status === "wd_never_assigned") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        📋 WD - Never Assigned
      </span>
    );
  }
  if (row.assignment_status === "withdrawal") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-300">
        🚫 Withdrawal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-300">
      —
    </span>
  );
}

// ── Link edit modal (matches dashboard-client) ──
function LinkEditModal({
  title,
  currentUrl,
  onSave,
  onRemove,
  onClose,
}: {
  title: string;
  currentUrl: string;
  onSave: (url: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(currentUrl);
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-card p-4 shadow-lg space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold">{title}</h3>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="w-full rounded-md border bg-transparent px-3 py-2 text-xs focus:border-ring focus:outline-none"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave(url.trim());
            if (e.key === "Escape") onClose();
          }}
        />
        <div className="flex justify-end gap-2">
          {currentUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-destructive"
              onClick={onRemove}
            >
              Remove Link
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="text-xs"
            onClick={() => onSave(url.trim())}
          >
            Save
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Claimant cell with claimant + chronicle link edit (mirrors dashboard-client) ──
type LinkEditField = "chronicle_link";

function ClaimantCell({
  row,
  editable,
  onSave,
}: {
  row: RepDocsRow;
  editable: boolean;
  onSave: (id: number, field: string, value: string | null) => void;
}) {
  const [editingField, setEditingField] = useState<LinkEditField | null>(null);
  const chronicleLink = row.chronicle_link ?? null;

  let currentEditUrl = "";
  if (editingField === "chronicle_link") currentEditUrl = chronicleLink ?? "";

  const handleSave = (url: string) => {
    if (editingField) onSave(row.id, editingField, url || null);
    setEditingField(null);
  };
  const handleRemove = () => {
    if (editingField) onSave(row.id, editingField, null);
    setEditingField(null);
  };

  return (
    <div className="min-w-0 pr-1">
      <div className="flex items-center gap-1 min-w-0">
        {row.claimant_link ? (
          <button
            type="button"
            onClick={() =>
              window.open(row.claimant_link!, "_blank", "noopener,noreferrer")
            }
            className="truncate text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 text-left"
            title={row.claimant ?? undefined}
          >
            {row.claimant}
          </button>
        ) : (
          <p
            className="truncate text-xs font-medium"
            title={row.claimant ?? undefined}
          >
            {row.claimant}
          </p>
        )}
        <ClaimantCopyButton name={row.claimant} />
      </div>

      <div className="flex items-center gap-1">
        {row.claim_type && (
          <p className="truncate text-[10px] text-muted-foreground">
            {row.claim_type}
          </p>
        )}
        {chronicleLink && (
          <button
            type="button"
            onClick={() =>
              window.open(chronicleLink, "_blank", "noopener,noreferrer")
            }
            className="text-[10px] font-medium text-violet-600 hover:underline dark:text-violet-400"
            title="Open Chronicle link"
          >
            Chronicle
          </button>
        )}
        {editable && (
          <button
            type="button"
            onClick={() => setEditingField("chronicle_link")}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-violet-600 hover:bg-muted"
            title={chronicleLink ? "Edit Chronicle link" : "Add Chronicle link"}
          >
            {chronicleLink ? (
              <Pencil className="h-2.5 w-2.5" />
            ) : (
              <span className="text-[9px] font-semibold leading-none text-muted-foreground/60">
                +Ch
              </span>
            )}
          </button>
        )}
      </div>

      {editingField && (
        <LinkEditModal
          title={"Chronicle Link \u2014 " + (row.claimant ?? "")}
          currentUrl={currentEditUrl}
          onSave={handleSave}
          onRemove={handleRemove}
          onClose={() => setEditingField(null)}
        />
      )}
    </div>
  );
}

export function RepresentativeDocsClient({
  userRole,
  userName,
  initialRecords,
  initialTotalFiltered,
  initialStats,
  assignees,
  ohoAssignees,
  fieldOverrides,
}: Props) {
  // Per-user editability for rep_docs fields. Page-level role default
  // (anyone on the page can edit anything) overlaid with per-user overrides.
  const canEditRepDocsField = useCallback(
    (fieldKey: string): boolean =>
      resolveFieldAccess(
        userRole,
        "representative_docs",
        fieldKey,
        fieldOverrides,
      ),
    [userRole, fieldOverrides],
  );

  const [records, setRecords] = useState<RepDocsRow[]>(initialRecords);
  const [totalFiltered, setTotalFiltered] = useState(initialTotalFiltered);
  const [breakdown, setBreakdown] = useState<RepDocsFilteredBreakdown | null>(
    null,
  );
  const [stats] = useState<RepDocsStats>(initialStats);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [dateFilters, setDateFilters] =
    useState<DateFilters>(EMPTY_DATE_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [isPending, startTransition] = useTransition();
  const [showImport, setShowImport] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showWithdrawn, setShowWithdrawn] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [changeCount, setChangeCount] = useState(0);
  const [selectedRow, setSelectedRow] = useState<RepDocsRow | null>(null);
  const [notesRow, setNotesRow] = useState<RepDocsRow | null>(null);
  const [notesAnchorRect, setNotesAnchorRect] = useState<DOMRect | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(
    typeof window !== "undefined"
      ? localStorage.getItem("rep-docs-changes-seen-at")
      : null,
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

  const assigneeNames = useMemo(
    () => assignees.map((a) => a.name),
    [assignees],
  );
  // assignees passed directly to table for bg_color support

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
        pageSize?: number;
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
          pageSize: overrides.pageSize ?? pageSize,
          search: overrides.search ?? search,
          status: overrides.status ?? statusFilter,
          assignedTo: overrides.assignedTo ?? assigneeFilter,
          ...dateParams,
        });
        setRecords(res.records);
        setTotalFiltered(res.totalFiltered);
        setBreakdown(res.breakdown);
      });
    },
    [
      page,
      pageSize,
      search,
      statusFilter,
      assigneeFilter,
      dateFilters,
      buildDateParams,
    ],
  );

  // Manual refresh — re-pulls the current view (same filters / page / sort)
  // and restores the scroll position on the next frame so the user stays
  // exactly where they were working.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    const scrollTop = tableScrollRef.current?.scrollTop ?? 0;
    setRefreshing(true);
    try {
      const res = await fetchRepDocsPage({
        page,
        pageSize,
        search,
        status: statusFilter,
        assignedTo: assigneeFilter,
        ...buildDateParams(dateFilters),
      });
      setRecords(res.records);
      setTotalFiltered(res.totalFiltered);
      setBreakdown(res.breakdown);
    } finally {
      setRefreshing(false);
      requestAnimationFrame(() => {
        if (tableScrollRef.current)
          tableScrollRef.current.scrollTop = scrollTop;
      });
    }
  }, [
    page,
    pageSize,
    search,
    statusFilter,
    assigneeFilter,
    dateFilters,
    buildDateParams,
  ]);

  // Poll for new changes every 60s — lightweight count query only.
  // Shows a badge on the bell button; fires a toast when new changes appear.
  const prevChangeCountRef = useRef(0);
  useEffect(() => {
    const POLL_MS = 60_000;

    const checkCount = async () => {
      try {
        const since =
          lastSeenAt || new Date(Date.now() - 86400000).toISOString();
        const cnt = await countRepDocsChangesSince(since);
        const prev = prevChangeCountRef.current;
        prevChangeCountRef.current = cnt;
        setChangeCount(cnt);

        // Only toast when the count actually increased (not on first mount)
        if (cnt > prev && prev > 0) {
          const diff = cnt - prev;
          toast(`${diff} new change${diff === 1 ? "" : "s"} detected`, {
            action: {
              label: "Refresh",
              onClick: () => reload(),
            },
            duration: 8000,
          });
        }
      } catch {
        // Silently ignore
      }
    };

    checkCount(); // initial check on mount
    const interval = setInterval(checkCount, POLL_MS);
    return () => clearInterval(interval);
  }, [lastSeenAt, reload]);

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
      setBreakdown(res.breakdown);
    });
  }, [pageSize]);

  const handlePageChange = useCallback(
    (p: number) => {
      setPage(p);
      reload({ page: p });
    },
    [reload],
  );

  const handlePageSizeChange = useCallback(
    (ps: number) => {
      setPageSize(ps);
      setPage(1);
      reload({ page: 1, pageSize: ps });
    },
    [reload],
  );

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
    const prev = records.find((r) => r.id === id);
    if (!prev) return;
    // Per-user gate — short-circuits before the network round-trip.
    // Server still enforces (defense-in-depth via requireFieldAccess).
    if (!canEditRepDocsField(field)) {
      toast.error(
        `You do not have permission to edit "${field}" on Representative Docs.`,
      );
      return;
    }

    const patch: Record<string, unknown> = { [field]: value };
    const wf = WORKFLOW_COLUMNS.find((c) => c.key === field);
    if (wf) patch[wf.atKey as string] = value ? new Date().toISOString() : null;

    const optimistic = { ...prev, ...patch } as RepDocsRow;
    if (wf && field !== "overall_status") {
      optimistic.overall_status = computeOverallStatus(optimistic);
    }
    const checkerFields = [
      "checker_calendar",
      "checker_chronicle_claim",
      "checker_noh",
      "checker_contact_ltr",
    ];
    if (checkerFields.includes(field)) {
      const allTrue =
        Boolean(optimistic.checker_calendar) &&
        Boolean(optimistic.checker_chronicle_claim) &&
        Boolean(optimistic.checker_noh) &&
        Boolean(optimistic.checker_contact_ltr);
      const allFalse =
        !optimistic.checker_calendar &&
        !optimistic.checker_chronicle_claim &&
        !optimistic.checker_noh &&
        !optimistic.checker_contact_ltr;
      optimistic.checker_status = allTrue
        ? "Complete"
        : allFalse
          ? "Not Started"
          : "Incomplete";
    }
    setRecords((list) => list.map((r) => (r.id === id ? optimistic : r)));

    try {
      await updateRepDocsField(id, field, value);
      const label = FIELD_LABELS[field] ?? field;
      toast.success(`${label} updated`);
    } catch (e) {
      setRecords((list) => list.map((r) => (r.id === id ? prev : r)));
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  const handleLink = useCallback(
    async (id: number, field: string, value: string | null) => {
      if (field !== "chronicle_link") return;
      try {
        await updateHearingLink(id, field, value);
        updateLocal(id, { [field]: value } as Partial<RepDocsRow>);
        toast.success("Chronicle link updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Link update failed");
      }
    },
    [],
  );

  const handleAcknowledge = useCallback(
    async (id: number) => {
      // Optimistic — set timestamp + caller's name immediately so the badge
      // swaps to "Acknowledged" without waiting on the server.
      const nowIso = new Date().toISOString();
      setRecords((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                rep_docs_acknowledged_at: nowIso,
                rep_docs_acknowledged_by_name: userName,
              }
            : r,
        ),
      );
      try {
        const result = await acknowledgeRepDocs(id);
        // Reconcile with server timestamp/user id/display name
        setRecords((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  rep_docs_acknowledged_at: result.acknowledgedAt,
                  rep_docs_acknowledged_by: result.acknowledgedBy,
                  rep_docs_acknowledged_by_name:
                    result.acknowledgedByName ?? userName,
                }
              : r,
          ),
        );
        toast.success("Acknowledged");
      } catch (e) {
        // Roll back optimistic change
        setRecords((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  rep_docs_acknowledged_at: null,
                  rep_docs_acknowledged_by_name: null,
                }
              : r,
          ),
        );
        toast.error(e instanceof Error ? e.message : "Acknowledge failed");
      }
    },
    [userName],
  );

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
    <div suppressHydrationWarning>
      <AppHeader
        title="Representative Docs"
        subtitle={`${totalFiltered} records`}
      />
      <div className="flex min-w-0 flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:p-6">
        <DashboardNav userRole={userRole} />

        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "h-8 gap-1.5 text-xs",
              "bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 hover:border-sky-300",
              "dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800 dark:hover:bg-sky-950/50 dark:hover:border-sky-700",
              "disabled:opacity-60 disabled:cursor-not-allowed",
            )}
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh table data without losing scroll, filters, or sort"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs relative"
            onClick={() => setShowChanges(true)}
          >
            <Bell className="h-3.5 w-3.5" />
            Changes
            {changeCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {changeCount > 99 ? "99+" : changeCount}
              </span>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setShowWithdrawn(true)}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Withdrawn ({stats.withdrawn})
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setShowActivityLog(true)}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Activity Log
          </Button>
          {userRole === "system_admin" && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setShowImport(true)}
            >
              📥 Import CSV
            </Button>
          )}
        </div>

        {/* Stat Cards */}
        <StatCardGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
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
          <StatCard
            label="Not Assigned"
            value={stats.notAssigned}
            gradient="from-orange-400 to-red-500"
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
              <option value="__none__">— Not Assigned —</option>
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

        {/* Filter summary banner */}
        {hasActiveFilters && breakdown && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs dark:border-blue-900 dark:bg-blue-950/30">
            <span className="font-semibold text-blue-700 dark:text-blue-300">
              Filtered:
            </span>
            <span className="font-bold text-blue-900 dark:text-blue-100 tabular-nums">
              {breakdown.total} record{breakdown.total === 1 ? "" : "s"}
            </span>
            {(() => {
              const chips: { label: string; value: number; cls: string }[] = [
                {
                  label: "Not Started",
                  value: breakdown.notStarted,
                  cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
                },
                {
                  label: "Incomplete",
                  value: breakdown.incomplete,
                  cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
                },
                {
                  label: "Complete",
                  value: breakdown.complete,
                  cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
                },
                {
                  label: "Withdrawn",
                  value: breakdown.withdrawn,
                  cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
                },
                {
                  label: "Not Assigned",
                  value: breakdown.notAssigned,
                  cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
                },
              ];
              return chips
                .filter((c) => c.value > 0)
                .map((c) => (
                  <span
                    key={c.label}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold tabular-nums",
                      c.cls,
                    )}
                  >
                    {c.label}: {c.value}
                  </span>
                ));
            })()}
          </div>
        )}

        {/* Pagination bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
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
              onClick={() => handlePageChange(page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <select
              className={SEL + " min-w-20"}
              value={String(page)}
              onChange={(e) => handlePageChange(Number(e.target.value))}
              disabled={isPending || totalPages <= 1}
            >
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <option key={p} value={String(p)}>
                  Page {p} / {totalPages}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page >= totalPages || isPending}
              onClick={() => handlePageChange(page + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <select
              className={SEL + " min-w-22"}
              value={String(pageSize)}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              disabled={isPending}
            >
              {[25, 50, 100, 200, 500].map((s) => (
                <option key={s} value={String(s)}>
                  {s} / page
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table — virtualized, with frozen columns */}
        <RepDocsTable
          records={records}
          assignees={assignees}
          ohoAssignees={ohoAssignees}
          isPending={isPending}
          onField={handleField}
          onLink={handleLink}
          onAcknowledge={handleAcknowledge}
          onRowClick={(row) => setSelectedRow(row)}
          onNotesClick={(row, rect) => {
            setNotesRow(row);
            setNotesAnchorRect(rect);
          }}
          scrollRef={tableScrollRef}
        />

        {/* Bottom scroll hint */}
        <div className="hidden items-center gap-2 text-[10px] text-muted-foreground md:flex">
          <span>Shift + scroll to pan right</span>
          <span className="text-border">|</span>
          <span>First 6 columns frozen</span>
        </div>

        {showImport && (
          <RepDocsImportModal
            onClose={() => setShowImport(false)}
            onSuccess={() => {
              setShowImport(false);
              reload({ page: 1 });
            }}
          />
        )}

        {showActivityLog && (
          <ActivityLogModal
            onClose={() => setShowActivityLog(false)}
            title="📋 Representative Docs Activity Log"
            ackScope="rep_docs"
            tabs={[
              {
                key: "all",
                label: "All Changes",
                actions: [
                  "rep_docs_field_updated",
                  "rep_docs_imported",
                  "field_updated",
                  "hearing_link_updated_from_repdocs",
                  "rep_assigned",
                  "rep_unassigned",
                  "rep_auto_assigned",
                ],
              },
              {
                key: "status",
                label: "Status / Decision",
                actions: ["field_updated", "rep_docs_imported"],
              },
              {
                key: "field",
                label: "Field Updates",
                actions: [
                  "rep_docs_field_updated",
                  "hearing_link_updated_from_repdocs",
                ],
              },
              {
                key: "ack",
                label: "Acknowledgement",
                actions: [],
                mode: "ack_events",
              },
            ]}
          />
        )}

        {showWithdrawn && (
          <RepDocsWithdrawnModal onClose={() => setShowWithdrawn(false)} />
        )}

        <RepDocsDetailPanel
          row={selectedRow}
          assignees={assignees}
          ohoAssignees={ohoAssignees}
          onClose={() => setSelectedRow(null)}
          onOpenNotes={(r) => {
            // Position notes panel to the left of the detail panel
            const panelLeft = window.innerWidth - 448; // max-w-md ≈ 448px
            const rect = new DOMRect(
              panelLeft - 8,
              window.innerHeight / 2 - 120,
              0,
              0,
            );
            setNotesRow(r);
            setNotesAnchorRect(rect);
          }}
        />

        <RepDocsNotesPanel
          row={notesRow}
          anchorRect={notesAnchorRect}
          onClose={() => {
            setNotesRow(null);
            setNotesAnchorRect(null);
          }}
          onSaved={(id, notes) => {
            updateLocal(id, { notes });
            // Also update notesRow so the panel reflects the latest
            setNotesRow((prev) =>
              prev && prev.id === id ? { ...prev, notes } : prev,
            );
          }}
          userName={userName}
        />

        {showChanges && (
          <RepDocsChangesModal
            onClose={() => setShowChanges(false)}
            onRefreshPage={() => reload()}
            lastSeenAt={lastSeenAt}
            onMarkSeen={(ts) => {
              setLastSeenAt(ts);
              localStorage.setItem("rep-docs-changes-seen-at", ts);
              setChangeCount(0);
            }}
            assigneeNames={assigneeNames}
          />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// RepDocsTable — frozen columns + virtualized rows
// ══════════════════════════════════════════════════════════════

interface FrozenCol {
  key: string;
  label: string;
  w: number;
  left: number;
}

// Cumulative left offsets computed once:
// Date 80 | Claimant 160 | SSN 62 | Rep 130 | Assigned 130 | Status 90
const FROZEN_COLS: FrozenCol[] = [
  { key: "hearing_date", label: "Date", w: 80, left: 0 },
  { key: "claimant", label: "Claimant", w: 160, left: 80 },
  { key: "ssn_last_4", label: "SSN", w: 62, left: 240 },
  { key: "representative", label: "Rep", w: 130, left: 302 },
  { key: "assigned_to", label: "Assigned To", w: 130, left: 432 },
  { key: "overall_status", label: "Status", w: 90, left: 562 },
];
const FROZEN_TOTAL_W = 652; // 80+160+62+130+130+90
const LAST_FROZEN_KEY = "overall_status";

const OHO_W = 110;
const CHECKER_STATUS_W = 100;
const WORKFLOW_CELL_W = 72;
const CHECKER_CELL_W = 72;
// Width of the "14d Mark" column (date 14 days before hearing_date) — sits at
// the start of the scrollable area, right after the frozen Status column.
const TFOURTEEN_W = 88;

// Compute the date string 14 days before the given hearing date. Returns "" if
// the input is invalid.
function fmtMinus14(dateStr: string | null): string {
  if (!dateStr) return "";
  // Pin to noon to avoid timezone drift on date-only strings.
  const input = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? dateStr + "T12:00:00"
    : dateStr;
  const d = new Date(input);
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() - 14);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function RepDocsTable({
  records,
  assignees,
  ohoAssignees,
  isPending,
  onField,
  onLink,
  onAcknowledge,
  onRowClick,
  onNotesClick,
  scrollRef,
}: {
  records: RepDocsRow[];
  assignees: RepDocsAssigneeOption[];
  ohoAssignees: RepDocsAssigneeOption[];
  isPending: boolean;
  onField: (id: number, field: string, value: string | boolean | null) => void;
  onLink: (id: number, field: string, value: string | null) => void;
  onAcknowledge: (id: number) => void;
  onRowClick: (row: RepDocsRow) => void;
  onNotesClick: (row: RepDocsRow, rect: DOMRect) => void;
  /** Lifted scroll-container ref so the parent can preserve scroll on refresh. */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  // 44 (original) — acknowledge badge sits beside the assignee dropdown,
  // with name/date stacked compactly inside the badge itself.
  const ROW_H = 44;

  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 10,
    // Real row heights diverge from ROW_H (44px) when rows wrap (long
    // claimant names, multi-line acknowledge badges, etc.). Without
    // measureElement, the virtualizer keeps the 44px estimate and the
    // position deltas cascade as new rows mount during scroll — the
    // visible "shake." This callback hands real heights back so positions
    // stabilize after the first measurement.
    measureElement: (el) => el?.getBoundingClientRect().height ?? ROW_H,
  });

  const totalWidth =
    FROZEN_TOTAL_W +
    TFOURTEEN_W +
    WORKFLOW_COLUMNS.length * WORKFLOW_CELL_W +
    OHO_W +
    CHECKER_COLUMNS.length * CHECKER_CELL_W +
    CHECKER_STATUS_W;

  const headerBg = "bg-zinc-100 dark:bg-zinc-900";

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-lg border",
        isPending && "opacity-50 pointer-events-none",
      )}
    >
      <div
        ref={(node) => {
          (
            parentRef as React.MutableRefObject<HTMLDivElement | null>
          ).current = node;
          if (scrollRef) scrollRef.current = node;
        }}
        className="overflow-x-auto overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 340px)" }}
        onWheel={(e) => {
          if (e.shiftKey) {
            e.currentTarget.scrollLeft += e.deltaY;
            e.preventDefault();
          }
        }}
      >
        <table
          className="border-collapse text-sm"
          style={{ width: "max(100%, " + totalWidth + "px)" }}
        >
          <thead className="sticky top-0 z-30">
            <tr>
              {FROZEN_COLS.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "h-10 whitespace-nowrap border-b-2 border-border px-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground/80 sticky z-20",
                    headerBg,
                    col.key === LAST_FROZEN_KEY &&
                      "border-r-2 border-r-blue-400/40 dark:border-r-blue-500/40",
                  )}
                  style={{
                    width: col.w,
                    minWidth: col.w,
                    maxWidth: col.w,
                    left: col.left,
                  }}
                >
                  {col.label}
                </th>
              ))}
              <th
                className={cn(
                  "h-10 whitespace-nowrap border-b-2 border-border px-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground/80",
                  headerBg,
                )}
                style={{ width: TFOURTEEN_W, minWidth: TFOURTEEN_W }}
                title="14 days before the hearing date — prep deadline marker"
              >
                14d Mark
              </th>
              {WORKFLOW_COLUMNS.map((c) => (
                <th
                  key={c.key as string}
                  className={cn(
                    "h-10 whitespace-nowrap border-b-2 border-border px-2 text-center text-[11px] font-bold uppercase tracking-wide text-foreground/80",
                    headerBg,
                  )}
                  style={{ width: WORKFLOW_CELL_W, minWidth: WORKFLOW_CELL_W }}
                  title={c.label}
                >
                  {c.shortLabel}
                </th>
              ))}
              <th
                className={cn(
                  "h-10 whitespace-nowrap border-b-2 border-border px-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground/80",
                  headerBg,
                )}
                style={{ width: OHO_W, minWidth: OHO_W }}
              >
                OHO Assigned
              </th>
              {CHECKER_COLUMNS.map((c) => (
                <th
                  key={c.key as string}
                  className={cn(
                    "h-10 whitespace-nowrap border-b-2 border-border px-2 text-center text-[11px] font-bold uppercase tracking-wide text-foreground/80",
                    headerBg,
                  )}
                  style={{ width: CHECKER_CELL_W, minWidth: CHECKER_CELL_W }}
                  title={c.label}
                >
                  {c.shortLabel}
                </th>
              ))}
              <th
                className={cn(
                  "h-10 whitespace-nowrap border-b-2 border-border px-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground/80",
                  headerBg,
                )}
                style={{ width: CHECKER_STATUS_W, minWidth: CHECKER_STATUS_W }}
              >
                Chk Status
              </th>
              {/* <th
                className={cn("h-10 border-b-2 border-border w-full", headerBg)}
                style={{ minWidth: 0 }}
                aria-hidden="true"
              /> */}
              <th
                className={cn(
                  "h-10 whitespace-nowrap border-b-2 border-border px-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground/80 w-full",
                  headerBg,
                )}
                style={{ minWidth: 32 }}
              >
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td
                  colSpan={
                    FROZEN_COLS.length +
                    1 + // 14d Mark
                    WORKFLOW_COLUMNS.length +
                    1 +
                    CHECKER_COLUMNS.length +
                    2
                  }
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  No records found.
                </td>
              </tr>
            ) : (
              <>
                {(virtualizer.getVirtualItems()[0]?.start ?? 0) > 0 && (
                  <tr>
                    <td
                      colSpan={
                        FROZEN_COLS.length +
                        WORKFLOW_COLUMNS.length +
                        1 +
                        CHECKER_COLUMNS.length +
                        2
                      }
                      style={{
                        height: virtualizer.getVirtualItems()[0]?.start ?? 0,
                        padding: 0,
                        border: "none",
                      }}
                    />
                  </tr>
                )}
                {virtualizer.getVirtualItems().map((vRow) => {
                  const r = records[vRow.index];
                  return (
                    <RepDocsRowView
                      key={r.id}
                      row={r}
                      ri={vRow.index}
                      rowRef={virtualizer.measureElement}
                      dataIndex={vRow.index}
                      assignees={assignees}
                      ohoAssignees={ohoAssignees}
                      onField={onField}
                      onLink={onLink}
                      onAcknowledge={onAcknowledge}
                      onRowClick={onRowClick}
                      onNotesClick={onNotesClick}
                    />
                  );
                })}
                {(() => {
                  const items = virtualizer.getVirtualItems();
                  const lastEnd = items[items.length - 1]?.end ?? 0;
                  const remaining = virtualizer.getTotalSize() - lastEnd;
                  return remaining > 0 ? (
                    <tr>
                      <td
                        colSpan={
                          FROZEN_COLS.length +
                          WORKFLOW_COLUMNS.length +
                          1 +
                          CHECKER_COLUMNS.length +
                          2
                        }
                        style={{
                          height: remaining,
                          padding: 0,
                          border: "none",
                        }}
                      />
                    </tr>
                  ) : null;
                })()}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Row view — memoized to avoid re-rendering unchanged rows during scroll.
const RepDocsRowView = memo(
  function RepDocsRowView({
    row,
    ri,
    assignees,
    ohoAssignees,
    onField,
    onLink,
    onAcknowledge,
    onRowClick,
    onNotesClick,
    rowRef,
    dataIndex,
  }: {
    row: RepDocsRow;
    ri: number;
    assignees: RepDocsAssigneeOption[];
    ohoAssignees: RepDocsAssigneeOption[];
    onField: (
      id: number,
      field: string,
      value: string | boolean | null,
    ) => void;
    onLink: (id: number, field: string, value: string | null) => void;
    onAcknowledge: (id: number) => void;
    onRowClick: (row: RepDocsRow) => void;
    onNotesClick: (row: RepDocsRow, rect: DOMRect) => void;
    // Virtualizer ref + index — pass through from the parent so the
    // virtualizer can measure this row's real height after mount.
    rowRef?: (el: HTMLTableRowElement | null) => void;
    dataIndex: number;
  }) {
    const isWithdrawn =
      (row.overall_status || "").toLowerCase() === "withdrawn";

    // Withdrawn rows keep the existing red tint as the "this is withdrawn"
    // signal. The disabled-edit affordance comes from the row opacity +
    // disabled inline controls below, not from a color swap.
    const evenBg = isWithdrawn
      ? "bg-red-50 dark:bg-red-950/30"
      : ri % 2 === 0
        ? "bg-white dark:bg-zinc-950"
        : "bg-zinc-50 dark:bg-zinc-900";
    const getFrozen = (key: string) => FROZEN_COLS.find((c) => c.key === key)!;

    const stickyCell = (key: string) => {
      const col = getFrozen(key);
      return {
        className: cn(
          "px-2 py-1.5 sticky z-10 overflow-hidden",
          evenBg,
          key === LAST_FROZEN_KEY &&
            "border-r-2 border-r-blue-400/40 dark:border-r-blue-500/40",
        ),
        style: {
          width: col.w,
          minWidth: col.w,
          maxWidth: col.w,
          left: col.left,
        } as React.CSSProperties,
      };
    };

    return (
      <tr
        ref={rowRef}
        data-index={dataIndex}
        className={cn(
          "border-b border-border/40 last:border-0 cursor-pointer",
          evenBg,
          // Greyed-out look for withdrawn — muted text + slight opacity
          // signal "view-only". Editable controls inside are also disabled
          // (see passes below).
          isWithdrawn && "text-muted-foreground opacity-75",
          // Hover overlay (matches PHD / dashboard). Applied to every
          // direct <td> child via arbitrary-variant so we don't have to
          // touch each cell individually. Inset box-shadow paints a
          // translucent blue layer on top of the cell's existing bg.
          "[&>td]:transition-shadow [&>td]:duration-150",
          "hover:[&>td]:shadow-[inset_0_0_0_9999px_rgb(59_130_246/0.10)]",
          "dark:hover:[&>td]:shadow-[inset_0_0_0_9999px_rgb(96_165_250/0.18)]",
        )}
        onClick={(e) => {
          const tag = (e.target as HTMLElement).tagName;
          if (
            [
              "INPUT",
              "SELECT",
              "OPTION",
              "BUTTON",
              "A",
              "SVG",
              "PATH",
            ].includes(tag)
          )
            return;
          onRowClick(row);
        }}
      >
        {/* Date */}
        <td {...stickyCell("hearing_date")}>
          <span className="text-xs tabular-nums">
            {formatDate(row.hearing_date)}
          </span>
        </td>
        {/* Claimant */}
        <td {...stickyCell("claimant")}>
          <ClaimantCell row={row} editable={!isWithdrawn} onSave={onLink} />
        </td>
        {/* SSN */}
        <td {...stickyCell("ssn_last_4")}>
          <span className="text-xs font-mono text-muted-foreground">
            {row.ssn_last_4 ? row.ssn_last_4 : "-"}
          </span>
        </td>
        {/* Rep */}
        <td {...stickyCell("representative")}>
          <RepBadge row={row} />
        </td>
        {/* Assigned To */}
        <td {...stickyCell("assigned_to")}>
          {(() => {
            const selectedAssignee = assignees.find(
              (a) => a.name === row.assigned_to,
            );
            const bgColor = selectedAssignee?.bg_color;
            const isAcknowledged = !!row.rep_docs_acknowledged_at;
            const ackName = row.rep_docs_acknowledged_by_name?.trim() || "";
            const ackDate = row.rep_docs_acknowledged_at
              ? formatDate(row.rep_docs_acknowledged_at)
              : "";
            // Acknowledgement only applies to hearings from May 2026 onwards;
            // older rows don't show a button or badge in this slot.
            const ackEligible =
              !!row.hearing_date && row.hearing_date >= "2026-05-01";
            return (
              <div className="flex items-start gap-1">
                <select
                  className={cn(
                    "h-6 min-w-0 flex-1 rounded border border-transparent px-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400 hover:border-border",
                    isWithdrawn
                      ? "cursor-not-allowed opacity-70"
                      : "cursor-pointer",
                  )}
                  value={row.assigned_to ?? ""}
                  disabled={isWithdrawn}
                  style={
                    bgColor
                      ? {
                          backgroundColor: bgColor,
                          color: isLight(bgColor) ? "#1f2937" : "#fff",
                        }
                      : undefined
                  }
                  onChange={(e) =>
                    onField(row.id, "assigned_to", e.target.value || null)
                  }
                >
                  <option
                    value=""
                    style={{ backgroundColor: "white", color: "#333" }}
                  >
                    —
                  </option>
                  {assignees.map((a) => (
                    <option
                      key={a.name}
                      value={a.name}
                      style={{ backgroundColor: "white", color: "#333" }}
                    >
                      {a.name}
                    </option>
                  ))}
                </select>
                {!ackEligible ? null : isAcknowledged ? (
                  <div
                    title={`Acknowledged by ${ackName || "Unknown"}${ackDate ? ` on ${ackDate}` : ""}`}
                    className="flex w-14 shrink-0 flex-col items-center rounded-sm bg-green-100 px-0.5 py-0.5 leading-tight text-green-800 dark:bg-green-900/40 dark:text-green-300"
                  >
                    <span className="text-[10px] font-bold leading-none">
                      ✓
                    </span>
                    <span className="w-full truncate text-center text-[8px] leading-tight">
                      {ackName || "Acked"}
                    </span>
                    {ackDate && (
                      <span className="w-full truncate text-center text-[8px] leading-tight opacity-80">
                        {ackDate}
                      </span>
                    )}
                  </div>
                ) : isWithdrawn ? null : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAcknowledge(row.id);
                    }}
                    title="Acknowledge — confirms you've seen this and will start"
                    className="h-6 shrink-0 rounded-sm border border-blue-400 bg-blue-50 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-blue-700 hover:bg-blue-100 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                  >
                    Ack
                  </button>
                )}
              </div>
            );
          })()}
        </td>
        {/* Status */}
        <td {...stickyCell("overall_status")}>
          <StatusBadge status={row.overall_status} />
        </td>

        {/* 14d Mark — date 14 days before the hearing date */}
        <td
          className={cn("px-2 py-1.5", evenBg)}
          style={{ width: TFOURTEEN_W, minWidth: TFOURTEEN_W }}
          title="14 days before the hearing date — prep deadline marker"
        >
          <span className="text-xs tabular-nums text-muted-foreground">
            {fmtMinus14(row.hearing_date)}
          </span>
        </td>

        {/* Workflow checkboxes */}
        {WORKFLOW_COLUMNS.map((c) => {
          const checked = Boolean(row[c.key]);
          const ts = row[c.atKey] as string | null;
          return (
            <td
              key={c.key as string}
              className={cn("px-2 py-1.5 text-center", evenBg)}
              style={{ width: WORKFLOW_CELL_W, minWidth: WORKFLOW_CELL_W }}
            >
              <div className="flex flex-col items-center gap-0.5">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isWithdrawn}
                  onChange={(e) =>
                    onField(row.id, c.key as string, e.target.checked)
                  }
                  className={cn(
                    "h-4 w-4 accent-emerald-600 rounded",
                    isWithdrawn
                      ? "cursor-not-allowed opacity-60"
                      : "cursor-pointer",
                  )}
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
          className={cn("px-2 py-1.5", evenBg)}
          style={{ width: OHO_W, minWidth: OHO_W }}
        >
          {(() => {
            const selectedOho = ohoAssignees.find(
              (a) => a.name === row.oho_assigned_to,
            );
            const bgColor = selectedOho?.bg_color;
            return (
              <select
                className={cn(
                  "h-6 w-full rounded border border-transparent px-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400 hover:border-border",
                  isWithdrawn
                    ? "cursor-not-allowed opacity-70"
                    : "cursor-pointer",
                )}
                value={row.oho_assigned_to ?? ""}
                disabled={isWithdrawn}
                style={
                  bgColor
                    ? {
                        backgroundColor: bgColor,
                        color: isLight(bgColor) ? "#1f2937" : "#fff",
                      }
                    : undefined
                }
                onChange={(e) =>
                  onField(row.id, "oho_assigned_to", e.target.value || null)
                }
              >
                <option
                  value=""
                  style={{ backgroundColor: "white", color: "#333" }}
                >
                  —
                </option>
                {ohoAssignees.map((a) => (
                  <option
                    key={a.name}
                    value={a.name}
                    style={{ backgroundColor: "white", color: "#333" }}
                  >
                    {a.name}
                  </option>
                ))}
              </select>
            );
          })()}
        </td>

        {/* Checker checkboxes */}
        {CHECKER_COLUMNS.map((c) => (
          <td
            key={c.key as string}
            className={cn("px-2 py-1.5 text-center", evenBg)}
            style={{ width: CHECKER_CELL_W, minWidth: CHECKER_CELL_W }}
          >
            <input
              type="checkbox"
              checked={Boolean(row[c.key])}
              disabled={isWithdrawn}
              onChange={(e) =>
                onField(row.id, c.key as string, e.target.checked)
              }
              className={cn(
                "h-4 w-4 accent-blue-600 rounded",
                isWithdrawn
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer",
              )}
            />
          </td>
        ))}

        {/* Checker Status — auto-computed, read-only */}
        <td
          className={cn("px-2 py-1.5", evenBg)}
          style={{ width: CHECKER_STATUS_W, minWidth: CHECKER_STATUS_W }}
        >
          {(() => {
            const cfg = CHECKER_STATUS_CONFIG.find(
              (s) =>
                s.value.toLowerCase() ===
                (row.checker_status || "").toLowerCase(),
            );
            return cfg ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold",
                  cfg.badgeClass,
                )}
              >
                {cfg.label}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            );
          })()}
        </td>

        {/* Notes button */}
        <td
          className={cn("px-1 py-1.5 text-center", evenBg)}
          style={{ width: 32, minWidth: 32 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNotesClick(row, e.currentTarget.getBoundingClientRect());
            }}
            className={cn(
              "rounded p-1 transition-colors",
              row.notes && Array.isArray(row.notes) && row.notes.length > 0
                ? "text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                : "text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30",
            )}
            title={
              row.notes && Array.isArray(row.notes) && row.notes.length > 0
                ? "View / edit notes"
                : "Add notes"
            }
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </button>
        </td>

        {/* Filler — absorbs extra width so columns stay fixed.
            Carry the row's zebra stripe so the right gap doesn't show as a
            white slab when the container is wider than the table content. */}
        <td
          className={cn(evenBg, "w-full")}
          style={{ minWidth: 0 }}
          aria-hidden="true"
        />
      </tr>
    );
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.ri === next.ri &&
    prev.assignees === next.assignees &&
    prev.ohoAssignees === next.ohoAssignees &&
    prev.onRowClick === next.onRowClick,
);

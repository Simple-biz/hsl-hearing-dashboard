"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { AppHeader } from "@/components/layout";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { StatCard, StatCardGrid } from "@/components/stat-card";
import type { UserRole } from "@/lib/roles";
import { resolveFieldAccess } from "@/lib/field-access";
import * as XLSX from "xlsx";
import {
  fetchPostHrgDevPage,
  fetchPostHrgDevStats,
  fetchPostHrgRecordTypeCounts,
  createPostHrgDevRecord,
  updatePostHrgDevField,
  acknowledgePostHrgDevRecord,
  importPostHrgDevRecords,
  addPostHrgDevNote,
  deletePostHrgDevNote,
  fetchPostHrgDevNotes,
  type PostHrgDevRow,
  type PostHrgDevStats,
  type PostHrgRecordType,
  type PostHrgRecordTypeCounts,
  type ConfigOption,
  type RepOption,
  type ResponsibleOption,
} from "./actions";
import { PostHrgDetailPanel } from "./post-hrg-detail-panel";
import { PostHrgActivityModal } from "@/components/modals/post-hrg-activity-modal";
import { PostHrgReviewModal } from "@/components/modals/post-hrg-review-modal";
import { PostHrgCompletedModal } from "@/components/modals/post-hrg-completed-modal";
import {
  ClipboardList,
  Check,
  BarChart3,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { PostHrgReportsModal } from "@/components/modals/post-hrg-reports-modal";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SheetData {
  name: string;
  headers: string[];
  rows: unknown[][];
  comments?: Record<string, string>;
}

interface PostHrgNote {
  user: string;
  date: string;
  note: string;
}

type ViewMode = "dashboard" | "import";
type SortDir = "asc" | "desc";

// ─── Note helpers ───────────────────────────────────────────────────────────

function parseNotes(raw: string | null): PostHrgNote[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed))
      return raw ? [{ user: "System", date: "", note: raw }] : [];
    return parsed.map((item: Record<string, unknown>) => ({
      user: String(item.user ?? item.author ?? item.author_name ?? "Unknown"),
      date: String(item.date ?? item.created_at ?? ""),
      note: String(item.note ?? item.content ?? ""),
    }));
  } catch {
    return raw ? [{ user: "System", date: "", note: raw }] : [];
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "Pending", label: "Pending" },
  { value: "In Progress", label: "In Progress" },
  { value: "Completed", label: "Completed" },
  { value: "On Hold", label: "On Hold" },
  { value: "Cancelled", label: "Cancelled" },
];

const DOCS_NEEDED_OPTIONS = [
  { value: "Medical Records", label: "Medical Records" },
  { value: "Vocational Report", label: "Vocational Report" },
  { value: "RFC Form", label: "RFC Form" },
  { value: "Brief", label: "Brief" },
  { value: "Other", label: "Other" },
];

const STATUS_HEX: Record<string, { bg: string; color: string }> = {
  Pending: { bg: "#FEF3C7", color: "#92400E" },
  "In Progress": { bg: "#DBEAFE", color: "#1E40AF" },
  Completed: { bg: "#D1FAE5", color: "#065F46" },
  "On Hold": { bg: "#F3F4F6", color: "#374151" },
  Cancelled: { bg: "#FEE2E2", color: "#991B1B" },
};

const PH_STATUS_HEX: Record<string, { bg: string; color: string }> = {
  "Pending Decision": { bg: "#FEF3C7", color: "#92400E" },
  Favorable: { bg: "#D1FAE5", color: "#065F46" },
  "Partially Favorable": { bg: "#DBEAFE", color: "#1E40AF" },
  Unfavorable: { bg: "#FEE2E2", color: "#991B1B" },
  Remand: { bg: "#EDE9FE", color: "#5B21B6" },
  Dismissed: { bg: "#F3F4F6", color: "#374151" },
};

// ─── Indicator (color-coded row flag) ──────────────────────────────────────

const INDICATOR_OPTIONS: {
  value: string;
  label: string;
  color: string;
  ring: string;
}[] = [
  {
    value: "green",
    label: "Need to check / monitor",
    color: "#39FF14",
    ring: "ring-[#39FF14]",
  },
  {
    value: "yellow",
    label: "CE's that need response",
    color: "#FACC15",
    ring: "ring-yellow-400",
  },
  {
    value: "blue",
    label: "Normal CE's",
    color: "#93C5FD",
    ring: "ring-blue-300",
  },
  {
    value: "gray",
    label: "Assigned to Charlotte",
    color: "#9CA3AF",
    ring: "ring-gray-400",
  },
  {
    value: "orange",
    label: "Assigned to Esther",
    color: "#FB923C",
    ring: "ring-orange-400",
  },
];

function getIndicatorColor(value: string | null): string | null {
  if (!value) return null;
  return INDICATOR_OPTIONS.find((o) => o.value === value)?.color ?? null;
}

// Pick a readable text color for a filled badge against `hex`.
// Uses the perceived-luminance formula (rec. 601 weights). Light fills get
// dark slate text; dark fills get white. Keeps status pills legible even when
// the configured option color is itself a pale pastel.
function deriveBadgeColors(hex: string): { bg: string; color: string } {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return { bg: hex, color: "#111827" };
  }
  const isLight = (r * 299 + g * 587 + b * 114) / 1000 > 180;
  return { bg: hex, color: isLight ? "#1F2937" : "#ffffff" };
}

// True when `createdAt` is the same calendar day as "now" in the user's local
// timezone. Drives the NEW badge and the soft-blue row tint for fresh rows.
// Refreshes naturally on next page load — no midnight timer needed.
function isCreatedToday(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return false;
  const now = new Date();
  return (
    created.getFullYear() === now.getFullYear() &&
    created.getMonth() === now.getMonth() &&
    created.getDate() === now.getDate()
  );
}

function IndicatorDot({
  value,
  onChange,
  isAdmin,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const color = getIndicatorColor(value);

  // Position the portal dropdown relative to the button
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left + rect.width / 2 });
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!isAdmin && !color) {
    return <span className="block w-3 h-3" />;
  }

  return (
    <>
      <div className="flex items-center justify-center">
        <button
          ref={btnRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isAdmin) setOpen((p) => !p);
          }}
          className={cn(
            "w-3.5 h-3.5 rounded-full border transition-all shrink-0",
            color
              ? "border-transparent ring-1 ring-offset-1"
              : "border-2 border-dashed border-primary/50 bg-primary/5 hover:border-primary hover:bg-primary/15",
            isAdmin && "cursor-pointer",
            !isAdmin && "cursor-default",
          )}
          style={
            color
              ? { backgroundColor: color, boxShadow: `0 0 0 1px ${color}40` }
              : undefined
          }
          title={
            value
              ? (INDICATOR_OPTIONS.find((o) => o.value === value)?.label ?? "")
              : isAdmin
                ? "Set indicator"
                : ""
          }
        />
      </div>
      {open &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-100 rounded-lg border bg-card p-1.5 shadow-lg min-w-45"
            style={{
              top: pos.top,
              left: pos.left,
              transform: "translateX(-50%)",
            }}
          >
            {INDICATOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(opt.value === value ? null : opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-muted",
                  value === opt.value && "bg-muted font-semibold",
                )}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0 ring-1 ring-offset-1"
                  style={{
                    backgroundColor: opt.color,
                    boxShadow: `0 0 0 1px ${opt.color}40`,
                  }}
                />
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
            {value && (
              <>
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(null);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted transition-colors"
                >
                  <span className="w-3 h-3 rounded-full shrink-0 border border-dashed border-muted-foreground/40" />
                  <span>Remove indicator</span>
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

const IMPORT_FIELD_MAP: Record<string, string[]> = {
  claimant: ["claimant's name", "claimant name", "claimant", "name", "client"],
  hearing_date: ["hearing date", "date", "hearing_date", "hrg date"],
  post_hearing_status: [
    "post hearing status",
    "post_hearing_status",
    "ph status",
    "decision",
  ],
  type_of_docs_needed: [
    "type of documents needed",
    "type_of_docs_needed",
    "docs needed",
    "documents needed",
  ],
  details: ["details", "detail"],
  assigned_rep: [
    "assigned rep",
    "assigned_rep",
    "rep",
    "representative",
    "attorney",
  ],
  person_responsible: [
    "person responsible for phi",
    "person responsible",
    "person_responsible",
    "phi person",
    "responsible",
  ],
  em_sent_task_created: [
    "em sent/task created",
    "em sent",
    "em_sent_task_created",
    "task created",
  ],
  ext_letter_sent: [
    "ext letter sent",
    "ext_letter_sent",
    "ext letter",
    "extension letter",
  ],
  status: ["status"],
  deadline: ["deadline", "due date"],
  remarks: ["remarks", "notes", "comment", "comments"],
};

function autoMapImport(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const norm = headers.map((h) => h.toLowerCase().trim());
  for (const [field, aliases] of Object.entries(IMPORT_FIELD_MAP)) {
    for (const alias of aliases) {
      const idx = norm.indexOf(alias);
      if (idx !== -1 && !Object.values(mapping).includes(idx)) {
        mapping[field] = idx;
        break;
      }
    }
  }
  return mapping;
}

// ─── Rep Badge (read-only, mirrors representative-docs-client) ─────────────

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

function RepBadge({ record }: { record: PostHrgDevRow }) {
  const repName = record.representative_name || record.assigned_rep;
  if (!repName) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const isInternal =
    record.rep_type === "in-house" || record.rep_type === "internal_advocates";
  const icon = isInternal ? "\u{1F3E0}" : "\u{1F4CB}";
  const colorClass =
    REP_BADGE_COLORS[record.rep_type || ""] || "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold",
        colorClass,
      )}
      title={repName}
    >
      {icon} {repName}
    </span>
  );
}

// ─── Styling ────────────────────────────────────────────────────────────────

const BTN =
  "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg border-none cursor-pointer transition-all duration-150";
const BTN_PRIMARY = cn(
  BTN,
  "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed",
);
const BTN_SECONDARY = cn(BTN, "bg-muted text-foreground hover:bg-muted/80");
const BTN_SUCCESS = cn(
  BTN,
  "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed",
);
const BTN_OUTLINE = cn(
  BTN,
  "bg-transparent border border-border text-foreground hover:bg-muted",
);
const CARD = "rounded-xl border bg-card p-6 shadow-sm";
const INPUT =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";
const SELECT_CLS = INPUT;

// ─── Inline components ─────────────────────────────────────────────────────

function InlineDropdown({
  value,
  options,
  onSave,
  hexColorMap,
  placeholder = "-",
}: {
  value: string | null;
  options: { value: string; label: string }[];
  onSave: (v: string | null) => void;
  hexColorMap?: Record<string, { bg: string; color: string }>;
  placeholder?: string;
}) {
  const currentLabel =
    options.find((o) => o.value === String(value ?? ""))?.label || null;
  const currentHex =
    hexColorMap && currentLabel ? hexColorMap[currentLabel] : null;
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onSave(e.target.value || null)}
      style={
        currentHex
          ? { backgroundColor: currentHex.bg, color: currentHex.color }
          : undefined
      }
      className={cn(
        "h-6 w-full rounded border px-1 text-[11px] font-semibold cursor-pointer",
        "transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400/60",
        currentHex
          ? "border-transparent shadow-sm hover:brightness-110 hover:shadow-md"
          : "border-transparent hover:border-border hover:bg-muted/40 text-foreground bg-card",
      )}
    >
      <option value="" style={{ backgroundColor: "white", color: "#333" }}>
        {placeholder}
      </option>
      {options.map((o) => (
        <option
          key={o.value}
          value={o.value}
          style={{ backgroundColor: "white", color: "#333" }}
        >
          {o.label}
        </option>
      ))}
    </select>
  );
}

function InlineCheck({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
        className={cn(
          "h-4 w-4 rounded accent-green-600 cursor-pointer",
          "transition-transform duration-100 hover:scale-110 focus:scale-110",
        )}
      />
    </div>
  );
}

// ─── Legend Tooltip ─────────────────────────────────────────────────────────

function LegendTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "h-5 w-5 rounded-full border-2 text-[10px] font-bold flex items-center justify-center transition-colors",
          open
            ? "border-primary bg-primary text-primary-foreground"
            : "border-primary/60 bg-primary/10 text-primary hover:bg-primary/20",
        )}
      >
        ?
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50">
            <div className="rounded-xl border bg-card shadow-xl p-3 w-56">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Indicator Legend
              </p>
              <div className="space-y-1.5">
                {INDICATOR_OPTIONS.map((o) => (
                  <div key={o.value} className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 ring-1 ring-offset-1"
                      style={{
                        backgroundColor: o.color,
                        boxShadow: `0 0 0 1px ${o.color}60`,
                      }}
                    />
                    <span className="text-[11px] text-foreground">
                      {o.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-center">
              <div className="w-2 h-2 rotate-45 border-b border-r border-border bg-card -mt-1" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Inline Editable Text ───────────────────────────────────────────────────

// function InlineEditableText({
//   value,
//   onSave,
//   placeholder = "—",
//   maxWidth,
// }: {
//   value: string | null;
//   onSave: (v: string | null) => void;
//   placeholder?: string;
//   maxWidth?: string;
// }) {
//   const [editing, setEditing] = useState(false);
//   const [draft, setDraft] = useState(value || "");
//   const inputRef = useRef<HTMLTextAreaElement>(null);
//   useEffect(() => {
//     if (editing && inputRef.current) {
//       inputRef.current.focus();
//       inputRef.current.select();
//     }
//   }, [editing]);
//   const commit = () => {
//     setEditing(false);
//     const trimmed = draft.trim();
//     if (trimmed !== (value || "")) onSave(trimmed || null);
//   };
//   if (editing) {
//     return (
//       <textarea
//         ref={inputRef}
//         value={draft}
//         onChange={(e) => setDraft(e.target.value)}
//         onBlur={commit}
//         onKeyDown={(e) => {
//           if (e.key === "Enter" && !e.shiftKey) {
//             e.preventDefault();
//             commit();
//           }
//           if (e.key === "Escape") {
//             setDraft(value || "");
//             setEditing(false);
//           }
//         }}
//         className={cn(
//           "w-full min-h-7 max-h-24 rounded border border-primary/50 bg-background px-1.5 py-0.5 text-[11px] resize-y",
//           "focus:outline-none focus:ring-1 focus:ring-primary/40",
//         )}
//         rows={2}
//       />
//     );
//   }
//   return (
//     <div className="group relative">
//       <span
//         onClick={() => {
//           setDraft(value || "");
//           setEditing(true);
//         }}
//         className={cn(
//           "text-xs block truncate cursor-pointer rounded px-1 py-0.5 transition-colors",
//           "hover:bg-muted/60 hover:ring-1 hover:ring-border",
//           !value && "text-muted-foreground italic",
//         )}
//         style={{ maxWidth: maxWidth || "100%" }}
//         title={value || "Click to edit"}
//       >
//         {value || placeholder}
//       </span>
//       {value && value.length > 30 && (
//         <div
//           className={cn(
//             "absolute left-0 top-full z-50 mt-1 hidden group-hover:block",
//             "max-w-xs w-max rounded-lg border bg-popover p-3 shadow-lg",
//             "text-xs text-popover-foreground whitespace-pre-wrap wrap-break-word",
//           )}
//         >
//           {value}
//         </div>
//       )}
//     </div>
//   );
// }

// ─── Claimant Cell ──────────────────────────────────────────────────────────

const RECORD_TYPE_STYLE: Record<
  PostHrgRecordType,
  { label: string; className: string; title: string }
> = {
  MR: {
    label: "MR",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    title: "Medical / Examination record",
  },
  POST_HRG: {
    label: "POST HRG",
    className:
      "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
    title: "Post-hearing legal record (brief, memo, letter)",
  },
  REP: {
    label: "REP",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    title: "Rep-side / claimant-supplied evidence",
  },
};

function RecordTypeBadge({ type }: { type: PostHrgRecordType }) {
  const s = RECORD_TYPE_STYLE[type];
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide",
        s.className,
      )}
      title={s.title}
    >
      {s.label}
    </span>
  );
}

function ClaimantCell({
  record,
  showTypeBadge,
  isCompleted,
}: {
  record: PostHrgDevRow;
  showTypeBadge?: boolean;
  isCompleted?: boolean;
}) {
  const chronicleLink = record.chronicle_link ?? null;
  const isNew = isCreatedToday(record.created_at);

  return (
    <div className="min-w-0 pr-1">
      <div className="flex items-center gap-1 min-w-0">
        {record.claimant_link ? (
          <button
            type="button"
            onClick={() =>
              window.open(
                record.claimant_link!,
                "_blank",
                "noopener,noreferrer",
              )
            }
            className="truncate text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 text-left"
            title={record.claimant ?? undefined}
          >
            {record.claimant}
          </button>
        ) : (
          <p
            className="truncate text-xs font-medium"
            title={record.claimant ?? undefined}
          >
            {record.claimant}
          </p>
        )}
        {showTypeBadge && <RecordTypeBadge type={record.record_type} />}
        {isNew && (
          <span
            className="shrink-0 rounded-full bg-sky-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white shadow-sm"
            title="Added today"
          >
            NEW
          </span>
        )}
        {isCompleted && (
          <span
            className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white shadow-sm"
            title="Completed — view only, reopen from the Completed modal to edit"
          >
            ✓ Completed
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {record.claim_type && (
          <p className="truncate text-[10px] text-muted-foreground">
            {record.claim_type}
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
      </div>
    </div>
  );
}

// ─── Post HRG Cell Badge ────────────────────────────────────────────────────

function PostHrgCell({
  record,
  onClick,
}: {
  record: PostHrgDevRow;
  onClick: () => void;
}) {
  // Count from the same source(s) the modal will surface.
  // - MR + hearing_id  → modal opens in `hearing` mode against
  //   `hearings.post_hrg_notes` only.
  // - POST_HRG / REP / orphan MR → modal opens in `phd-internal` mode against
  //   `details_notes`, plus a read-only "MR / Dashboard" section pulling from
  //   `hearings.post_hrg_notes` when the row has a linked hearing.
  const usesHearingNotes = record.record_type === "MR" && !!record.hearing_id;
  const detailsNotes = parseNotes(
    (record as unknown as { details_notes: string | null }).details_notes ??
      null,
  );
  const hearingNotes = parseNotes(record.post_hrg_notes ?? null);
  const noteCount = usesHearingNotes
    ? hearingNotes.length
    : detailsNotes.length + (record.hearing_id ? hearingNotes.length : 0);
  // Same routing for the deadline display: MR-with-hearing reads the
  // hearing's deadline (h.post_hrg_deadline). POST_HRG/REP/orphan MR show
  // the PHD row's own column (p.deadline) since the modal writes there.
  const deadline = usesHearingNotes
    ? (record.post_hrg_deadline ?? null)
    : (record.deadline ?? null);

  let badgeClass = "bg-muted/50 text-muted-foreground hover:bg-muted";
  let text = "+ Add";
  let icon = "💬";

  if (deadline) {
    const dd = new Date(deadline + "T12:00:00");
    const today = new Date(
      new Date().toISOString().split("T")[0] + "T12:00:00",
    );
    const fmt = new Date(deadline + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    if (dd < today) {
      badgeClass =
        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200";
      icon = "⚠️";
      text = fmt;
    } else {
      badgeClass =
        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200";
      icon = "📅";
      text = fmt;
    }
  } else if (noteCount > 0) {
    badgeClass =
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200";
    icon = "💬";
    text = "Notes";
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors cursor-pointer",
        badgeClass,
      )}
      title={
        noteCount > 0
          ? `${noteCount} note${noteCount > 1 ? "s" : ""} — Click to view`
          : "Click to add"
      }
    >
      <span>{icon}</span> {text}
      {noteCount > 0 && (
        <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground/10 px-1 text-[9px] font-bold">
          {noteCount}
        </span>
      )}
    </button>
  );
}

// ─── Remarks Modal ───────────────────────────────────────────────────────────

function RemarksCellBadge({
  record,
  onClick,
}: {
  record: PostHrgDevRow;
  onClick: () => void;
}) {
  const hasRemarks = !!record.remarks;
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded px-1.5 py-1 text-xs cursor-pointer transition-colors",
        hasRemarks
          ? "hover:bg-muted/60 text-foreground"
          : "hover:bg-muted/40 text-muted-foreground italic",
      )}
      title={record.remarks || "Click to add remarks"}
    >
      <span className="block truncate" style={{ maxWidth: "180px" }}>
        {record.remarks || "Click to add..."}
      </span>
    </button>
  );
}

function RemarksModal({
  record,
  onClose,
  onSave,
}: {
  record: PostHrgDevRow;
  onClose: () => void;
  onSave: (id: number, field: string, value: string | null) => void;
}) {
  const [draft, setDraft] = useState(record.remarks || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(record.id, "remarks", draft.trim() || null);
    setSaving(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border bg-card shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-3 shrink-0">
          <div>
            <h3 className="text-sm font-semibold">
              Remarks — {record.claimant}
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {record.hearing_date
                ? new Date(
                    record.hearing_date + "T12:00:00",
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "No date"}
              {record.assigned_rep && ` • ${record.assigned_rep}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            placeholder="Enter remarks..."
            className={cn(INPUT, "resize-y text-sm")}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />
          {draft.length > 0 && (
            <p className="text-[10px] text-muted-foreground text-right">
              {draft.length} characters
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-5 py-3 shrink-0">
          {record.remarks && (
            <button
              className={cn(
                BTN,
                "px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30",
              )}
              onClick={async () => {
                await onSave(record.id, "remarks", null);
                onClose();
              }}
            >
              Clear
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              className={cn(BTN_SECONDARY, "px-3 py-1.5 text-xs")}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className={cn(BTN_PRIMARY, "px-3 py-1.5 text-xs")}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Details Modal ──────────────────────────────────────────────────────────

function DetailsModal({
  record,
  userName,
  onClose,
  onRecordUpdate,
  onFieldUpdate,
}: {
  record: PostHrgDevRow;
  userName: string;
  onClose: () => void;
  onRecordUpdate: (r: PostHrgDevRow) => void;
  onFieldUpdate: (id: number, field: string, value: string | null) => void;
}) {
  const [notes, setNotes] = useState<PostHrgNote[]>(() =>
    parseNotes(record.details_notes),
  );
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [details, setDetails] = useState(record.details || "");
  const [editingDetails, setEditingDetails] = useState(false);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        const raw = await fetchPostHrgDevNotes(record.id, "details");
        if (active) setNotes(parseNotes(raw));
      } catch {
        /* */
      }
    };
    const id = setInterval(poll, 8000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [record.id]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      const result = await addPostHrgDevNote(
        record.id,
        "details",
        newNote.trim(),
        userName,
      );
      if (result.success && result.updatedNotes) {
        setNotes(parseNotes(result.updatedNotes));
        setNewNote("");
        onRecordUpdate({
          ...record,
          details_notes: result.updatedNotes,
        } as PostHrgDevRow);
      }
    } catch {
      /* */
    }
    setSaving(false);
  };

  const removeNote = async (idx: number) => {
    try {
      const result = await deletePostHrgDevNote(record.id, "details", idx);
      if (result.success) {
        setNotes(parseNotes(result.updatedNotes));
        onRecordUpdate({
          ...record,
          details_notes: result.updatedNotes,
        } as PostHrgDevRow);
      }
    } catch {
      /* */
    }
  };

  const saveDetails = () => {
    const trimmed = details.trim();
    onFieldUpdate(record.id, "details", trimmed || null);
    setEditingDetails(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-3 shrink-0">
          <div>
            <h3 className="text-sm font-semibold">
              Details — {record.claimant}
            </h3>
            <p className="text-[10px] text-muted-foreground">
              {record.hearing_date || "No date"} •{" "}
              {record.assigned_rep || "No rep"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Details Content</label>
            {editingDetails ? (
              <div className="space-y-2">
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-xs focus:border-ring focus:outline-none"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    className={cn(
                      BTN,
                      "px-3 py-1 text-xs bg-primary text-primary-foreground",
                    )}
                    onClick={saveDetails}
                  >
                    Save
                  </button>
                  <button
                    className={cn(
                      BTN,
                      "px-3 py-1 text-xs bg-muted text-foreground",
                    )}
                    onClick={() => {
                      setDetails(record.details || "");
                      setEditingDetails(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setEditingDetails(true)}
                className="rounded-md border bg-muted/20 px-3 py-2 text-xs whitespace-pre-wrap min-h-12 cursor-pointer hover:bg-muted/40 transition-colors"
              >
                {record.details || (
                  <span className="text-muted-foreground italic">
                    Click to add details...
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Add Note</label>
            <div className="flex gap-2">
              <textarea
                className={cn(INPUT, "min-h-12 resize-none text-xs flex-1")}
                placeholder="Add a note..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    addNote();
                  }
                }}
              />
              <button
                className={cn(
                  BTN,
                  "px-3 py-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90",
                )}
                onClick={addNote}
                disabled={saving || !newNote.trim()}
              >
                {saving ? "..." : "Add"}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">
              Notes History{" "}
              <span className="text-muted-foreground">({notes.length})</span>
            </label>
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No notes yet
              </p>
            ) : (
              <div className="space-y-2">
                {notes.map((n, i) => (
                  <div
                    key={i}
                    className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-xs">
                        {n.user}
                        {n.date && (
                          <span className="text-muted-foreground ml-2">
                            {new Date(n.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => removeNote(i)}
                        className="text-xs text-muted-foreground hover:text-red-600"
                      >
                        ✕
                      </button>
                    </div>
                    <p className="text-xs whitespace-pre-wrap">{n.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="border-t px-5 py-3 shrink-0">
          <button
            className={cn(
              BTN,
              "h-8 text-xs px-3 py-1 bg-muted text-foreground hover:bg-muted/80",
            )}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Note Modal ─────────────────────────────────────────────────────────────

function NoteModal({
  record,
  field,
  fieldLabel,
  userName,
  onClose,
  onRecordUpdate,
}: {
  record: PostHrgDevRow;
  field: string;
  fieldLabel: string;
  userName: string;
  onClose: () => void;
  onRecordUpdate: (r: PostHrgDevRow) => void;
}) {
  const notesKey = `${field}_notes` as keyof PostHrgDevRow;
  const [notes, setNotes] = useState<PostHrgNote[]>(() =>
    parseNotes(record[notesKey] as string | null),
  );
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        const raw = await fetchPostHrgDevNotes(record.id, field);
        if (active) setNotes(parseNotes(raw));
      } catch {
        /* */
      }
    };
    const id = setInterval(poll, 8000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [record.id, field]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      const result = await addPostHrgDevNote(
        record.id,
        field,
        newNote.trim(),
        userName,
      );
      if (result.success && result.updatedNotes) {
        setNotes(parseNotes(result.updatedNotes));
        setNewNote("");
        onRecordUpdate({
          ...record,
          [notesKey]: result.updatedNotes,
        } as PostHrgDevRow);
      }
    } catch {
      /* */
    }
    setSaving(false);
  };

  const removeNote = async (idx: number) => {
    try {
      const result = await deletePostHrgDevNote(record.id, field, idx);
      if (result.success) {
        setNotes(parseNotes(result.updatedNotes));
        onRecordUpdate({
          ...record,
          [notesKey]: result.updatedNotes,
        } as PostHrgDevRow);
      }
    } catch {
      /* */
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[70vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-3 shrink-0">
          <h3 className="text-sm font-semibold">
            {fieldLabel} Notes — {record.claimant}
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notes.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No notes yet
            </p>
          )}
          {notes.map((n, i) => (
            <div
              key={i}
              className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-xs">
                  {n.user}
                  {n.date && (
                    <span className="text-muted-foreground ml-2">
                      {new Date(n.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => removeNote(i)}
                  className="text-xs text-muted-foreground hover:text-red-600"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs whitespace-pre-wrap">{n.note}</p>
            </div>
          ))}
        </div>
        <div className="border-t p-4 shrink-0">
          <div className="flex gap-2">
            <textarea
              className={cn(INPUT, "min-h-12 resize-none text-xs flex-1")}
              placeholder="Add a note..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  addNote();
                }
              }}
            />
            <button
              className={cn(
                BTN,
                "px-3 py-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90",
              )}
              onClick={addNote}
              disabled={saving || !newNote.trim()}
            >
              {saving ? "..." : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Note Cell Badge ─────────────────────────────────────────────────────────

function NoteCellBadge({
  record,
  field,
  onClick,
}: {
  record: PostHrgDevRow;
  field: string;
  onClick: () => void;
}) {
  const notesKey = `${field}_notes` as keyof PostHrgDevRow;
  const count = parseNotes(record[notesKey] as string | null).length;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "shrink-0 rounded px-1 py-0.5 text-[9px] font-medium transition-colors cursor-pointer",
        count > 0
          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200"
          : "bg-muted/50 text-muted-foreground hover:bg-muted",
      )}
      title={
        count > 0 ? `${count} note(s) - Click to view` : "Click to add note"
      }
    >
      💬 {count > 0 ? `${count}` : "+"}
    </button>
  );
}

// ─── Details Cell Badge ───────────────────────────────────────────────────────

function DetailsCellBadge({
  record,
  onClick,
}: {
  record: PostHrgDevRow;
  onClick: () => void;
}) {
  const noteCount = parseNotes(record.details_notes).length;
  const hasDetails = !!record.details;
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded px-1.5 py-1 text-xs cursor-pointer transition-colors group/details",
        hasDetails || noteCount > 0
          ? "hover:bg-muted/60"
          : "hover:bg-muted/40 text-muted-foreground italic",
      )}
      title={record.details || "Click to add details"}
    >
      <div className="flex items-start gap-1.5">
        <span className="truncate flex-1" style={{ maxWidth: "180px" }}>
          {record.details || "Click to add..."}
        </span>
        {noteCount > 0 && (
          <span className="shrink-0 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 text-[9px] font-bold">
            💬 {noteCount}
          </span>
        )}
      </div>
      {record.details && record.details.length > 40 && (
        <div
          className={cn(
            "absolute left-0 top-full z-50 mt-1 hidden group-hover/details:block",
            "max-w-xs w-max rounded-lg border bg-popover p-3 shadow-lg",
            "text-xs text-popover-foreground whitespace-pre-wrap wrap-break-word",
          )}
        >
          {record.details}
        </div>
      )}
    </button>
  );
}

// ─── Stats Row ────────────────────────────────────────────────────────────────

const StatsRow = memo(function StatsRow({ stats }: { stats: PostHrgDevStats }) {
  const cards = [
    {
      label: "Total",
      value: stats.total,
      gradient: "from-indigo-500 to-purple-600",
    },
    {
      label: "Pending",
      value: stats.pending,
      gradient: "from-amber-500 to-amber-600",
    },
    {
      label: "In Progress",
      value: stats.inProgress,
      gradient: "from-blue-400 to-cyan-400",
    },
    {
      label: "Completed",
      value: stats.completed,
      gradient: "from-emerald-500 to-green-400",
    },
    {
      label: "Incomplete",
      value: stats.overdue,
      gradient: "from-pink-400 to-rose-500",
    },
  ];
  return (
    <StatCardGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <StatCard
          key={c.label}
          label={c.label}
          value={c.value}
          gradient={c.gradient}
        />
      ))}
    </StatCardGrid>
  );
});

// ─── Column Definitions ───────────────────────────────────────────────────────

const COLUMNS: {
  key: string;
  label: string;
  w: number;
  sortable?: boolean;
  frozen?: boolean;
}[] = [
  { key: "indicator", label: "", w: 80, frozen: true },
  { key: "claimant", label: "Claimant", w: 175, sortable: true, frozen: true },
  { key: "ssn_last_4", label: "SSN", w: 62, frozen: true },
  {
    key: "hearing_date",
    label: "Hearing Date",
    w: 100,
    sortable: true,
    frozen: true,
  },
  { key: "assigned_rep", label: "Rep", w: 120, sortable: true, frozen: true },
  {
    key: "post_hearing_status",
    label: "PH Status",
    w: 130,
    sortable: true,
    frozen: true,
  },
  { key: "type_of_docs_needed", label: "Docs Needed", w: 120 },
  { key: "details", label: "Details", w: 240 },
  { key: "person_responsible", label: "Responsible", w: 160, sortable: true },
  { key: "em_sent_task_created", label: "EM/Task", w: 80 },
  { key: "ext_letter_sent", label: "EXT", w: 70 },
  { key: "status", label: "Status", w: 150, sortable: true },
  // new_due_date REMOVED — replaced with post_hrg_review
  { key: "post_hrg_review", label: "Post HRG Review", w: 140 },
  { key: "remarks", label: "Remarks", w: 200 },
  // Admin-only trash icon. Cell renders empty for non-admin roles so the
  // column adds no visible affordance for them; width is small enough to
  // not waste horizontal space.
  { key: "actions", label: "", w: 44 },
];

const lastFrozenKey = COLUMNS.filter((c) => c.frozen).at(-1)?.key ?? "";

function getLeftPos(key: string): number | undefined {
  let left = 0;
  for (const col of COLUMNS) {
    if (col.key === key) return col.frozen ? left : undefined;
    if (col.frozen) left += col.w;
  }
  return undefined;
}

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try {
    return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
};

function getHearingDateCls(dateStr: string | null): string {
  if (!dateStr) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T12:00:00");
  const diffDays = Math.round(
    (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return "text-red-600 font-bold dark:text-red-400";
  if (diffDays === 1)
    return "text-yellow-600 font-semibold dark:text-yellow-400";
  if (diffDays > 1 && diffDays <= 7)
    return "text-amber-600 dark:text-amber-400";
  if (diffDays > 7) return "text-emerald-600 dark:text-emerald-400";
  return "text-blue-500 dark:text-blue-400"; // past
}

const isOverdueCheck = (r: PostHrgDevRow) => {
  if (!r.deadline || r.status?.toLowerCase() === "completed") return false;
  return new Date(r.deadline) < new Date();
};

// ─── Memoized Row ─────────────────────────────────────────────────────────────

interface ColumnDef {
  key: string;
  label: string;
  w: number;
  sortable?: boolean;
  frozen?: boolean;
}

interface MemoRowProps {
  record: PostHrgDevRow;
  ri: number;
  evenBg: string;
  oddBg: string;
  getLeftPosFn: (key: string) => number | undefined;
  lastFrozen: string;
  renderCellFn: (r: PostHrgDevRow, col: ColumnDef) => React.ReactNode;
  columns: ColumnDef[];
  overdue: boolean;
  onRowClick: () => void;
  tintColor: string | null;
  unacknowledged: boolean;
  completed: boolean;
}

const MemoRow = memo(
  function MemoRow({
    record,
    ri,
    evenBg,
    oddBg,
    getLeftPosFn,
    lastFrozen,
    renderCellFn,
    columns,
    overdue,
    onRowClick,
    tintColor,
    unacknowledged,
    completed,
  }: MemoRowProps) {
    const rb = ri % 2 === 0 ? evenBg : oddBg;
    // Translucent fill (~24% alpha) so text stays readable on any indicator color
    const tintBg = tintColor ? `${tintColor}3D` : undefined;
    return (
      <tr
        className={cn(
          "group border-b border-border/40 last:border-0 cursor-pointer",
          overdue && "bg-red-50/50! dark:bg-red-950/10!",
          // Completed rows surface during search but are view-only — dim
          // them so the team can see at a glance that they're historical.
          completed && "opacity-60",
        )}
        onClick={onRowClick}
      >
        {columns.map((col) => {
          const lp = getLeftPosFn(col.key);
          const isLF = col.key === lastFrozen;
          // Apply background per-cell because <tr> backgroundColor is
          // unreliable under `border-collapse: collapse` (browsers often
          // skip it). Non-frozen cells get the tint as a flat color over
          // the transparent body. Frozen cells keep the opaque `rb` surface
          // (so scrolling content doesn't bleed through) and overlay the
          // translucent tint via `backgroundImage`.
          return (
            <td
              key={col.key}
              onClick={(e) => {
                const INTERACTIVE_COLS = [
                  "indicator",
                  "type_of_docs_needed",
                  "person_responsible",
                  "em_sent_task_created",
                  "ext_letter_sent",
                  "status",
                  "post_hrg_review",
                  "remarks",
                  "details",
                  "actions",
                ];
                if (INTERACTIVE_COLS.includes(col.key)) {
                  e.stopPropagation();
                }
              }}
              className={cn(
                "px-2 py-1.5 transition-shadow duration-150",
                // Frozen cells always paint the opaque row surface
                col.frozen && cn("sticky z-10 overflow-hidden", rb),
                // Non-frozen cells need rb only when there's no tint —
                // otherwise the tint backgroundColor below provides the fill.
                !col.frozen && !tintBg && rb,
                isLF &&
                  "border-r-2 border-r-blue-400/40 dark:border-r-blue-500/40",
                // Hover highlight: a large-spread inset box-shadow paints a
                // translucent blue overlay on top of the cell's existing
                // background-color / background-image. This wins over the
                // per-cell tint/tinge that an alpha hover:bg-* would lose to.
                // Indicator cell on unacknowledged rows uses inline boxShadow
                // for its blue stripe — inline beats class, so that one cell
                // won't show this hover overlay. Acceptable seam since the
                // rest of the row clearly reacts.
                "group-hover:shadow-[inset_0_0_0_9999px_rgb(59_130_246/0.10)]",
                "dark:group-hover:shadow-[inset_0_0_0_9999px_rgb(96_165_250/0.18)]",
              )}
              style={{
                width: col.w,
                minWidth: col.w,
                maxWidth: col.frozen ? col.w : undefined,
                ...(lp !== undefined ? { left: lp } : {}),
                ...(tintBg
                  ? col.frozen
                    ? {
                        backgroundImage: `linear-gradient(${tintBg}, ${tintBg})`,
                      }
                    : { backgroundColor: tintBg }
                  : {}),
                // Blue left edge on the indicator cell of unacknowledged
                // rows. <tr> border-left is unreliable under
                // border-collapse: collapse, so we paint it via inset shadow
                // on the leftmost (indicator) cell instead.
                ...(unacknowledged && col.key === "indicator"
                  ? { boxShadow: "inset 4px 0 0 0 #3B82F6" }
                  : {}),
              }}
            >
              {renderCellFn(record, col)}
            </td>
          );
        })}
      </tr>
    );
  },
  (prev, next) =>
    prev.record === next.record &&
    prev.ri === next.ri &&
    prev.overdue === next.overdue &&
    prev.tintColor === next.tintColor &&
    prev.unacknowledged === next.unacknowledged &&
    prev.completed === next.completed,
);

// ─── Main Component ───────────────────────────────────────────────────────────

export function PostHrgClient({
  userRole,
  userId,
  userName,
  initialRecords,
  initialTotalFiltered,
  initialStats,
  initialPhStatusOptions,
  initialStatusOptions,
  initialRepresentatives,
  initialResponsibleOptions,
  initialDocsNeededOptions,
  initialRecordType,
  initialRecordTypeCounts,
  initialCompletedCount,
  fieldOverrides,
}: {
  userRole: string;
  userId: number;
  userName: string;
  initialRecords: PostHrgDevRow[];
  initialTotalFiltered: number;
  initialStats: PostHrgDevStats;
  initialPhStatusOptions: ConfigOption[];
  initialStatusOptions: ConfigOption[];
  initialRepresentatives: RepOption[];
  initialResponsibleOptions: ResponsibleOption[];
  initialDocsNeededOptions: { value: string; color: string | null }[];
  initialRecordType: PostHrgRecordType | "all";
  initialRecordTypeCounts: PostHrgRecordTypeCounts;
  initialCompletedCount: number;
  fieldOverrides: Record<string, boolean>;
}) {
  // Per-user editability: consult overrides → fall back to role default
  // (page-level whitelist on PHD — anyone on the page can edit anything).
  // Memoized so renderCell's useCallback deps stay stable.
  const canEditFieldFn = useCallback(
    (fieldKey: string): boolean =>
      resolveFieldAccess(
        userRole as UserRole,
        "post_hrg_development",
        fieldKey,
        fieldOverrides,
      ),
    [userRole, fieldOverrides],
  );
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [records, setRecords] = useState<PostHrgDevRow[]>(initialRecords);
  const [totalFiltered, setTotalFiltered] = useState(initialTotalFiltered);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<PostHrgDevStats>(initialStats);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [phStatusFilter, setPhStatusFilter] = useState<string>("all");
  const [indicatorFilter, setIndicatorFilter] = useState<string>("all");
  // "Show NEW only" toggle — when ON, only unacknowledged rows are returned.
  // Threaded via ref so the existing fetchPage signature stays stable.
  const [showNewOnly, setShowNewOnly] = useState<boolean>(false);
  const showNewOnlyRef = useRef<boolean>(false);
  // "Show Overdue only" toggle — when ON, only unacknowledged rows are returned.
  // Threaded via ref so the existing fetchPage signature stays stable.
  const [showOverdueOnly, setShowOverdueOnly] = useState<boolean>(false);
  const showOverdueOnlyRef = useRef<boolean>(false);
  // Hearing-date filter: preset drives from/to. Threaded via ref so the
  // existing positional fetchPage signature stays stable.
  const [datePreset, setDatePreset] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const dateRangeRef = useRef<{ from: string; to: string }>({
    from: "",
    to: "",
  });
  // Which column the date filter targets. "hearing_date" preserves the
  // existing meaning of presets like "This Week" = hearings in that week.
  // Flip to "created_at" to filter by when each PHD row was added.
  const [dateField, setDateField] = useState<"hearing_date" | "created_at">(
    "hearing_date",
  );
  const dateFieldRef = useRef<"hearing_date" | "created_at">("hearing_date");
  // Tab state — which record_type bucket is active (MR / POST_HRG / REP / all).
  // Read by fetchPage via ref so we don't have to thread it through every caller.
  const [recordType, setRecordType] = useState<PostHrgRecordType | "all">(
    initialRecordType,
  );
  const recordTypeRef = useRef<PostHrgRecordType | "all">(initialRecordType);
  const [recordTypeCounts, setRecordTypeCounts] =
    useState<PostHrgRecordTypeCounts>(initialRecordTypeCounts);
  // Legacy indicator display: tint the entire row (sheet style) by indicator
  // color. Persisted in localStorage so each user's preference survives reloads.
  // Default ON — the team prefers the row-tint at-a-glance over the dot.
  const [legacyIndicator, setLegacyIndicator] = useState<boolean>(true);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("postHrg.legacyIndicator");
      if (raw === "false") setLegacyIndicator(false);
      else if (raw === "true") setLegacyIndicator(true);
    } catch {
      // localStorage unavailable — keep default
    }
  }, []);
  const toggleLegacyIndicator = useCallback(() => {
    setLegacyIndicator((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("postHrg.legacyIndicator", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Tab change: update state + ref + URL, then refetch with the new bucket.
  const handleRecordTypeChange = useCallback(
    (next: PostHrgRecordType | "all") => {
      if (next === recordTypeRef.current) return;
      recordTypeRef.current = next;
      setRecordType(next);
      setPage(1);
      try {
        const url = new URL(window.location.href);
        // "all" is the default — omit the tab param for a clean URL.
        if (next === "all") url.searchParams.delete("tab");
        else url.searchParams.set("tab", next.toLowerCase());
        window.history.replaceState(null, "", url.toString());
      } catch {
        // ignore
      }
    },
    [],
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [sortKey, setSortKey] = useState("hearing_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const phStatusOptions = initialPhStatusOptions;
  const statusOptions = initialStatusOptions;
  const representatives = initialRepresentatives;
  const responsibleOptions = initialResponsibleOptions;

  const [showAddModal, setShowAddModal] = useState(false);
  const [addData, setAddData] = useState<Partial<PostHrgDevRow>>({});
  const [saving, setSaving] = useState(false);

  // Modals
  const [noteModal, setNoteModal] = useState<{
    record: PostHrgDevRow;
    field: string;
    label: string;
  } | null>(null);
  const [detailsModal, setDetailsModal] = useState<PostHrgDevRow | null>(null);
  const [postHrgModal, setPostHrgModal] = useState<PostHrgDevRow | null>(null);
  const [remarksModal, setRemarksModal] = useState<PostHrgDevRow | null>(null);
  const [detailPanel, setDetailPanel] = useState<PostHrgDevRow | null>(null);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [completedConfirm, setCompletedConfirm] = useState<{
    // ← add here
    id: number;
    claimant: string;
  } | null>(null);
  // Delete-confirmation modal state. Opening this stashes the target row's
  // id + claimant; the modal requires the user to type "delete" before the
  // destructive button enables. Independent typed-text state lives in the
  // modal JSX so it resets each time the modal opens.
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: number;
    claimant: string;
  } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [completedCount, setCompletedCount] = useState<number>(
    initialCompletedCount,
  );

  // Import state
  const [importStep, setImportStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<number>(-1);
  const [parsing, setParsing] = useState(false);
  const [importMapping, setImportMapping] = useState<Record<string, number>>(
    {},
  );
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{
    imported: number;
    matched: number;
    errors: string[];
    skipped: {
      row: number;
      claimant: string;
      hearingDate: string | null;
      reason: string;
    }[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isAdmin = ["system_admin", "admin", "post_hearing_admin"].includes(
    userRole,
  );

  const toast = useCallback(
    (msg: string, type: "success" | "error" = "error") => {
      const el = document.createElement("div");
      el.className = `fixed top-4 right-4 z-[9999] px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-opacity ${type === "error" ? "bg-red-600" : "bg-emerald-600"}`;
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => {
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 300);
      }, 3000);
    },
    [],
  );

  // Derived options
  const DYNAMIC_STATUS_OPTIONS = useMemo(
    () =>
      statusOptions.length > 0
        ? statusOptions.map((o) => ({ value: o.value, label: o.value }))
        : STATUS_OPTIONS,
    [statusOptions],
  );
  const DYNAMIC_DOCS_NEEDED_OPTIONS = useMemo(
    () =>
      initialDocsNeededOptions.length > 0
        ? initialDocsNeededOptions.map((o) => ({
            value: o.value,
            label: o.value,
          }))
        : DOCS_NEEDED_OPTIONS,
    [initialDocsNeededOptions],
  );
  const docsNeededHexMap = useMemo(() => {
    const map: Record<string, { bg: string; color: string }> = {};
    for (const o of initialDocsNeededOptions) {
      if (o.color) map[o.value] = deriveBadgeColors(o.color);
    }
    return map;
  }, [initialDocsNeededOptions]);
  const statusHexMap = useMemo(() => {
    const map: Record<string, { bg: string; color: string }> = {};
    for (const o of statusOptions) {
      if (o.color) map[o.value] = deriveBadgeColors(o.color);
      else if (STATUS_HEX[o.value]) map[o.value] = STATUS_HEX[o.value];
    }
    return map;
  }, [statusOptions]);
  const PH_STATUS_OPTIONS = useMemo(
    () => phStatusOptions.map((o) => ({ value: o.value, label: o.value })),
    [phStatusOptions],
  );
  const phStatusHexMap = useMemo(() => {
    const map: Record<string, { bg: string; color: string }> = {};
    for (const o of phStatusOptions) {
      if (o.color) map[o.value] = deriveBadgeColors(o.color);
      else if (PH_STATUS_HEX[o.value]) map[o.value] = PH_STATUS_HEX[o.value];
    }
    return map;
  }, [phStatusOptions]);
  const REP_OPTIONS = useMemo(
    () => representatives.map((r) => ({ value: r.name, label: r.name })),
    [representatives],
  );
  const RESPONSIBLE_OPTIONS = useMemo(
    () => responsibleOptions.map((o) => ({ value: o.value, label: o.value })),
    [responsibleOptions],
  );
  const responsibleHexMap = useMemo(() => {
    const map: Record<string, { bg: string; color: string }> = {};
    for (const o of responsibleOptions) {
      map[o.value] = deriveBadgeColors(o.color);
    }
    return map;
  }, [responsibleOptions]);

  // ── Server-side fetch ──
  const refreshStats = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        fetchPostHrgDevStats(recordTypeRef.current),
        fetchPostHrgRecordTypeCounts(),
      ]);
      setStats(s);
      setRecordTypeCounts(c);
    } catch {
      /* */
    }
  }, []);

  const fetchPage = useCallback(
    async (
      p: number,
      ps: number,
      sk: string,
      sd: SortDir,
      search?: string,
      status?: string,
      phStatus?: string,
      indicator?: string,
    ) => {
      setLoading(true);
      try {
        const res = await fetchPostHrgDevPage({
          page: p,
          pageSize: ps,
          search: search?.trim() || undefined,
          status: status !== "all" ? status : undefined,
          phStatus: phStatus !== "all" ? phStatus : undefined,
          indicator: indicator !== "all" ? indicator : undefined,
          recordType: recordTypeRef.current,
          hearingDateFrom: dateRangeRef.current.from || undefined,
          hearingDateTo: dateRangeRef.current.to || undefined,
          dateField: dateFieldRef.current,
          unacknowledgedOnly: showNewOnlyRef.current || undefined,
          overdueOnly: showOverdueOnlyRef.current || undefined, // ← add this
          sortKey: sk,
          sortDir: sd,
        });
        setRecords(res.records);
        setTotalFiltered(res.totalFiltered);
        refreshStats();
      } catch {
        toast("Failed to load records");
      }
      setLoading(false);
    },
    [toast, refreshStats],
  );

  // Refetch when the active tab changes. Compare against ref to avoid firing
  // on the initial mount (data is already SSR-rendered).
  const prevTabRef = useRef<PostHrgRecordType | "all">(initialRecordType);
  useEffect(() => {
    if (recordType === prevTabRef.current) return;
    prevTabRef.current = recordType;
    fetchPage(
      1,
      pageSize,
      sortKey,
      sortDir,
      searchTerm,
      statusFilter,
      phStatusFilter,
      indicatorFilter,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordType]);

  const handleFilterChange = useCallback(
    (
      newSearch: string,
      newStatus: string,
      newPhStatus: string,
      newIndicator: string,
    ) => {
      setSearchTerm(newSearch);
      setStatusFilter(newStatus);
      setPhStatusFilter(newPhStatus);
      setIndicatorFilter(newIndicator);
      setPage(1);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchPage(
          1,
          pageSize,
          sortKey,
          sortDir,
          newSearch,
          newStatus,
          newPhStatus,
          newIndicator,
        );
      }, 300);
    },
    [fetchPage, pageSize, sortKey, sortDir],
  );

  // Forward-looking presets for hearing_date (mirrors dashboard-client).
  const computeDateRange = useCallback(
    (preset: string): { from: string; to: string } => {
      if (!preset || preset === "custom") return { from: "", to: "" };
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const iso = (d: Date) => d.toISOString().slice(0, 10);

      if (preset === "yesterday") {
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        return { from: iso(y), to: iso(y) };
      }
      if (preset === "today") return { from: iso(today), to: iso(today) };
      if (preset === "tomorrow") {
        const t = new Date(today);
        t.setDate(t.getDate() + 1);
        return { from: iso(t), to: iso(t) };
      }
      if (preset === "this-week") {
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay());
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return { from: iso(start), to: iso(end) };
      }
      if (preset === "next-week") {
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay() + 7);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return { from: iso(start), to: iso(end) };
      }
      if (preset === "this-month") {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return { from: iso(start), to: iso(end) };
      }
      if (preset === "next-30") {
        const end = new Date(today);
        end.setDate(today.getDate() + 30);
        return { from: iso(today), to: iso(end) };
      }
      return { from: "", to: "" };
    },
    [],
  );

  const refetchWithCurrentFilters = useCallback(() => {
    setPage(1);
    fetchPage(
      1,
      pageSize,
      sortKey,
      sortDir,
      searchTerm,
      statusFilter,
      phStatusFilter,
      indicatorFilter,
    );
  }, [
    fetchPage,
    pageSize,
    sortKey,
    sortDir,
    searchTerm,
    statusFilter,
    phStatusFilter,
    indicatorFilter,
  ]);

  const handleDatePresetChange = useCallback(
    (preset: string) => {
      setDatePreset(preset);
      if (preset === "custom") return; // wait for user to pick from/to
      const r = computeDateRange(preset);
      setDateFrom(r.from);
      setDateTo(r.to);
      dateRangeRef.current = r;
      refetchWithCurrentFilters();
    },
    [computeDateRange, refetchWithCurrentFilters],
  );

  const handleDateFromChange = useCallback(
    (val: string) => {
      setDateFrom(val);
      dateRangeRef.current = { from: val, to: dateTo };
      refetchWithCurrentFilters();
    },
    [dateTo, refetchWithCurrentFilters],
  );

  const handleDateToChange = useCallback(
    (val: string) => {
      setDateTo(val);
      dateRangeRef.current = { from: dateFrom, to: val };
      refetchWithCurrentFilters();
    },
    [dateFrom, refetchWithCurrentFilters],
  );

  const handleClearDates = useCallback(() => {
    setDatePreset("");
    setDateFrom("");
    setDateTo("");
    dateRangeRef.current = { from: "", to: "" };
    refetchWithCurrentFilters();
  }, [refetchWithCurrentFilters]);

  const handleDateFieldChange = useCallback(
    (next: "hearing_date" | "created_at") => {
      dateFieldRef.current = next;
      setDateField(next);
      // Only refetch if there's an active date range — otherwise the toggle
      // has no current effect on the result set.
      if (dateRangeRef.current.from || dateRangeRef.current.to) {
        refetchWithCurrentFilters();
      }
    },
    [refetchWithCurrentFilters],
  );

  // Toggle the "Show NEW only" filter — restricts results to unacknowledged
  // rows. State + ref kept in sync so the next fetchPage call picks it up.
  // Side effects (setPage, refetch) live OUTSIDE the setShowNewOnly updater
  // because state updater functions must be pure — calling other setStates
  // from inside an updater triggers the "setState during render" warning
  // under React 18 strict mode.
  const toggleShowNewOnly = useCallback(() => {
    const next = !showNewOnlyRef.current;
    showNewOnlyRef.current = next;
    setShowNewOnly(next);
    setPage(1);
    refetchWithCurrentFilters();
  }, [refetchWithCurrentFilters]);

  const toggleShowOverdueOnly = useCallback(() => {
    const next = !showOverdueOnlyRef.current;
    showOverdueOnlyRef.current = next;
    setShowOverdueOnly(next);
    setPage(1);
    refetchWithCurrentFilters();
  }, [refetchWithCurrentFilters]);

  const handlePageChange = useCallback(
    (p: number) => {
      setPage(p);
      fetchPage(
        p,
        pageSize,
        sortKey,
        sortDir,
        searchTerm,
        statusFilter,
        phStatusFilter,
        indicatorFilter,
      );
    },
    [
      fetchPage,
      pageSize,
      sortKey,
      sortDir,
      searchTerm,
      statusFilter,
      phStatusFilter,
      indicatorFilter,
    ],
  );

  const handlePageSizeChange = useCallback(
    (ps: number) => {
      setPageSize(ps);
      setPage(1);
      fetchPage(
        1,
        ps,
        sortKey,
        sortDir,
        searchTerm,
        statusFilter,
        phStatusFilter,
        indicatorFilter,
      );
    },
    [
      fetchPage,
      sortKey,
      sortDir,
      searchTerm,
      statusFilter,
      phStatusFilter,
      indicatorFilter,
    ],
  );

  const handleSort = useCallback(
    (key: string) => {
      const newDir =
        sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : "asc";
      setSortKey(key);
      setSortDir(newDir as SortDir);
      fetchPage(
        page,
        pageSize,
        key,
        newDir as SortDir,
        searchTerm,
        statusFilter,
        phStatusFilter,
        indicatorFilter,
      );
    },
    [
      sortKey,
      sortDir,
      fetchPage,
      page,
      pageSize,
      searchTerm,
      statusFilter,
      phStatusFilter,
      indicatorFilter,
    ],
  );

  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

  const handleFieldUpdate = useCallback(
    async (id: number, field: string, value: string | boolean | null) => {
      // Intercept "Completed" status — show confirmation first
      if (
        field === "status" &&
        typeof value === "string" &&
        value.toLowerCase() === "completed"
      ) {
        const record = records.find((r) => r.id === id);
        setCompletedConfirm({
          id,
          claimant: record?.claimant || "this record",
        });
        return;
      }

      // Special-case: when status flips to "Completed", drop the row from
      // the visible list and bump the Completed badge count. The main grid
      // hides Completed rows; users access them via the Completed modal.
      const becameCompleted = false; // handled above via confirmation
      if (becameCompleted) {
        setRecords((prev) => prev.filter((r) => r.id !== id));
        setTotalFiltered((n) => Math.max(0, n - 1));
        setCompletedCount((n) => n + 1);
      } else {
        setRecords((prev) =>
          prev.map((r) =>
            r.id === id ? ({ ...r, [field]: value } as PostHrgDevRow) : r,
          ),
        );
      }
      try {
        await updatePostHrgDevField(id, field, value);
        refreshStats();
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Update failed — change rolled back";
        toast(message);
        fetchPage(
          page,
          pageSize,
          sortKey,
          sortDir,
          searchTerm,
          statusFilter,
          phStatusFilter,
          indicatorFilter,
        );
      }
    },
    [
      records,
      toast,
      refreshStats,
      fetchPage,
      page,
      pageSize,
      sortKey,
      sortDir,
      searchTerm,
      statusFilter,
      phStatusFilter,
      indicatorFilter,
    ],
  );

  const handleConfirmComplete = useCallback(
    // ← add here
    async (id: number) => {
      setCompletedConfirm(null);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setTotalFiltered((n) => Math.max(0, n - 1));
      setCompletedCount((n) => n + 1);
      try {
        await updatePostHrgDevField(id, "status", "Completed");
        refreshStats();
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Update failed — change rolled back";
        toast(message);
        fetchPage(
          page,
          pageSize,
          sortKey,
          sortDir,
          searchTerm,
          statusFilter,
          phStatusFilter,
          indicatorFilter,
        );
      }
    },
    [
      toast,
      refreshStats,
      fetchPage,
      page,
      pageSize,
      sortKey,
      sortDir,
      searchTerm,
      statusFilter,
      phStatusFilter,
      indicatorFilter,
    ],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    if (deleteConfirmText.trim().toLowerCase() !== "delete") return;
    const { id, claimant } = deleteConfirm;
    setDeletingId(id);
    try {
      const { deletePostHrgDevRecord } = await import(
        "@/app/(dashboard)/post-hrg-development/actions"
      );
      await deletePostHrgDevRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setTotalFiltered((n) => Math.max(0, n - 1));
      refreshStats();
      setDeleteConfirm(null);
      setDeleteConfirmText("");
      toast(`Deleted ${claimant}`, "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Delete failed";
      toast(message);
    } finally {
      setDeletingId(null);
    }
  }, [deleteConfirm, deleteConfirmText, toast, refreshStats]);

  const handleRecordUpdate = useCallback((updated: PostHrgDevRow) => {
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    // Keep open modal in sync
    setPostHrgModal((prev) => (prev?.id === updated.id ? updated : prev));
  }, []);

  // Patch sibling rows in local state after a Post HRG Review cascade
  // ("Also apply to ..." checkboxes). Avoids a page refresh by mirroring
  // the server-side cascade on the client:
  //   - MR target → hearings.post_hrg_deadline (joined onto every row for
  //     this hearing), so update post_hrg_deadline on ALL same-hearing rows.
  //     (post_hrg_requirements isn't surfaced on the row, so nothing to do
  //     for the requirements field.)
  //   - POST_HRG/REP target → the row's own deadline/requirements column;
  //     update only the matching-type rows for this hearing.
  const handleCascadeApplied = useCallback(
    (params: {
      hearingId: number;
      field: "deadline" | "requirements";
      value: string | null;
      targets: ("MR" | "POST_HRG" | "REP")[];
    }) => {
      const { hearingId, field, value, targets } = params;
      const hasMr = targets.includes("MR");
      setRecords((prev) =>
        prev.map((r) => {
          if (r.hearing_id !== hearingId) return r;
          let next = r;
          if (hasMr && field === "deadline") {
            next = { ...next, post_hrg_deadline: value };
          }
          if (r.record_type !== "MR" && targets.includes(r.record_type)) {
            next = { ...next, [field]: value } as PostHrgDevRow;
          }
          return next;
        }),
      );
      // Keep open modal in sync if it points at a row touched by the cascade
      setPostHrgModal((prev) => {
        if (!prev || prev.hearing_id !== hearingId) return prev;
        let next = prev;
        if (hasMr && field === "deadline") {
          next = { ...next, post_hrg_deadline: value };
        }
        if (prev.record_type !== "MR" && targets.includes(prev.record_type)) {
          next = { ...next, [field]: value } as PostHrgDevRow;
        }
        return next;
      });
    },
    [],
  );

  // Acknowledge a "NEW" row — drops it out of the pinned-to-top group on
  // the next render. Optimistic: stamp acknowledged_at locally, fire the
  // server call; on failure roll back.
  const handleAcknowledge = useCallback(
    async (id: number) => {
      const stamp = new Date().toISOString();
      // Optimistic update — stamp both fields immediately
      setRecords((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, acknowledged_at: stamp, acknowledged_by_name: userName }
            : r,
        ),
      );
      try {
        const result = await acknowledgePostHrgDevRecord(id, userName);
        if (!result.success) throw new Error("Acknowledge failed");
        // Reconcile with server timestamp
        setRecords((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  acknowledged_at: result.acknowledged_at ?? stamp,
                  acknowledged_by_name: result.acknowledged_by_name ?? userName,
                }
              : r,
          ),
        );
      } catch {
        setRecords((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, acknowledged_at: null, acknowledged_by_name: null }
              : r,
          ),
        );
        toast("Failed to acknowledge");
      }
    },
    [toast, userName],
  );

  const saveNewRecord = useCallback(async () => {
    if (!addData.claimant?.trim()) {
      toast("Claimant name is required");
      return;
    }
    setSaving(true);
    try {
      const result = await createPostHrgDevRecord({
        ...addData,
        claimant: addData.claimant!,
        created_by: userId,
        // Default new rows to the active tab so they appear where the user is.
        // On the "all" tab fall back to POST_HRG.
        record_type: recordType === "all" ? "POST_HRG" : recordType,
      });
      if (result.success) {
        setShowAddModal(false);
        setAddData({});
        toast("Record created", "success");
        fetchPage(
          page,
          pageSize,
          sortKey,
          sortDir,
          searchTerm,
          statusFilter,
          phStatusFilter,
          indicatorFilter,
        );
      } else toast("Create failed: " + (result.message || ""));
    } catch {
      toast("Create failed");
    }
    setSaving(false);
  }, [
    addData,
    userId,
    recordType,
    toast,
    fetchPage,
    page,
    pageSize,
    sortKey,
    sortDir,
    searchTerm,
    statusFilter,
    phStatusFilter,
    indicatorFilter,
  ]);

  // ── Import ──
  const handleFile = useCallback(
    (f: File) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      if (!["xlsx", "xls", "csv"].includes(ext || "")) {
        toast("Only .xlsx, .xls, and .csv supported");
        return;
      }
      setFile(f);
      setParsing(true);
      setSheets([]);
      setSelectedSheet(-1);
      const reader = new FileReader();
      reader.onload = async (e: ProgressEvent<FileReader>) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array", cellStyles: true });
          const threadedComments: Record<number, Record<string, string>> = {};
          try {
            const JSZip = (await import("jszip")).default;
            const zip = await JSZip.loadAsync(data);
            const personLookup: Record<string, string> = {};
            const personFile = zip.file("xl/persons/person.xml");
            if (personFile) {
              const pXml = await personFile.async("text");
              const pDoc = new DOMParser().parseFromString(pXml, "text/xml");
              const ns =
                "http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments";
              let persons = pDoc.getElementsByTagNameNS(ns, "person");
              if (persons.length === 0)
                persons = pDoc.getElementsByTagName("person");
              for (const p of Array.from(persons)) {
                const pid = p.getAttribute("id") || "";
                const name = p.getAttribute("displayName") || "";
                if (pid && name) personLookup[pid] = name;
              }
            }
            for (let si = 0; si < wb.SheetNames.length; si++) {
              const relsFile = zip.file(
                `xl/worksheets/_rels/sheet${si + 1}.xml.rels`,
              );
              if (!relsFile) continue;
              const relsXml = await relsFile.async("text");
              const relsDoc = new DOMParser().parseFromString(
                relsXml,
                "text/xml",
              );
              for (const rel of Array.from(
                relsDoc.getElementsByTagName("Relationship"),
              )) {
                const type = rel.getAttribute("Type") || "";
                const target = rel.getAttribute("Target") || "";
                if (type.includes("threadedComment")) {
                  const tcFile = zip.file(target.replace(/^\.\.\//, "xl/"));
                  if (!tcFile) continue;
                  const tcXml = await tcFile.async("text");
                  const tcDoc = new DOMParser().parseFromString(
                    tcXml,
                    "text/xml",
                  );
                  const ns2 =
                    "http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments";
                  let tcEls = tcDoc.getElementsByTagNameNS(
                    ns2,
                    "threadedComment",
                  );
                  if (tcEls.length === 0)
                    tcEls = tcDoc.getElementsByTagName("threadedComment");
                  const sheetComments: Record<string, string[]> = {};
                  for (const tc of Array.from(tcEls)) {
                    const ref = tc.getAttribute("ref");
                    if (!ref) continue;
                    const personId = tc.getAttribute("personId") || "";
                    const author = personLookup[personId] || "";
                    const dateStr = tc.getAttribute("dT") || "";
                    let datePart = "";
                    if (dateStr)
                      try {
                        datePart = new Date(dateStr).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric", year: "numeric" },
                        );
                      } catch {
                        /* */
                      }
                    let text = "";
                    const textEls = tc.getElementsByTagNameNS(ns2, "text");
                    if (textEls.length > 0) text = textEls[0].textContent || "";
                    else {
                      const fb = tc.getElementsByTagName("text");
                      if (fb.length > 0) text = fb[0].textContent || "";
                    }
                    if (text.trim()) {
                      if (!sheetComments[ref]) sheetComments[ref] = [];
                      const prefix =
                        author && datePart
                          ? `[${author} - ${datePart}] `
                          : author
                            ? `[${author}] `
                            : datePart
                              ? `[${datePart}] `
                              : "";
                      sheetComments[ref].push(prefix + text.trim());
                    }
                  }
                  const merged: Record<string, string> = {};
                  for (const [ref2, texts] of Object.entries(sheetComments))
                    merged[ref2] = texts.join("\n");
                  if (!threadedComments[si]) threadedComments[si] = {};
                  Object.assign(threadedComments[si], merged);
                }
              }
            }
          } catch {
            /* */
          }
          const parsed: SheetData[] = wb.SheetNames.map((name, sheetIdx) => {
            const ws = wb.Sheets[name];
            const json = XLSX.utils.sheet_to_json<unknown[]>(ws, {
              header: 1,
              defval: "",
              raw: false,
            });
            const headers = (json[0] as string[]) || [];
            const rows = json
              .slice(1)
              .filter((r: unknown[]) => r.some((c: unknown) => c !== ""));
            const comments: Record<string, string> = {};
            for (const [cell, val] of Object.entries(ws) as [
              string,
              unknown,
            ][]) {
              if (cell.startsWith("!")) continue;
              const v = val as { c?: { t?: string; a?: string }[] };
              if (v.c && Array.isArray(v.c) && v.c.length > 0) {
                const parts = v.c
                  .map((c: { t?: string; a?: string }) => {
                    const author2 = c.a || "";
                    const text2 = (c.t || "").trim();
                    if (!text2) return "";
                    return author2 ? `[${author2}] ${text2}` : text2;
                  })
                  .filter(Boolean);
                if (parts.length > 0) comments[cell] = parts.join("\n");
              }
            }
            if (threadedComments[sheetIdx]) {
              for (const [ref3, text3] of Object.entries(
                threadedComments[sheetIdx],
              ))
                comments[ref3] = text3;
            }
            return { name, headers, rows, comments };
          });
          setSheets(parsed);
          if (parsed.length === 1) {
            setSelectedSheet(0);
            setImportMapping(autoMapImport(parsed[0].headers));
          }
          setParsing(false);
        } catch {
          toast("Failed to parse file");
          setParsing(false);
        }
      };
      reader.readAsArrayBuffer(f);
    },
    [toast],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    },
    [handleFile],
  );

  const selectSheet = useCallback(
    (idx: number) => {
      setSelectedSheet(idx);
      if (sheets[idx]) setImportMapping(autoMapImport(sheets[idx].headers));
    },
    [sheets],
  );

  const currentSheet = selectedSheet >= 0 ? sheets[selectedSheet] : null;

  const runImport = useCallback(async () => {
    if (!currentSheet || importMapping.claimant === undefined) {
      toast("Map the Claimant column");
      return;
    }
    setImportStep(4);
    setImporting(true);
    setImportProgress(0);
    setImportResult(null);
    const BATCH = 250;
    let imported = 0;
    let matchedTotal = 0;
    const errors: string[] = [];
    const skipped: {
      row: number;
      claimant: string;
      hearingDate: string | null;
      reason: string;
    }[] = [];
    for (let i = 0; i < currentSheet.rows.length; i += BATCH) {
      const batch = currentSheet.rows.slice(i, i + BATCH);
      try {
        const result = await importPostHrgDevRecords({
          mapping: importMapping,
          headers: currentSheet.headers,
          rows: batch,
          rowOffset: i,
          created_by: userId,
          comments: currentSheet.comments || {},
        });
        if (result.success) {
          imported += result.imported || 0;
          matchedTotal += result.matched || 0;
          if (result.errors?.length) errors.push(...result.errors);
          if (result.skipped?.length) skipped.push(...result.skipped);
        } else errors.push(`Batch ${Math.floor(i / BATCH) + 1}: error`);
      } catch {
        errors.push(`Batch ${Math.floor(i / BATCH) + 1}: Network error`);
      }
      setImportProgress(
        Math.min(
          100,
          Math.round(((i + batch.length) / currentSheet.rows.length) * 100),
        ),
      );
    }
    setImporting(false);
    setImportResult({ imported, matched: matchedTotal, errors, skipped });
    toast(
      `Imported ${imported} records (${matchedTotal} linked)`,
      errors.length > 0 ? "error" : "success",
    );
  }, [currentSheet, importMapping, userId, toast]);

  const resetImport = useCallback(() => {
    setImportStep(1);
    setFile(null);
    setSheets([]);
    setSelectedSheet(-1);
    setImportMapping({});
    setImportResult(null);
    setImportProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const SortIcon = ({ field }: { field: string }) => (
    <span className="ml-1 text-[10px] opacity-50">
      {sortKey === field ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );

  // ── Render Cell ──
  const renderCell = useCallback(
    (r: PostHrgDevRow, col: { key: string }) => {
      // Completed rows surface in the grid via search but must remain
      // view-only — every editable cell renders as a static badge below.
      const isCompletedRow = (r.status || "").toLowerCase() === "completed";
      // Small helper: render a read-only badge using the same color map
      // as the live dropdown so completed rows still look at-a-glance
      // consistent with active ones, just non-interactive.
      const readOnlyBadge = (
        value: string | null,
        hexMap?: Record<string, { bg: string; color: string }>,
      ) => {
        if (!value) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        const hex = hexMap?.[value];
        return (
          <span
            className="inline-flex items-center h-6 rounded border border-transparent px-1.5 text-[11px] font-semibold"
            style={
              hex ? { backgroundColor: hex.bg, color: hex.color } : undefined
            }
          >
            {value}
          </span>
        );
      };
      switch (col.key) {
        case "indicator":
          return (
            <div className="flex items-center gap-1.5">
              <IndicatorDot
                value={r.indicator}
                onChange={(v) => handleFieldUpdate(r.id, "indicator", v)}
                isAdmin={isAdmin && !isCompletedRow}
              />
              {!r.acknowledged_at && !isCompletedRow ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAcknowledge(r.id);
                  }}
                  title="Click to acknowledge — moves this row into normal date order"
                  className={cn(
                    "group/ack inline-flex items-center gap-1 h-5 pl-1 pr-1.5 rounded-full",
                    "text-[10px] font-semibold tracking-tight",
                    "bg-blue-50 text-blue-700 border border-blue-300",
                    "dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700",
                    "hover:bg-blue-600 hover:text-white hover:border-blue-600",
                    "dark:hover:bg-blue-500 dark:hover:text-white dark:hover:border-blue-500",
                    "shadow-[0_0_0_2px_rgba(59,130,246,0.15)]",
                    "transition-all duration-150 cursor-pointer",
                    "focus:outline-none focus:ring-2 focus:ring-blue-400/60",
                  )}
                >
                  <Check className="h-3 w-3 shrink-0" strokeWidth={3} />
                  <span>NEW</span>
                </button>
              ) : r.acknowledged_at &&
                r.acknowledged_by_name &&
                !isCompletedRow ? (
                <div
                  title={`Acknowledged${r.acknowledged_by_name ? ` by ${r.acknowledged_by_name}` : ""}${
                    r.acknowledged_at
                      ? ` on ${new Date(r.acknowledged_at).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "2-digit",
                            hour: "numeric",
                            minute: "2-digit",
                          },
                        )}`
                      : ""
                  }`}
                  className="flex w-14 shrink-0 flex-col items-center rounded-sm bg-green-100 px-0.5 py-0.5 leading-tight text-green-800 dark:bg-green-900/40 dark:text-green-300"
                >
                  <span className="text-[10px] font-bold leading-none">✓</span>
                  <span className="w-full truncate text-center text-[8px] leading-tight">
                    {r.acknowledged_by_name || "Acked"}
                  </span>
                  <span className="w-full truncate text-center text-[8px] leading-tight opacity-80">
                    {new Date(r.acknowledged_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "2-digit",
                    })}
                  </span>
                </div>
              ) : null}
            </div>
          );
        case "claimant":
          return (
            <ClaimantCell
              record={r}
              showTypeBadge={recordType === "all"}
              isCompleted={isCompletedRow}
            />
          );
        case "ssn_last_4":
          return (
            <span className="text-xs font-mono text-muted-foreground">
              {r.ssn_last_4 ? r.ssn_last_4 : "—"}
            </span>
          );
        case "hearing_date":
          return (
            <span
              className={cn(
                "text-xs tabular-nums whitespace-nowrap",
                getHearingDateCls(r.hearing_date),
              )}
            >
              {fmtDate(r.hearing_date)}
            </span>
          );
        case "post_hearing_status":
          // PH Status is sourced from the hearing decision upstream — always
          // render as a read-only badge here so it isn't edited from PHD.
          return readOnlyBadge(r.post_hearing_status, phStatusHexMap);
        case "type_of_docs_needed":
          if (isCompletedRow || !canEditFieldFn("type_of_docs_needed"))
            return readOnlyBadge(r.type_of_docs_needed, docsNeededHexMap);
          return (
            <InlineDropdown
              value={r.type_of_docs_needed}
              options={DYNAMIC_DOCS_NEEDED_OPTIONS}
              onSave={(v) => handleFieldUpdate(r.id, "type_of_docs_needed", v)}
              hexColorMap={docsNeededHexMap}
            />
          );
        case "details":
          return (
            <div className="relative">
              <DetailsCellBadge record={r} onClick={() => setDetailsModal(r)} />
            </div>
          );
        case "assigned_rep":
          return <RepBadge record={r} />;
        case "person_responsible":
          if (isCompletedRow || !canEditFieldFn("person_responsible"))
            return readOnlyBadge(r.person_responsible, responsibleHexMap);
          return (
            <div className="flex items-center gap-1">
              <InlineDropdown
                value={r.person_responsible}
                options={RESPONSIBLE_OPTIONS}
                onSave={(v) => handleFieldUpdate(r.id, "person_responsible", v)}
                hexColorMap={responsibleHexMap}
                placeholder="—"
              />
              <NoteCellBadge
                record={r}
                field="person_responsible"
                onClick={() =>
                  setNoteModal({
                    record: r,
                    field: "person_responsible",
                    label: "Responsible",
                  })
                }
              />
            </div>
          );
        case "em_sent_task_created":
          if (isCompletedRow || !canEditFieldFn("em_sent_task_created")) {
            return (
              <span className="inline-flex items-center justify-center text-xs text-muted-foreground">
                {r.em_sent_task_created ? "✓" : "—"}
              </span>
            );
          }
          return (
            <div className="flex items-center gap-1">
              <InlineCheck
                checked={r.em_sent_task_created}
                onToggle={(v) =>
                  handleFieldUpdate(r.id, "em_sent_task_created", v)
                }
              />
              <NoteCellBadge
                record={r}
                field="em_sent_task_created"
                onClick={() =>
                  setNoteModal({
                    record: r,
                    field: "em_sent_task_created",
                    label: "EM/Task",
                  })
                }
              />
            </div>
          );
        case "ext_letter_sent":
          if (isCompletedRow || !canEditFieldFn("ext_letter_sent")) {
            return (
              <span className="inline-flex items-center justify-center text-xs text-muted-foreground">
                {r.ext_letter_sent ? "✓" : "—"}
              </span>
            );
          }
          return (
            <div className="flex items-center gap-1">
              <InlineCheck
                checked={r.ext_letter_sent}
                onToggle={(v) => handleFieldUpdate(r.id, "ext_letter_sent", v)}
              />
              <NoteCellBadge
                record={r}
                field="ext_letter_sent"
                onClick={() =>
                  setNoteModal({
                    record: r,
                    field: "ext_letter_sent",
                    label: "EXT Letter",
                  })
                }
              />
            </div>
          );
        case "status":
          if (isCompletedRow || !canEditFieldFn("status"))
            return readOnlyBadge(r.status, statusHexMap);
          return (
            <div className="flex items-center gap-1">
              <InlineDropdown
                value={r.status}
                options={DYNAMIC_STATUS_OPTIONS}
                onSave={(v) => handleFieldUpdate(r.id, "status", v)}
                hexColorMap={statusHexMap}
              />
              <NoteCellBadge
                record={r}
                field="status"
                onClick={() =>
                  setNoteModal({ record: r, field: "status", label: "Status" })
                }
              />
            </div>
          );
        case "post_hrg_review":
          return <PostHrgCell record={r} onClick={() => setPostHrgModal(r)} />;
        case "remarks":
          return (
            <RemarksCellBadge record={r} onClick={() => setRemarksModal(r)} />
          );
        case "actions":
          // Trash icon — admin-only. Stops propagation so the row click
          // (which opens the details modal) doesn't fire underneath.
          if (!isAdmin) return null;
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteConfirm({ id: r.id, claimant: r.claimant });
              }}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors"
              title="Delete record"
              aria-label={`Delete ${r.claimant}`}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          );
        default:
          return <span className="text-xs">—</span>;
      }
    },
    [
      phStatusHexMap,
      DYNAMIC_STATUS_OPTIONS,
      DYNAMIC_DOCS_NEEDED_OPTIONS,
      docsNeededHexMap,
      statusHexMap,
      RESPONSIBLE_OPTIONS,
      responsibleHexMap,
      handleFieldUpdate,
      handleAcknowledge,
      canEditFieldFn,
      isAdmin,
      recordType,
    ],
  );

  const headerBg = "bg-muted/90 backdrop-blur-sm";
  const evenBg = "bg-white dark:bg-zinc-950";
  const oddBg = "bg-zinc-50 dark:bg-zinc-900";

  // Virtualization
  const ROW_H = 36;
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 8,
  });

  // Manual refresh — pulls the current page from the server using ALL active
  // filters/sort/search/tab (those already flow through fetchPage via refs
  // and explicit args). We capture the scroll-container's scrollTop before
  // the fetch and restore it on the next frame so the user stays where they
  // were instead of snapping back to row 0 after the virtualizer remeasures.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    const scrollTop = parentRef.current?.scrollTop ?? 0;
    setRefreshing(true);
    try {
      await fetchPage(
        page,
        pageSize,
        sortKey,
        sortDir,
        searchTerm,
        statusFilter,
        phStatusFilter,
        indicatorFilter,
      );
    } finally {
      setRefreshing(false);
      // Wait for React to commit the new records + virtualizer to remeasure,
      // then restore scroll. requestAnimationFrame is enough here because
      // fetchPage's awaits complete after setRecords is committed.
      requestAnimationFrame(() => {
        if (parentRef.current) parentRef.current.scrollTop = scrollTop;
      });
    }
  }, [
    fetchPage,
    page,
    pageSize,
    sortKey,
    sortDir,
    searchTerm,
    statusFilter,
    phStatusFilter,
    indicatorFilter,
  ]);

  // ── JSX ──
  return (
    <>
      <AppHeader
        title="Post Hearing Development"
        subtitle="Track and manage post-hearing tasks and document follow-ups"
      />
      <div className="flex flex-col gap-3 p-2 sm:p-3 lg:p-4 xl:p-6 max-w-full overflow-hidden">
        <DashboardNav userRole={userRole as UserRole} />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
          <div className="flex gap-1.5 flex-wrap">
            <button
              className={cn(
                "px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors",
                viewMode === "dashboard"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
              onClick={() => setViewMode("dashboard")}
            >
              📋 Dashboard
            </button>
            {userRole === "system_admin" && (
              <button
                className={cn(
                  "px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors",
                  viewMode === "import"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
                onClick={() => {
                  setViewMode("import");
                  resetImport();
                }}
              >
                📥 Import
              </button>
            )}
          </div>
          {viewMode === "dashboard" && (
            <div className="flex items-center gap-2">
              <button
                className={cn(
                  BTN,
                  "text-xs sm:text-sm gap-1.5 px-3 py-1.5",
                  "bg-violet-50 text-violet-700 border border-violet-200",
                  "hover:bg-violet-100 hover:border-violet-300",
                  "dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800",
                  "dark:hover:bg-violet-950/50 dark:hover:border-violet-700",
                )}
                onClick={() => setShowReportsModal(true)}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Reports
              </button>
              <button
                className={cn(
                  "flex items-center gap-1.5 text-xs sm:text-sm px-3 py-1.5 rounded-lg transition-colors font-semibold border",
                  completedCount > 0
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
                    : "bg-card hover:bg-muted text-muted-foreground border-border",
                )}
                onClick={() => setShowCompletedModal(true)}
                title="View completed records (hidden from main grid)"
              >
                ✅ Completed ({completedCount})
              </button>
              <button
                className={cn(
                  BTN,
                  "text-xs sm:text-sm gap-1.5 px-3 py-1.5",
                  "bg-sky-50 text-sky-700 border border-sky-200",
                  "hover:bg-sky-100 hover:border-sky-300",
                  "dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800",
                  "dark:hover:bg-sky-950/50 dark:hover:border-sky-700",
                  "disabled:opacity-60 disabled:cursor-not-allowed",
                )}
                onClick={handleRefresh}
                disabled={refreshing}
                title="Refresh table data without losing scroll, filters, or sort"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
                  strokeWidth={2}
                />
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
              <button
                className={cn(BTN_OUTLINE, "text-xs sm:text-sm gap-1.5")}
                onClick={() => setShowActivityLog(true)}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Activity Log
              </button>
              <button
                className={cn(BTN_SUCCESS, "text-xs sm:text-sm")}
                onClick={() => setShowAddModal(true)}
              >
                + Add Record
              </button>
            </div>
          )}
        </div>

        {viewMode === "dashboard" && (
          <>
            <StatsRow stats={stats} />

            {/* Record-type tabs (All / Post HRG / MR / REP). */}
            <div className="flex items-center gap-1.5 border-b border-border/60 px-1 overflow-x-auto">
              <div className="flex items-center gap-1.5">
                {(
                  [
                    {
                      key: "all",
                      label: "All",
                      count: recordTypeCounts.all,
                      activeCls:
                        "border-primary text-foreground bg-primary/15 dark:bg-primary/25 ring-1 ring-primary/40 dark:ring-primary/60",
                      chipActive: "bg-primary/15 text-primary",
                      badgeCls:
                        "bg-slate-200 text-slate-700 ring-slate-300 dark:bg-slate-700/50 dark:text-slate-200 dark:ring-slate-600",
                      dotCls: "bg-slate-400 dark:bg-slate-500",
                    },
                    {
                      key: "POST_HRG",
                      label: "Post HRG",
                      count: recordTypeCounts.postHrg,
                      activeCls:
                        "border-violet-500 text-violet-800 dark:text-violet-100 bg-violet-100 dark:bg-violet-500/30 ring-1 ring-violet-300 dark:ring-violet-400/60",
                      chipActive:
                        "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
                      badgeCls:
                        "bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:ring-violet-800",
                      dotCls: "bg-violet-500",
                    },
                    {
                      key: "MR",
                      label: "MR",
                      count: recordTypeCounts.mr,
                      activeCls:
                        "border-amber-500 text-amber-800 dark:text-amber-100 bg-amber-100 dark:bg-amber-500/30 ring-1 ring-amber-300 dark:ring-amber-400/60",
                      chipActive:
                        "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
                      badgeCls:
                        "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-800",
                      dotCls: "bg-amber-500",
                    },
                    {
                      key: "REP",
                      label: "REP",
                      count: recordTypeCounts.rep,
                      activeCls:
                        "border-emerald-500 text-emerald-800 dark:text-emerald-100 bg-emerald-100 dark:bg-emerald-500/30 ring-1 ring-emerald-300 dark:ring-emerald-400/60",
                      chipActive:
                        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
                      badgeCls:
                        "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800",
                      dotCls: "bg-emerald-500",
                    },
                  ] as const
                ).map((t) => {
                  const active = recordType === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => handleRecordTypeChange(t.key)}
                      className={cn(
                        "group relative flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px rounded-t-md transition-all duration-200 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? cn("shadow-sm", t.activeCls)
                          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:border-muted-foreground/30 hover:-translate-y-px",
                      )}
                    >
                      {/* Type badge — small colored pill so each tab stays
                        visually identifiable even when not the active tab. */}
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 transition-colors",
                          t.badgeCls,
                        )}
                      >
                        <span
                          className={cn("h-1.5 w-1.5 rounded-full", t.dotCls)}
                        />
                        {t.label}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center justify-center min-w-5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
                          active
                            ? t.chipActive
                            : "bg-muted text-muted-foreground group-hover:bg-muted-foreground/15",
                        )}
                      >
                        {t.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Indicator legend — always visible, no tooltip needed */}
              <div className="flex items-center gap-3 px-2 pb-1 shrink-0">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Indicators:
                </span>
                {INDICATOR_OPTIONS.map((o) => (
                  <div key={o.value} className="flex items-center gap-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: o.color,
                        boxShadow: `0 0 0 1px ${o.color}60`,
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {o.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className={cn(CARD, "p-3 sm:p-4")}>
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 sm:gap-3">
                <input
                  type="text"
                  placeholder="Search claimant, rep, SSN, details..."
                  className={cn(INPUT, "flex-1 min-w-0 sm:min-w-48")}
                  value={searchTerm}
                  onChange={(e) =>
                    handleFilterChange(
                      e.target.value,
                      statusFilter,
                      phStatusFilter,
                      indicatorFilter,
                    )
                  }
                />
                <div className="flex gap-2 flex-1 sm:flex-none flex-wrap">
                  <select
                    className={cn(SELECT_CLS, "flex-1 sm:w-40")}
                    value={statusFilter}
                    onChange={(e) =>
                      handleFilterChange(
                        searchTerm,
                        e.target.value,
                        phStatusFilter,
                        indicatorFilter,
                      )
                    }
                  >
                    <option value="all">All Status</option>
                    {DYNAMIC_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className={cn(SELECT_CLS, "flex-1 sm:w-48")}
                    value={phStatusFilter}
                    onChange={(e) =>
                      handleFilterChange(
                        searchTerm,
                        statusFilter,
                        e.target.value,
                        indicatorFilter,
                      )
                    }
                  >
                    <option value="all">All PH Status</option>
                    {PH_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <div className="relative flex items-center gap-1.5">
                    <select
                      className={cn(SELECT_CLS, "flex-1 sm:w-44")}
                      value={indicatorFilter}
                      onChange={(e) =>
                        handleFilterChange(
                          searchTerm,
                          statusFilter,
                          phStatusFilter,
                          e.target.value,
                        )
                      }
                    >
                      <option value="all">All Indicators</option>
                      <option value="none">No Indicator</option>
                      {INDICATOR_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>

                    <select
                      className={cn(SELECT_CLS, "w-32 sm:w-36 shrink-0")}
                      value={dateField}
                      onChange={(e) =>
                        handleDateFieldChange(
                          e.target.value as "hearing_date" | "created_at",
                        )
                      }
                      title="Which column the date range filters on"
                    >
                      <option value="hearing_date">Hearing Date</option>
                      <option value="created_at">Date Added</option>
                    </select>

                    <select
                      className={cn(SELECT_CLS, "flex-1 sm:w-40")}
                      value={datePreset}
                      onChange={(e) => handleDatePresetChange(e.target.value)}
                    >
                      <option value="">All Dates</option>
                      <option value="yesterday">Yesterday</option>
                      <option value="today">Today</option>
                      <option value="tomorrow">Tomorrow</option>
                      <option value="this-week">This Week</option>
                      <option value="next-week">Next Week</option>
                      <option value="this-month">This Month</option>
                      <option value="next-30">Next 30 Days</option>
                      <option value="custom">Custom Range...</option>
                    </select>

                    {datePreset === "custom" && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="date"
                          value={dateFrom}
                          onChange={(e) => handleDateFromChange(e.target.value)}
                          max={dateTo || undefined}
                          className="h-8 w-31.25 rounded-md border bg-card px-2 text-xs"
                        />
                        <span className="text-xs text-muted-foreground">
                          to
                        </span>
                        <input
                          type="date"
                          value={dateTo}
                          onChange={(e) => handleDateToChange(e.target.value)}
                          min={dateFrom || undefined}
                          className="h-8 w-31.25 rounded-md border bg-card px-2 text-xs"
                        />
                      </div>
                    )}

                    {(datePreset || dateFrom || dateTo) && (
                      <button
                        type="button"
                        onClick={handleClearDates}
                        className="h-8 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
                      >
                        Clear Dates
                      </button>
                    )}

                    {/* Show NEW only — restricts results to unacknowledged rows */}
                    <button
                      type="button"
                      onClick={toggleShowNewOnly}
                      title={
                        showNewOnly
                          ? "Showing only unacknowledged rows. Click to show all."
                          : "Show only unacknowledged (NEW) rows."
                      }
                      className={cn(
                        "h-8 px-2.5 rounded-md text-xs font-semibold border transition-colors shrink-0 inline-flex items-center gap-1.5",
                        showNewOnly
                          ? "border-blue-500 bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                          : "border-border bg-card text-foreground hover:bg-muted/50",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block w-2 h-2 rounded-full",
                          showNewOnly ? "bg-white" : "bg-blue-500",
                        )}
                      />
                      Show NEW only
                    </button>

                    {/* Show Overdue only */}
                    <button
                      type="button"
                      onClick={toggleShowOverdueOnly}
                      title={
                        showOverdueOnly
                          ? "Showing only overdue rows. Click to show all."
                          : "Show only overdue rows (past deadline)."
                      }
                      className={cn(
                        "h-8 px-2.5 rounded-md text-xs font-semibold border transition-colors shrink-0 inline-flex items-center gap-1.5",
                        showOverdueOnly
                          ? "border-red-500 bg-red-600 text-white hover:bg-red-700 shadow-sm"
                          : "border-border bg-card text-foreground hover:bg-muted/50",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block w-2 h-2 rounded-full",
                          showOverdueOnly ? "bg-white" : "bg-red-500",
                        )}
                      />
                      Show Incomplete only
                    </button>

                    {/* Legacy display toggle — tints the entire row by indicator color (sheet style) */}
                    <button
                      type="button"
                      onClick={toggleLegacyIndicator}
                      title={
                        legacyIndicator
                          ? "Legacy mode ON — entire row is tinted by indicator color. Click to switch to dot only."
                          : "Legacy mode OFF — indicator shown as dot only. Click to tint entire row (sheet style)."
                      }
                      className={cn(
                        "h-5 px-2 rounded-full border text-[10px] font-semibold transition-colors shrink-0",
                        legacyIndicator
                          ? "border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-200"
                          : "border-border bg-muted text-muted-foreground hover:bg-muted/80",
                      )}
                    >
                      {legacyIndicator ? "Legacy: ON" : "Legacy"}
                    </button>

                    {/* Legend tooltip */}
                    <LegendTooltip />
                  </div>
                </div>
                <span className="text-xs text-muted-foreground self-center">
                  {totalFiltered} records
                </span>
              </div>
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-3 py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm text-muted-foreground">
                  Loading...
                </span>
              </div>
            )}

            {!loading && (
              <div className="w-full overflow-hidden rounded-lg border bg-card shadow-sm">
                <div
                  ref={(node) => {
                    (
                      parentRef as React.MutableRefObject<HTMLDivElement | null>
                    ).current = node;
                    if (typeof scrollRef === "object" && scrollRef !== null) {
                      (
                        scrollRef as React.MutableRefObject<HTMLDivElement | null>
                      ).current = node;
                    }
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
                    className="w-full border-collapse text-sm"
                    style={{ minWidth: COLUMNS.reduce((s, c) => s + c.w, 0) }}
                  >
                    <thead className="sticky top-0 z-30">
                      <tr>
                        {COLUMNS.map((col) => {
                          const leftPos = getLeftPos(col.key);
                          const isLF = col.key === lastFrozenKey;
                          return (
                            <th
                              key={col.key}
                              className={cn(
                                "h-10 whitespace-nowrap border-b-2 border-border px-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground/80",
                                headerBg,
                                col.sortable &&
                                  "cursor-pointer select-none hover:text-foreground",
                                col.frozen && "sticky z-20 overflow-hidden",
                                isLF &&
                                  "border-r-2 border-r-blue-400/40 dark:border-r-blue-500/40",
                              )}
                              style={{
                                width: col.w,
                                minWidth: col.w,
                                maxWidth: col.frozen ? col.w : undefined,
                                ...(leftPos !== undefined
                                  ? { left: leftPos }
                                  : {}),
                              }}
                              onClick={() =>
                                col.sortable && handleSort(col.key)
                              }
                            >
                              {col.label}
                              {col.sortable && <SortIcon field={col.key} />}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {records.length === 0 ? (
                        <tr>
                          <td
                            colSpan={COLUMNS.length}
                            className="px-3 py-12 text-center text-muted-foreground"
                          >
                            No records found
                          </td>
                        </tr>
                      ) : (
                        <>
                          {(virtualizer.getVirtualItems()[0]?.start ?? 0) >
                            0 && (
                            <tr>
                              <td
                                colSpan={COLUMNS.length}
                                style={{
                                  height:
                                    virtualizer.getVirtualItems()[0]?.start ??
                                    0,
                                  padding: 0,
                                  border: "none",
                                }}
                              />
                            </tr>
                          )}
                          {virtualizer.getVirtualItems().map((vRow) => {
                            const r = records[vRow.index];
                            return (
                              <MemoRow
                                key={r.id}
                                record={r}
                                ri={vRow.index}
                                evenBg={evenBg}
                                oddBg={oddBg}
                                getLeftPosFn={getLeftPos}
                                lastFrozen={lastFrozenKey}
                                renderCellFn={renderCell}
                                columns={COLUMNS}
                                overdue={isOverdueCheck(r)}
                                onRowClick={() => setDetailPanel(r)}
                                tintColor={(() => {
                                  // When legacy mode is ON, indicator color
                                  // tints the entire row (sheet style).
                                  // Otherwise the indicator stays as a dot
                                  // and the row only gets the soft sky-blue
                                  // tint for fresh-today rows.
                                  const indTint = legacyIndicator
                                    ? getIndicatorColor(r.indicator)
                                    : null;
                                  if (indTint) return indTint;
                                  return isCreatedToday(r.created_at)
                                    ? "#0EA5E9"
                                    : null;
                                })()}
                                unacknowledged={!r.acknowledged_at}
                                completed={
                                  (r.status || "").toLowerCase() === "completed"
                                }
                              />
                            );
                          })}
                          {(() => {
                            const items = virtualizer.getVirtualItems();
                            const lastEnd = items[items.length - 1]?.end ?? 0;
                            const remaining =
                              virtualizer.getTotalSize() - lastEnd;
                            return remaining > 0 ? (
                              <tr>
                                <td
                                  colSpan={COLUMNS.length}
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
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t px-3 sm:px-4 py-2.5 bg-muted/30">
                  <span className="text-xs text-muted-foreground">
                    Showing{" "}
                    {totalFiltered === 0 ? 0 : (page - 1) * pageSize + 1}–
                    {Math.min(page * pageSize, totalFiltered)} of{" "}
                    {totalFiltered}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    <button
                      className={cn(BTN_OUTLINE, "px-2 py-1 text-xs")}
                      disabled={page <= 1}
                      onClick={() => handlePageChange(page - 1)}
                    >
                      ← Prev
                    </button>
                    <span className="text-xs tabular-nums flex items-center gap-1">
                      Page{" "}
                      <select
                        value={page}
                        onChange={(e) => {
                          const p2 = parseInt(e.target.value);
                          if (p2 > 0 && p2 <= totalPages) handlePageChange(p2);
                        }}
                        className="rounded border bg-background px-1.5 py-0.5 text-xs tabular-nums cursor-pointer hover:bg-muted/40 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400/60"
                        aria-label="Jump to page"
                      >
                        {Array.from(
                          { length: totalPages },
                          (_, i) => i + 1,
                        ).map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>{" "}
                      of {totalPages}
                    </span>
                    <button
                      className={cn(BTN_OUTLINE, "px-2 py-1 text-xs")}
                      disabled={page >= totalPages}
                      onClick={() => handlePageChange(page + 1)}
                    >
                      Next →
                    </button>
                    <select
                      className="rounded border bg-background px-1 py-0.5 text-xs"
                      value={String(pageSize)}
                      onChange={(e) =>
                        handlePageSizeChange(parseInt(e.target.value))
                      }
                    >
                      {[25, 50, 100, 250].map((s) => (
                        <option key={s} value={s}>
                          {s} / page
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════════ IMPORT ════════════════ */}
        {viewMode === "import" && (
          <>
            <div className="flex flex-col sm:flex-row gap-2">
              {[
                { num: 1, label: "Upload" },
                { num: 2, label: "Map Columns" },
                { num: 3, label: "Preview" },
                { num: 4, label: "Results" },
              ].map((s) => (
                <div
                  key={s.num}
                  className={cn(
                    "flex-1 rounded-lg px-4 py-3 text-center font-medium text-sm transition-all",
                    importStep === s.num
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : importStep > s.num
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  <span className="font-bold mr-1.5">Step {s.num}</span>
                  {s.label}
                </div>
              ))}
            </div>

            {importStep === 1 && (
              <div className={CARD}>
                <h2 className="text-lg font-semibold mb-1">
                  📁 Upload Post-Hearing Spreadsheet
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Rows matched to hearings by Claimant + Date. SSN pulled
                  automatically from linked hearings.
                </p>
                {!file && (
                  <div
                    className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
                    onClick={() => fileRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <div className="text-4xl mb-3">📄</div>
                    <div className="text-base font-medium">
                      Drag & drop or click to browse
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      .xlsx, .xls, .csv
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) =>
                        e.target.files?.[0] && handleFile(e.target.files[0])
                      }
                    />
                  </div>
                )}
                {file && (
                  <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3 mb-4">
                    <span className="text-2xl">📊</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {file.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <button
                      className="text-muted-foreground hover:text-destructive text-lg"
                      onClick={() => {
                        setFile(null);
                        setSheets([]);
                        setSelectedSheet(-1);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
                {parsing && (
                  <div className="flex items-center justify-center gap-3 py-8">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span className="text-sm text-muted-foreground">
                      Reading...
                    </span>
                  </div>
                )}
                {sheets.length > 1 && (
                  <div className="mb-4">
                    <label className="text-sm font-medium">
                      📑 Select Sheet:
                    </label>
                    <select
                      className={SELECT_CLS}
                      value={selectedSheet}
                      onChange={(e) => selectSheet(Number(e.target.value))}
                    >
                      <option value={-1}>-- Select --</option>
                      {sheets.map((s, i) => (
                        <option key={i} value={i}>
                          {s.name} ({s.rows.length} rows)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {currentSheet && (
                  <div className="mb-4 text-sm text-muted-foreground">
                    Sheet <strong>&apos;{currentSheet.name}&apos;</strong>:{" "}
                    {currentSheet.headers.length} cols,{" "}
                    {currentSheet.rows.length} rows
                  </div>
                )}
                <div className="mt-6 flex items-center justify-between gap-3">
                  <button
                    className={BTN_SECONDARY}
                    onClick={() => setViewMode("dashboard")}
                  >
                    ← Dashboard
                  </button>
                  <button
                    className={BTN_PRIMARY}
                    disabled={!currentSheet}
                    onClick={() => setImportStep(2)}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}

            {importStep === 2 && currentSheet && (
              <div className={CARD}>
                <h2 className="text-lg font-semibold mb-1">🔗 Map Columns</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  {Object.entries(IMPORT_FIELD_MAP).map(([field]) => {
                    const labels: Record<string, string> = {
                      claimant: "Claimant *",
                      hearing_date: "Hearing Date",
                      post_hearing_status: "PH Status",
                      type_of_docs_needed: "Docs Needed",
                      details: "Details",
                      assigned_rep: "Rep",
                      person_responsible: "Responsible",
                      em_sent_task_created: "EM/Task",
                      ext_letter_sent: "EXT Letter",
                      status: "Status",
                      deadline: "Deadline",
                      remarks: "Remarks",
                    };
                    return (
                      <div key={field} className="space-y-1">
                        <label
                          className={cn(
                            "text-sm font-medium",
                            labels[field]?.includes("*") && "text-destructive",
                          )}
                        >
                          {labels[field] || field}
                        </label>
                        <select
                          className={cn(
                            SELECT_CLS,
                            importMapping[field] !== undefined &&
                              "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20",
                          )}
                          value={importMapping[field] ?? ""}
                          onChange={(e) =>
                            setImportMapping((p: Record<string, number>) => {
                              const n = { ...p };
                              if (e.target.value === "") delete n[field];
                              else n[field] = Number(e.target.value);
                              return n;
                            })
                          }
                        >
                          <option value="">-- Skip --</option>
                          {currentSheet.headers.map((h, i) => (
                            <option key={i} value={i}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-6 flex items-center justify-between gap-3">
                  <button
                    className={BTN_SECONDARY}
                    onClick={() => setImportStep(1)}
                  >
                    ← Back
                  </button>
                  <button
                    className={BTN_PRIMARY}
                    onClick={() => setImportStep(3)}
                  >
                    Preview →
                  </button>
                </div>
              </div>
            )}

            {importStep === 3 && currentSheet && (
              <div className={CARD}>
                <h2 className="text-lg font-semibold mb-1">👀 Preview</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  {currentSheet.rows.length} rows to import
                </p>
                <div className="max-h-96 overflow-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted z-10">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        {(
                          Object.entries(importMapping) as [string, number][]
                        ).map(([f, idx]) => (
                          <th
                            key={f}
                            className="px-3 py-2 text-left whitespace-nowrap"
                          >
                            {currentSheet.headers[idx]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {currentSheet.rows.slice(0, 50).map((row, i) => {
                        const r2 = row as string[];
                        return (
                          <tr key={i} className="border-t hover:bg-muted/30">
                            <td className="px-3 py-1.5 text-muted-foreground">
                              {i + 1}
                            </td>
                            {(
                              Object.entries(importMapping) as [
                                string,
                                number,
                              ][]
                            ).map(([f, idx]) => (
                              <td
                                key={f}
                                className="px-3 py-1.5 max-w-40 truncate"
                              >
                                {String(r2[idx] ?? "").trim() || "—"}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-6 flex items-center justify-between gap-3">
                  <button
                    className={BTN_SECONDARY}
                    onClick={() => setImportStep(2)}
                  >
                    ← Back
                  </button>
                  <button className={BTN_SUCCESS} onClick={runImport}>
                    ✅ Import {currentSheet.rows.length} Records
                  </button>
                </div>
              </div>
            )}

            {importStep === 4 && (
              <div className={CARD}>
                <h2 className="text-lg font-semibold mb-4">📊 Results</h2>
                {importing && (
                  <div className="py-8 space-y-4">
                    <div className="h-4 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${importProgress}%` }}
                      />
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-primary">
                        {importProgress}%
                      </div>
                    </div>
                  </div>
                )}
                {importResult && !importing && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-3">
                      <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center">
                        <div className="text-3xl font-bold text-emerald-700">
                          {importResult.imported}
                        </div>
                        <div className="text-sm text-emerald-600">Imported</div>
                      </div>
                      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4 text-center">
                        <div className="text-3xl font-bold text-blue-700">
                          {importResult.matched}
                        </div>
                        <div className="text-sm text-blue-600">Linked</div>
                      </div>
                      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-4 text-center">
                        <div className="text-3xl font-bold text-amber-700">
                          {importResult.skipped.length}
                        </div>
                        <div className="text-sm text-amber-600">Skipped</div>
                      </div>
                      <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-4 text-center">
                        <div className="text-3xl font-bold text-red-700">
                          {importResult.errors.length}
                        </div>
                        <div className="text-sm text-red-600">Errors</div>
                      </div>
                    </div>
                    {importResult.skipped.length > 0 && (
                      <div className="rounded-lg border bg-amber-50/40 dark:bg-amber-950/10">
                        <div className="px-4 py-2 border-b bg-amber-100/50 dark:bg-amber-900/20 text-sm font-semibold text-amber-800 dark:text-amber-300">
                          ⚠️ Not Uploaded ({importResult.skipped.length} rows)
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-amber-100/80 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold w-16">
                                  Row
                                </th>
                                <th className="px-3 py-2 text-left font-semibold">
                                  Claimant
                                </th>
                                <th className="px-3 py-2 text-left font-semibold w-28">
                                  Hearing Date
                                </th>
                                <th className="px-3 py-2 text-left font-semibold">
                                  Reason
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {importResult.skipped.map((s, i) => (
                                <tr
                                  key={`${s.row}-${i}`}
                                  className="border-t border-amber-200/60 dark:border-amber-800/40"
                                >
                                  <td className="px-3 py-1.5 tabular-nums">
                                    {s.row}
                                  </td>
                                  <td className="px-3 py-1.5">
                                    {s.claimant || (
                                      <span className="italic text-muted-foreground">
                                        (empty)
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-1.5 tabular-nums">
                                    {s.hearingDate || "—"}
                                  </td>
                                  <td className="px-3 py-1.5 text-amber-800 dark:text-amber-300">
                                    {s.reason}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-3">
                      <button
                        className={BTN_PRIMARY}
                        onClick={() => {
                          setViewMode("dashboard");
                          resetImport();
                          fetchPage(
                            1,
                            pageSize,
                            sortKey,
                            sortDir,
                            searchTerm,
                            statusFilter,
                            phStatusFilter,
                            indicatorFilter,
                          );
                        }}
                      >
                        ← Dashboard
                      </button>
                      <button className={BTN_SECONDARY} onClick={resetImport}>
                        Import Another
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {/* ════════════════ ADD MODAL ════════════════ */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
              <h2 className="text-sm font-semibold">
                ➕ Add Post-Hearing Record
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-muted-foreground hover:text-foreground text-lg"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-destructive">
                    Claimant *
                  </label>
                  <input
                    className={INPUT}
                    value={addData.claimant || ""}
                    onChange={(e) =>
                      setAddData((p: Partial<PostHrgDevRow>) => ({
                        ...p,
                        claimant: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Hearing Date</label>
                  <input
                    type="date"
                    className={INPUT}
                    value={addData.hearing_date || ""}
                    onChange={(e) =>
                      setAddData((p: Partial<PostHrgDevRow>) => ({
                        ...p,
                        hearing_date: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">PH Status</label>
                  <select
                    className={SELECT_CLS}
                    value={addData.post_hearing_status || ""}
                    onChange={(e) =>
                      setAddData((p: Partial<PostHrgDevRow>) => ({
                        ...p,
                        post_hearing_status: e.target.value,
                      }))
                    }
                  >
                    <option value="">—</option>
                    {PH_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Rep</label>
                  <select
                    className={SELECT_CLS}
                    value={addData.assigned_rep || ""}
                    onChange={(e) =>
                      setAddData((p: Partial<PostHrgDevRow>) => ({
                        ...p,
                        assigned_rep: e.target.value,
                      }))
                    }
                  >
                    <option value="">—</option>
                    {REP_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Responsible</label>
                  <select
                    className={SELECT_CLS}
                    value={addData.person_responsible || ""}
                    onChange={(e) =>
                      setAddData((p: Partial<PostHrgDevRow>) => ({
                        ...p,
                        person_responsible: e.target.value,
                      }))
                    }
                  >
                    <option value="">—</option>
                    {RESPONSIBLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Status</label>
                  <select
                    className={SELECT_CLS}
                    value={addData.status || ""}
                    onChange={(e) =>
                      setAddData((p: Partial<PostHrgDevRow>) => ({
                        ...p,
                        status: e.target.value,
                      }))
                    }
                  >
                    <option value="">—</option>
                    {DYNAMIC_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Deadline</label>
                  <input
                    type="date"
                    className={INPUT}
                    value={addData.deadline || ""}
                    onChange={(e) =>
                      setAddData((p: Partial<PostHrgDevRow>) => ({
                        ...p,
                        deadline: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Docs Needed</label>
                <select
                  className={SELECT_CLS}
                  value={addData.type_of_docs_needed || ""}
                  onChange={(e) =>
                    setAddData((p: Partial<PostHrgDevRow>) => ({
                      ...p,
                      type_of_docs_needed: e.target.value,
                    }))
                  }
                >
                  <option value="">—</option>
                  {DYNAMIC_DOCS_NEEDED_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Details</label>
                <textarea
                  className={cn(INPUT, "min-h-16 resize-y")}
                  value={addData.details || ""}
                  onChange={(e) =>
                    setAddData((p: Partial<PostHrgDevRow>) => ({
                      ...p,
                      details: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Remarks</label>
                <textarea
                  className={cn(INPUT, "min-h-16 resize-y")}
                  value={addData.remarks || ""}
                  onChange={(e) =>
                    setAddData((p: Partial<PostHrgDevRow>) => ({
                      ...p,
                      remarks: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!addData.em_sent_task_created}
                    onChange={(e) =>
                      setAddData((p: Partial<PostHrgDevRow>) => ({
                        ...p,
                        em_sent_task_created: e.target.checked,
                      }))
                    }
                    className="accent-primary"
                  />
                  EM/Task Created
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!addData.ext_letter_sent}
                    onChange={(e) =>
                      setAddData((p: Partial<PostHrgDevRow>) => ({
                        ...p,
                        ext_letter_sent: e.target.checked,
                      }))
                    }
                    className="accent-primary"
                  />
                  EXT Letter Sent
                </label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t px-5 py-3 shrink-0">
              <button
                className={BTN_SECONDARY}
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </button>
              <button
                className={BTN_SUCCESS}
                onClick={saveNewRecord}
                disabled={saving}
              >
                {saving ? "Saving..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ════════════════ DETAILS MODAL ════════════════ */}
      {detailsModal && (
        <DetailsModal
          record={detailsModal}
          userName={userName}
          onClose={() => setDetailsModal(null)}
          onRecordUpdate={handleRecordUpdate}
          onFieldUpdate={handleFieldUpdate}
        />
      )}
      {/* ════════════════ NOTE MODAL ════════════════ */}
      {noteModal && (
        <NoteModal
          record={noteModal.record}
          field={noteModal.field}
          fieldLabel={noteModal.label}
          userName={userName}
          onClose={() => setNoteModal(null)}
          onRecordUpdate={handleRecordUpdate}
        />
      )}
      {/* ════════════════ POST HRG REVIEW MODAL ════════════════ */}
      {postHrgModal &&
        (postHrgModal.record_type === "MR" && postHrgModal.hearing_id ? (
          <PostHrgReviewModal
            mode="hearing"
            hearingId={postHrgModal.hearing_id}
            claimant={postHrgModal.claimant}
            hearingDateText={
              postHrgModal.hearing_date
                ? new Date(
                    postHrgModal.hearing_date + "T12:00:00",
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : null
            }
            assignedRep={postHrgModal.assigned_rep}
            userName={userName}
            userRole={userRole}
            initialNotes={postHrgModal.post_hrg_notes}
            initialDeadline={postHrgModal.post_hrg_deadline}
            initialRequirements={null}
            initialDeadlinePrev={null}
            initialDeadlineChangedBy={null}
            onClose={() => setPostHrgModal(null)}
            onHearingPatch={(patch) => {
              const next = { ...postHrgModal } as PostHrgDevRow;
              if (patch.post_hrg_notes !== undefined) {
                (
                  next as unknown as { post_hrg_notes: string | null }
                ).post_hrg_notes = patch.post_hrg_notes;
              }
              if (patch.post_hrg_deadline !== undefined) {
                (
                  next as unknown as { post_hrg_deadline: string | null }
                ).post_hrg_deadline = patch.post_hrg_deadline;
              }
              handleRecordUpdate(next);
            }}
            onCascadeApplied={handleCascadeApplied}
          />
        ) : (
          <PostHrgReviewModal
            mode="phd-internal"
            phdRowId={postHrgModal.id}
            linkedHearingId={postHrgModal.hearing_id}
            currentRecordType={postHrgModal.record_type}
            claimant={postHrgModal.claimant}
            hearingDateText={
              postHrgModal.hearing_date
                ? new Date(
                    postHrgModal.hearing_date + "T12:00:00",
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : null
            }
            assignedRep={postHrgModal.assigned_rep}
            userName={userName}
            userRole={userRole}
            initialNotes={postHrgModal.details_notes}
            initialDeadline={postHrgModal.deadline}
            initialRequirements={postHrgModal.requirements}
            onClose={() => setPostHrgModal(null)}
            onPhdPatch={(patch) => {
              handleRecordUpdate({
                ...postHrgModal,
                details_notes:
                  patch.details_notes !== undefined
                    ? patch.details_notes
                    : postHrgModal.details_notes,
                deadline:
                  patch.deadline !== undefined
                    ? patch.deadline
                    : postHrgModal.deadline,
                requirements:
                  patch.requirements !== undefined
                    ? patch.requirements
                    : postHrgModal.requirements,
              });
            }}
            onCascadeApplied={handleCascadeApplied}
          />
        ))}
      {/* ════════════════ REMARKS MODAL ════════════════ */}
      {remarksModal && (
        <RemarksModal
          record={remarksModal}
          onClose={() => setRemarksModal(null)}
          onSave={(id, field, value) => {
            handleFieldUpdate(id, field, value);
            setRemarksModal((prev) =>
              prev?.id === id ? { ...prev, remarks: value } : prev,
            );
          }}
        />
      )}
      <PostHrgDetailPanel
        row={detailPanel}
        onClose={() => setDetailPanel(null)}
      />
      <PostHrgReportsModal
        open={showReportsModal}
        onClose={() => setShowReportsModal(false)}
        recordType={recordType}
      />

      {/* ════════════════ DELETE CONFIRMATION ════════════════ */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            if (deletingId === null) {
              setDeleteConfirm(null);
              setDeleteConfirmText("");
            }
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl border bg-card shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                <Trash2 className="h-4 w-4" strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Delete record?</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {deleteConfirm.claimant}
                </p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                This permanently removes the post-hearing record. Notes,
                deadlines, requirements, and acknowledgement state are deleted
                along with it. This cannot be undone.
              </p>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  Type{" "}
                  <span className="font-mono font-semibold text-foreground">
                    delete
                  </span>{" "}
                  to confirm:
                </label>
                <input
                  type="text"
                  autoFocus
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      deleteConfirmText.trim().toLowerCase() === "delete" &&
                      deletingId === null
                    ) {
                      handleConfirmDelete();
                    }
                  }}
                  placeholder="delete"
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/40 focus:border-red-400"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <button
                className={cn(BTN_SECONDARY, "px-3 py-1.5 text-xs")}
                onClick={() => {
                  setDeleteConfirm(null);
                  setDeleteConfirmText("");
                }}
                disabled={deletingId !== null}
              >
                Cancel
              </button>
              <button
                className={cn(
                  BTN,
                  "px-3 py-1.5 text-xs bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-600",
                )}
                onClick={handleConfirmDelete}
                disabled={
                  deletingId !== null ||
                  deleteConfirmText.trim().toLowerCase() !== "delete"
                }
              >
                {deletingId !== null ? "Deleting…" : "Delete record"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ COMPLETE CONFIRMATION ════════════════ */}
      {completedConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setCompletedConfirm(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border bg-card shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
                ✓
              </div>
              <div>
                <h3 className="text-sm font-semibold">Mark as Completed?</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {completedConfirm.claimant}
                </p>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-muted-foreground">
                This record will be moved to the{" "}
                <span className="font-medium text-foreground">Completed</span>{" "}
                list and removed from the main grid. This can be undone by
                reopening the record from the Completed modal.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <button
                className={cn(BTN_SECONDARY, "px-3 py-1.5 text-xs")}
                onClick={() => setCompletedConfirm(null)}
              >
                Cancel
              </button>
              <button
                className={cn(
                  BTN,
                  "px-3 py-1.5 text-xs bg-emerald-600 text-white hover:bg-emerald-700",
                )}
                onClick={() => handleConfirmComplete(completedConfirm.id)}
              >
                Yes, mark as Completed
              </button>
            </div>
          </div>
        </div>
      )}

      <PostHrgActivityModal
        open={showActivityLog}
        onClose={() => setShowActivityLog(false)}
      />
      <PostHrgCompletedModal
        open={showCompletedModal}
        recordType={recordType}
        onClose={() => setShowCompletedModal(false)}
        onReopen={() => {
          // Reopened row now lives back in the main grid as "In Progress" —
          // refetch + decrement the badge.
          setCompletedCount((n) => Math.max(0, n - 1));
          fetchPage(
            page,
            pageSize,
            sortKey,
            sortDir,
            searchTerm,
            statusFilter,
            phStatusFilter,
            indicatorFilter,
          );
        }}
      />
    </>
  );
}

"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { AppHeader } from "@/components/layout";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { StatCard, StatCardGrid } from "@/components/stat-card";
import type { UserRole } from "@/lib/roles";
import * as XLSX from "xlsx";
import {
  fetchPostHrgDevPage,
  fetchPostHrgDevStats,
  createPostHrgDevRecord,
  updatePostHrgDevField,
  deletePostHrgDevRecord,
  importPostHrgDevRecords,
  addPostHrgDevNote,
  deletePostHrgDevNote,
  fetchPostHrgDevNotes,
  type PostHrgDevRow,
  type PostHrgDevStats,
  type ConfigOption,
  type RepOption,
  type ResponsibleOption,
} from "./actions";

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
        "h-6 w-full rounded border px-1 text-[11px] font-semibold cursor-pointer transition-colors",
        "focus:outline-none focus:ring-1 focus:ring-blue-400",
        currentHex
          ? "border-current"
          : "border-transparent hover:border-border text-foreground bg-card",
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
        className="h-4 w-4 rounded accent-green-600 cursor-pointer"
      />
    </div>
  );
}

function InlineDate({
  value,
  onSave,
  isOverdue,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  isOverdue?: boolean;
}) {
  return (
    <input
      type="date"
      value={value || ""}
      onChange={(e) => onSave(e.target.value || null)}
      className={cn(
        "h-6 w-full rounded border border-transparent px-1 text-[11px] tabular-nums bg-card cursor-pointer",
        "hover:border-border focus:outline-none focus:ring-1 focus:ring-blue-400",
        isOverdue && "text-red-600 font-bold",
      )}
    />
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

function ClaimantCell({
  record,
  onSave,
}: {
  record: PostHrgDevRow;
  onSave: (id: number, field: string, value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(record.claimant_link || "");
  const handleSave = () => {
    onSave(record.id, "claimant_link", url.trim() || null);
    setEditing(false);
  };
  return (
    <div className="min-w-0 pr-1">
      <div className="flex items-center gap-1 min-w-0">
        {record.claimant_link ? (
          <a
            href={record.claimant_link}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-xs font-medium text-blue-600 underline underline-offset-2 decoration-blue-400/60 hover:text-blue-800 hover:decoration-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            title={`${record.claimant} — Open case link`}
          >
            {record.claimant}
          </a>
        ) : (
          <span
            className="truncate text-xs font-medium"
            title={record.claimant}
          >
            {record.claimant}
          </span>
        )}
        {record.hearing_id && (
          <span
            className="shrink-0 text-[9px] text-blue-500 dark:text-blue-400"
            title="Linked to hearing"
          >
            🔗
          </span>
        )}
        <button
          onClick={() => {
            setUrl(record.claimant_link || "");
            setEditing(true);
          }}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-blue-600 hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit claimant link"
        >
          {record.claimant_link ? (
            <svg
              className="h-2.5 w-2.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          ) : (
            <svg
              className="h-2.5 w-2.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
          )}
        </button>
      </div>
      {editing &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setEditing(false)}
          >
            <div
              className="w-full max-w-md rounded-lg border bg-card p-4 shadow-lg space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold">
                Claimant Link — {record.claimant}
              </h3>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-md border bg-transparent px-3 py-2 text-xs focus:border-ring focus:outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") setEditing(false);
                }}
              />
              <div className="flex justify-end gap-2">
                {record.claimant_link && (
                  <button
                    className={cn(
                      BTN,
                      "px-3 py-1.5 text-xs text-red-600 hover:bg-red-50",
                    )}
                    onClick={() => {
                      onSave(record.id, "claimant_link", null);
                      setEditing(false);
                    }}
                  >
                    Remove Link
                  </button>
                )}
                <button
                  className={cn(
                    BTN,
                    "px-3 py-1.5 text-xs bg-muted text-foreground",
                  )}
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
                <button
                  className={cn(
                    BTN,
                    "px-3 py-1.5 text-xs bg-primary text-primary-foreground",
                  )}
                  onClick={handleSave}
                >
                  Save
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
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
  const notes = parseNotes(record.post_hrg_notes ?? null);
  const noteCount = notes.length;
  const deadline = record.post_hrg_deadline ?? null;

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

  // No linked hearing — show disabled state
  if (!record.hearing_id) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium bg-muted/30 text-muted-foreground/50 cursor-not-allowed"
        title="No linked hearing — Post HRG data syncs from hearing record"
      >
        🔗 No hearing
      </span>
    );
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

// ─── Post HRG Modal (syncs with hearings table via hearing_id) ───────────────

function PostHrgDevModal({
  record,
  onClose,
  onRecordUpdate,
  userName,
  userRole,
}: {
  record: PostHrgDevRow;
  onClose: () => void;
  onRecordUpdate: (r: PostHrgDevRow) => void;
  userName: string;
  userRole: string;
}) {
  const [notes, setNotes] = useState<PostHrgNote[]>(() =>
    parseNotes(record.post_hrg_notes ?? null),
  );
  const [newNote, setNewNote] = useState("");
  const [deadline, setDeadline] = useState(record.post_hrg_deadline || "");
  const [saving, setSaving] = useState(false);
  const [deadlineSaving, setDeadlineSaving] = useState(false);

  // Poll for updates every 8s (reads from hearings table server-side)
  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active || !record.hearing_id) return;
      try {
        const { fetchPostHrgNotes } = await import("@/app/(dashboard)/actions");
        const data = (await fetchPostHrgNotes(record.hearing_id)) as
          | string
          | { post_hrg_notes: string | null; post_hrg_deadline: string | null }
          | null;
        if (!active || !data) return;
        if (typeof data === "string") {
          setNotes(parseNotes(data));
        } else {
          setNotes(parseNotes(data.post_hrg_notes));
          if (data.post_hrg_deadline != null) {
            setDeadline(data.post_hrg_deadline);
          }
        }
      } catch {
        /* ignore */
      }
    };
    const id = setInterval(poll, 8000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [record.hearing_id]);

  const canEditNotes = [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_lead",
    "mr_agent",
    "post_hearing_admin",
    "post_hearing_staff",
  ].includes(userRole);

  const handleAddNote = async () => {
    if (!newNote.trim() || !canEditNotes || !record.hearing_id) return;
    setSaving(true);
    try {
      // Write to hearings table — same action as dashboard
      const { addDashboardPostHrgNote } =
        await import("@/app/(dashboard)/actions");
      const trimmed = newNote.trim();
      const r = await addDashboardPostHrgNote(
        record.hearing_id,
        trimmed,
        userName,
      );
      if (r.success) {
        const added: PostHrgNote = {
          user: userName,
          date: new Date().toISOString(),
          note: trimmed,
        };
        const updatedNotes = [added, ...notes];
        setNotes(updatedNotes);
        setNewNote("");
        // Sync back to local record state
        onRecordUpdate({
          ...record,
          post_hrg_notes: JSON.stringify(updatedNotes),
        } as PostHrgDevRow);
      }
    } catch {
      /* */
    }
    setSaving(false);
  };

  const handleDeleteNote = async (idx: number) => {
    if (!canEditNotes || !record.hearing_id) return;
    try {
      const { deleteDashboardPostHrgNote } =
        await import("@/app/(dashboard)/actions");
      const r = await deleteDashboardPostHrgNote(record.hearing_id, idx);
      if (r.success) {
        const updatedNotes = notes.filter((_, i) => i !== idx);
        setNotes(updatedNotes);
        onRecordUpdate({
          ...record,
          post_hrg_notes:
            updatedNotes.length > 0 ? JSON.stringify(updatedNotes) : null,
        } as PostHrgDevRow);
      }
    } catch {
      /* */
    }
  };

  const handleUpdateDeadline = async () => {
    if (!record.hearing_id) return;
    setDeadlineSaving(true);
    try {
      const { updateHearing } = await import("@/app/(dashboard)/actions");
      await updateHearing(
        record.hearing_id,
        "post_hrg_deadline",
        deadline || null,
      );
      onRecordUpdate({
        ...record,
        post_hrg_deadline: deadline || null,
      } as PostHrgDevRow);
    } catch {
      /* */
    }
    setDeadlineSaving(false);
  };

  const handleClearDeadline = async () => {
    if (!record.hearing_id) return;
    setDeadlineSaving(true);
    try {
      const { updateHearing } = await import("@/app/(dashboard)/actions");
      await updateHearing(record.hearing_id, "post_hrg_deadline", null);
      setDeadline("");
      onRecordUpdate({ ...record, post_hrg_deadline: null } as PostHrgDevRow);
    } catch {
      /* */
    }
    setDeadlineSaving(false);
  };

  const fmtD = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border bg-card shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
          <div>
            <h2 className="text-sm font-semibold">Post HRG Review</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {record.claimant}
              {record.hearing_date &&
                ` • ${new Date(record.hearing_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
              {record.assigned_rep && ` • ${record.assigned_rep}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground text-lg"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Sync notice */}
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-3 py-2">
            <span className="text-blue-500 text-sm">🔗</span>
            <p className="text-[11px] text-blue-700 dark:text-blue-400">
              Synced with hearing record — changes reflect on the main dashboard
              too.
            </p>
          </div>

          {/* Deadline */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Deadline Date</label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="h-8 rounded-lg border bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary w-auto"
              />
              <button
                className={cn(
                  BTN_OUTLINE,
                  "px-3 py-1 text-xs h-8 disabled:opacity-50",
                )}
                onClick={handleUpdateDeadline}
                disabled={deadlineSaving}
              >
                {deadlineSaving ? "Saving..." : "Update"}
              </button>
              {deadline && (
                <button
                  className={cn(BTN_SECONDARY, "px-3 py-1 text-xs h-8")}
                  onClick={handleClearDeadline}
                  disabled={deadlineSaving}
                >
                  Clear
                </button>
              )}
            </div>
            {record.post_hrg_deadline &&
              record.post_hrg_deadline !== deadline && (
                <p className="text-[10px] text-muted-foreground">
                  Saved:{" "}
                  <span className="font-medium">
                    {fmtD(record.post_hrg_deadline)}
                  </span>
                </p>
              )}
          </div>

          {/* Add note */}
          {canEditNotes ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Add New Note</label>
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={3}
                placeholder="Enter your note..."
                className={cn(INPUT, "resize-none text-xs")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAddNote();
                  }
                }}
              />
              <button
                className={cn(BTN_PRIMARY, "px-3 py-1.5 text-xs")}
                onClick={handleAddNote}
                disabled={saving || !newNote.trim()}
              >
                {saving ? "Saving..." : "Add Note"}
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic py-2">
              You do not have permission to add notes.
            </p>
          )}

          {/* Notes history */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">
              Notes History{" "}
              <span className="text-muted-foreground">({notes.length})</span>
            </label>
            {notes.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No notes yet
              </p>
            ) : (
              <div className="space-y-2">
                {notes.map((n, i) => (
                  <div
                    key={i}
                    className="rounded-lg border bg-muted/30 p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {n.user || "Unknown"}
                        </span>
                        {n.date && (
                          <span>
                            {new Date(n.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                      {canEditNotes && (
                        <button
                          onClick={() => handleDeleteNote(i)}
                          className="text-xs text-muted-foreground hover:text-red-600"
                        >
                          ✕
                        </button>
                      )}
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
            className={cn(BTN_SECONDARY, "px-3 py-1.5 text-xs")}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
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
      label: "Overdue",
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
  { key: "claimant", label: "Claimant", w: 175, sortable: true, frozen: true },
  { key: "ssn_last_4", label: "SSN", w: 62, frozen: true },
  { key: "hearing_date", label: "Hearing Date", w: 100, sortable: true },
  { key: "post_hearing_status", label: "PH Status", w: 130, sortable: true },
  { key: "type_of_docs_needed", label: "Docs Needed", w: 120 },
  { key: "details", label: "Details", w: 240 },
  { key: "assigned_rep", label: "Rep", w: 120, sortable: true },
  { key: "person_responsible", label: "Responsible", w: 120, sortable: true },
  { key: "em_sent_task_created", label: "EM/Task", w: 80 },
  { key: "ext_letter_sent", label: "EXT", w: 70 },
  { key: "status", label: "Status", w: 110, sortable: true },
  { key: "deadline", label: "Deadline", w: 110, sortable: true },
  // new_due_date REMOVED — replaced with post_hrg_review
  { key: "post_hrg_review", label: "Post HRG Review", w: 140 },
  { key: "remarks", label: "Remarks", w: 200 },
  { key: "actions", label: "", w: 70 },
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
  }: MemoRowProps) {
    const rb = ri % 2 === 0 ? evenBg : oddBg;
    return (
      <tr
        className={cn(
          "group border-b border-border/40 last:border-0",
          rb,
          overdue && "bg-red-50/50! dark:bg-red-950/10!",
        )}
      >
        {columns.map((col) => {
          const lp = getLeftPosFn(col.key);
          const isLF = col.key === lastFrozen;
          return (
            <td
              key={col.key}
              className={cn(
                "px-2 py-1.5",
                col.frozen && cn("sticky z-10 overflow-hidden", rb),
                isLF &&
                  "border-r-2 border-r-blue-400/40 dark:border-r-blue-500/40",
              )}
              style={{
                width: col.w,
                minWidth: col.w,
                maxWidth: col.frozen ? col.w : undefined,
                ...(lp !== undefined ? { left: lp } : {}),
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
    prev.overdue === next.overdue,
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
  initialRepresentatives,
  initialResponsibleOptions,
}: {
  userRole: string;
  userId: number;
  userName: string;
  initialRecords: PostHrgDevRow[];
  initialTotalFiltered: number;
  initialStats: PostHrgDevStats;
  initialPhStatusOptions: ConfigOption[];
  initialRepresentatives: RepOption[];
  initialResponsibleOptions: ResponsibleOption[];
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [records, setRecords] = useState<PostHrgDevRow[]>(initialRecords);
  const [totalFiltered, setTotalFiltered] = useState(initialTotalFiltered);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<PostHrgDevStats>(initialStats);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [phStatusFilter, setPhStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [sortKey, setSortKey] = useState("deadline");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const phStatusOptions = initialPhStatusOptions;
  const representatives = initialRepresentatives;
  const responsibleOptions = initialResponsibleOptions;

  const [showAddModal, setShowAddModal] = useState(false);
  const [addData, setAddData] = useState<Partial<PostHrgDevRow>>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Modals
  const [noteModal, setNoteModal] = useState<{
    record: PostHrgDevRow;
    field: string;
    label: string;
  } | null>(null);
  const [detailsModal, setDetailsModal] = useState<PostHrgDevRow | null>(null);
  const [postHrgModal, setPostHrgModal] = useState<PostHrgDevRow | null>(null);
  const [remarksModal, setRemarksModal] = useState<PostHrgDevRow | null>(null);

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
  const PH_STATUS_OPTIONS = useMemo(
    () => phStatusOptions.map((o) => ({ value: o.value, label: o.value })),
    [phStatusOptions],
  );
  const phStatusHexMap = useMemo(() => {
    const map: Record<string, { bg: string; color: string }> = {};
    for (const o of phStatusOptions) {
      if (o.color) map[o.value] = { bg: o.color + "22", color: o.color };
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
      const hex = o.color.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const isLight = (r * 299 + g * 587 + b * 114) / 1000 > 180;
      map[o.value] = { bg: o.color, color: isLight ? "#374151" : "#ffffff" };
    }
    return map;
  }, [responsibleOptions]);

  // ── Server-side fetch ──
  const refreshStats = useCallback(async () => {
    try {
      setStats(await fetchPostHrgDevStats());
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
    ) => {
      setLoading(true);
      try {
        const res = await fetchPostHrgDevPage({
          page: p,
          pageSize: ps,
          search: search?.trim() || undefined,
          status: status !== "all" ? status : undefined,
          phStatus: phStatus !== "all" ? phStatus : undefined,
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

  const handleFilterChange = useCallback(
    (newSearch: string, newStatus: string, newPhStatus: string) => {
      setSearchTerm(newSearch);
      setStatusFilter(newStatus);
      setPhStatusFilter(newPhStatus);
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
        );
      }, 300);
    },
    [fetchPage, pageSize, sortKey, sortDir],
  );

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
      );
    },
    [fetchPage, sortKey, sortDir, searchTerm, statusFilter, phStatusFilter],
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
    ],
  );

  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

  const handleFieldUpdate = useCallback(
    async (id: number, field: string, value: string | boolean | null) => {
      setRecords((prev) =>
        prev.map((r) =>
          r.id === id ? ({ ...r, [field]: value } as PostHrgDevRow) : r,
        ),
      );
      try {
        await updatePostHrgDevField(id, field, value);
        refreshStats();
      } catch {
        toast("Update failed");
        fetchPage(
          page,
          pageSize,
          sortKey,
          sortDir,
          searchTerm,
          statusFilter,
          phStatusFilter,
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
    ],
  );

  const handleClaimantLinkUpdate = useCallback(
    async (recordId: number, _field: string, value: string | null) => {
      const rec = records.find((r) => r.id === recordId);
      if (!rec?.hearing_id) {
        toast("Cannot edit link — no linked hearing");
        return;
      }
      try {
        const { updateHearing } = await import("@/app/(dashboard)/actions");
        await updateHearing(rec.hearing_id, "claimant_link", value);
        setRecords((prev) =>
          prev.map((r) =>
            r.id === recordId ? { ...r, claimant_link: value } : r,
          ),
        );
        toast("Link updated", "success");
      } catch {
        toast("Failed to update link");
      }
    },
    [records, toast],
  );

  const handleRecordUpdate = useCallback((updated: PostHrgDevRow) => {
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    // Keep open modal in sync
    setPostHrgModal((prev) => (prev?.id === updated.id ? updated : prev));
  }, []);

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
        );
      } else toast("Create failed: " + (result.message || ""));
    } catch {
      toast("Create failed");
    }
    setSaving(false);
  }, [
    addData,
    userId,
    toast,
    fetchPage,
    page,
    pageSize,
    sortKey,
    sortDir,
    searchTerm,
    statusFilter,
    phStatusFilter,
  ]);

  const deleteRecord = useCallback(
    async (id: number) => {
      try {
        const result = await deletePostHrgDevRecord(id);
        if (result.success) {
          setRecords((prev) => prev.filter((r) => r.id !== id));
          setDeleteConfirm(null);
          toast("Record deleted", "success");
          refreshStats();
        }
      } catch {
        toast("Delete failed");
      }
    },
    [toast, refreshStats],
  );

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
    setImportResult({ imported, matched: matchedTotal, errors });
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
      switch (col.key) {
        case "claimant":
          return <ClaimantCell record={r} onSave={handleClaimantLinkUpdate} />;
        case "ssn_last_4":
          return (
            <span className="text-xs font-mono text-muted-foreground">
              {r.ssn_last_4 ? r.ssn_last_4 : "—"}
            </span>
          );
        case "hearing_date":
          return (
            <span className="text-xs tabular-nums whitespace-nowrap">
              {fmtDate(r.hearing_date)}
            </span>
          );
        case "post_hearing_status":
          return (
            <InlineDropdown
              value={r.post_hearing_status}
              options={PH_STATUS_OPTIONS}
              onSave={(v) => handleFieldUpdate(r.id, "post_hearing_status", v)}
              hexColorMap={phStatusHexMap}
            />
          );
        case "type_of_docs_needed":
          return (
            <InlineDropdown
              value={r.type_of_docs_needed}
              options={DOCS_NEEDED_OPTIONS}
              onSave={(v) => handleFieldUpdate(r.id, "type_of_docs_needed", v)}
            />
          );
        case "details":
          return (
            <div className="relative">
              <DetailsCellBadge record={r} onClick={() => setDetailsModal(r)} />
            </div>
          );
        case "assigned_rep":
          return (
            <InlineDropdown
              value={r.assigned_rep}
              options={REP_OPTIONS}
              onSave={(v) => handleFieldUpdate(r.id, "assigned_rep", v)}
              placeholder="—"
            />
          );
        case "person_responsible":
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
          return (
            <div className="flex items-center gap-1">
              <InlineDropdown
                value={r.status}
                options={STATUS_OPTIONS}
                onSave={(v) => handleFieldUpdate(r.id, "status", v)}
                hexColorMap={STATUS_HEX}
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
        case "deadline":
          return (
            <InlineDate
              value={r.deadline}
              onSave={(v) => handleFieldUpdate(r.id, "deadline", v)}
              isOverdue={isOverdueCheck(r)}
            />
          );
        case "post_hrg_review":
          return <PostHrgCell record={r} onClick={() => setPostHrgModal(r)} />;
        case "remarks":
          return (
            <RemarksCellBadge record={r} onClick={() => setRemarksModal(r)} />
          );
        case "actions":
          return isAdmin ? (
            deleteConfirm === r.id ? (
              <div className="flex gap-1">
                <button
                  className={cn(
                    BTN,
                    "px-2 py-0.5 text-[10px] bg-red-600 text-white hover:bg-red-700",
                  )}
                  onClick={() => deleteRecord(r.id)}
                >
                  Yes
                </button>
                <button
                  className={cn(
                    BTN,
                    "px-2 py-0.5 text-[10px] bg-muted text-foreground",
                  )}
                  onClick={() => setDeleteConfirm(null)}
                >
                  No
                </button>
              </div>
            ) : (
              <button
                className={cn(
                  BTN,
                  "px-2 py-0.5 text-[10px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30",
                )}
                onClick={() => setDeleteConfirm(r.id)}
              >
                ✕
              </button>
            )
          ) : null;
        default:
          return <span className="text-xs">—</span>;
      }
    },
    [
      PH_STATUS_OPTIONS,
      phStatusHexMap,
      REP_OPTIONS,
      RESPONSIBLE_OPTIONS,
      responsibleHexMap,
      handleFieldUpdate,
      handleClaimantLinkUpdate,
      isAdmin,
      deleteConfirm,
      deleteRecord,
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
            <button
              className={cn(BTN_SUCCESS, "text-xs sm:text-sm")}
              onClick={() => setShowAddModal(true)}
            >
              + Add Record
            </button>
          )}
        </div>

        {viewMode === "dashboard" && (
          <>
            <StatsRow stats={stats} />

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
                    )
                  }
                />
                <div className="flex gap-2 flex-1 sm:flex-none">
                  <select
                    className={cn(SELECT_CLS, "flex-1 sm:w-40")}
                    value={statusFilter}
                    onChange={(e) =>
                      handleFilterChange(
                        searchTerm,
                        e.target.value,
                        phStatusFilter,
                      )
                    }
                  >
                    <option value="all">All Status</option>
                    {STATUS_OPTIONS.map((s) => (
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
                    <span className="text-xs tabular-nums">
                      Page{" "}
                      <input
                        type="number"
                        min={1}
                        max={totalPages}
                        value={page}
                        onChange={(e) => {
                          const p2 = parseInt(e.target.value);
                          if (p2 > 0 && p2 <= totalPages) handlePageChange(p2);
                        }}
                        className="w-12 rounded border bg-background px-1 py-0.5 text-xs text-center tabular-nums"
                      />{" "}
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
                    <div className="grid grid-cols-3 gap-3">
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
                      <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-4 text-center">
                        <div className="text-3xl font-bold text-red-700">
                          {importResult.errors.length}
                        </div>
                        <div className="text-sm text-red-600">Errors</div>
                      </div>
                    </div>
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
                    {STATUS_OPTIONS.map((o) => (
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
                  {DOCS_NEEDED_OPTIONS.map((o) => (
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
      {/* ════════════════ POST HRG MODAL ════════════════ */}
      {postHrgModal && (
        <PostHrgDevModal
          record={postHrgModal}
          onClose={() => setPostHrgModal(null)}
          onRecordUpdate={handleRecordUpdate}
          userName={userName}
          userRole={userRole}
        />
      )}
      {/* ════════════════ REMARKS MODAL ════════════════ */} ← ADD AFTER
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
    </>
  );
}

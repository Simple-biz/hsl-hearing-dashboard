"use client";

import {
  useState,
  useEffect,
  useTransition,
  useCallback,
  useRef,
  memo,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AppHeader } from "@/components/layout/app-header";
import {
  Download,
  Plus,
  Trash2,
  ExternalLink,
  ClipboardList,
  Loader2,
  X,
  Copy,
  Pencil,
  Check,
  StickyNote,
  RefreshCw,
  Eye,
  EyeOff,
  History,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

import {
  getPortalEntries,
  addPortalEntry,
  updatePortalEntry,
  updatePortalField,
  deletePortalEntry,
  getPortalNotes,
  addPortalNote,
  searchClaimantsForPortal,
} from "./action";
import type {
  PortalPageData,
  PortalEntry,
  PortalFilters,
  PortalStats,
  PortalNote,
  MrSpecialist,
  ClaimantSearchResult,
} from "./action";
import { PORTAL_ACTIONS } from "./types";
import { ActivityLogModal } from "@/components/modals";
import { PortalEntryAuditTrailModal } from "@/components/modals/portal-entry-audit-trail-modal";
import { PortalReportModal } from "@/components/modals/portal-report-modal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  // The Neon driver returns Postgres DATE / TIMESTAMP / TIMESTAMPTZ columns
  // as JS Date objects unless the column is cast to ::text in SELECT. Handle
  // both shapes defensively so a missed cast can't crash the whole page.
  let datePart: string;
  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) return "—";
    // toISOString() yields YYYY-MM-DDT... — slice off the date portion.
    datePart = d.toISOString().slice(0, 10);
  } else if (typeof d === "string") {
    datePart = d.slice(0, 10);
  } else {
    return "—";
  }
  return new Date(datePart + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

// Legacy mr_patient_portal rows stored client_name as "Last, First M." while
// hearings.claimant uses "First Last" — flip legacy rows on display so the
// table matches the format the rest of the app shows.
function formatClaimantName(raw: string | null | undefined): string {
  if (!raw) return "";
  const m = raw.match(/^([^,]+),\s*(.+)$/);
  if (m) return `${m[2].trim()} ${m[1].trim()}`;
  return raw;
}

function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

function specStyle(color: string | null | undefined): React.CSSProperties {
  if (!color) return {};
  return { backgroundColor: color, color: isLight(color) ? "#1f2937" : "#fff" };
}

function exportPortalCsv(entries: PortalEntry[]) {
  const headers = [
    "ID",
    "Date",
    "Hearing Date",
    "Specialist",
    "Client",
    "Provider",
    "MyCase",
    "Portal Link",
    "Username",
    "Password",
    "Got MR",
    "Approved TL",
  ];
  const rows = entries.map((e) => [
    e.id,
    e.entry_date ?? "",
    e.hearing_date ?? "",
    e.specialist_name ?? "",
    e.client_name,
    e.provider ?? "",
    e.mycase_link ?? "",
    e.portal_link ?? "",
    e.portal_username ?? "",
    e.portal_password ?? "",
    e.got_mr ? "Yes" : "No",
    e.approved_by_tl ? "Yes" : "No",
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `patient-portal-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  bg,
}: {
  label: string;
  value: number;
  bg: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl px-4 py-3 text-white flex flex-col gap-1",
        bg,
      )}
    >
      <div className="pointer-events-none absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -right-2 bottom-3 w-14 h-14 rounded-full bg-white/10" />
      <p className="relative text-[10px] font-semibold uppercase tracking-widest opacity-80">
        {label}
      </p>
      <p className="relative text-2xl font-bold tabular-nums leading-none">
        {value}
      </p>
    </div>
  );
}

// ─── Notes Modal ─────────────────────────────────────────────────────────────

function NotesModal({
  open,
  entryId,
  field,
  clientName,
  provider,
  canEdit,
  onClose,
  onNoteAdded,
}: {
  open: boolean;
  entryId: number;
  field: "username" | "password" | "approved" | "got_mr";
  clientName: string;
  provider: string | null;
  canEdit: boolean;
  onClose: () => void;
  onNoteAdded?: () => void;
}) {
  const [notes, setNotes] = useState<PortalNote[]>([]);
  const [notesLoading, startNotesTransition] = useTransition();
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  const FIELD_LABELS = {
    username: "Username Notes",
    password: "Password Notes",
    approved: "Approval Notes",
    got_mr: "Got MR Notes",
  };

  useEffect(() => {
    if (!open) return;
    startNotesTransition(async () => {
      const r = await getPortalNotes(entryId, field);
      setNotes(r.notes ?? []);
    });
  }, [open, entryId, field]);

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setSaving(true);
    const r = await addPortalNote(entryId, field, newNote.trim());
    if (r.success) {
      setNotes((prev) => [
        { user: "You", date: new Date().toISOString(), note: newNote.trim() },
        ...prev,
      ]);
      setNewNote("");
      onNoteAdded?.();
    }
    setSaving(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md flex flex-col rounded-xl border bg-card shadow-2xl max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-3 shrink-0">
          <h3 className="text-sm font-semibold">📝 {FIELD_LABELS[field]}</h3>
          <button onClick={onClose} aria-label="Close notes">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Sub-header: client + provider */}
        <div className="px-4 py-2 bg-muted/30 border-b shrink-0">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {formatClaimantName(clientName)}
            </span>
            {provider && <> · {provider}</>}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {canEdit && (
            <div className="space-y-2">
              <textarea
                rows={3}
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Enter your note…"
                className="w-full text-xs rounded-lg border border-border bg-muted px-3 py-2 resize-none text-foreground focus:outline-none focus:border-primary"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleAddNote}
                  disabled={saving || !newNote.trim()}
                  className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saving && <Loader2 size={10} className="animate-spin" />}
                  💬 Add Note
                </button>
              </div>
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground mb-2">
              Notes History{" "}
              <span className="font-normal">({notes.length})</span>
            </p>
            {notesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2
                  size={20}
                  className="animate-spin text-muted-foreground"
                />
              </div>
            ) : notes.length === 0 ? (
              <p className="text-xs text-center text-muted-foreground py-6 italic">
                No notes yet.
              </p>
            ) : (
              <div className="border border-border rounded-lg divide-y divide-border">
                {notes.map((n, i) => (
                  <div key={i} className="px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-primary">
                        {n.user}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(n.date).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-foreground whitespace-pre-wrap wrap-break-word">
                      {n.note}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2.5 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="text-xs px-4 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add / Edit Entry Modal ───────────────────────────────────────────────────

type EntryForm = {
  entry_date: string;
  hearing_date: string;
  client_name: string;
  provider: string;
  mycase_link: string;
  portal_link: string;
  portal_username: string;
  portal_password: string;
  got_mr: boolean;
  approved_by_tl: boolean;
  mr_specialist_id: number | null;
  hearing_id: number | null;
};

// ─── Claimant Search Combobox ────────────────────────────────────────────────
// Typeahead over the hearings table. On pick, calls onPick with the matched
// hearing — the modal uses that to auto-fill client_name + mycase_link +
// hearing_id. Typing a name that doesn't match any hearing is allowed (the
// entry is saved with hearing_id = null and just the typed name).

function ClaimantSearchInput({
  value,
  hearingId,
  onChange,
  onPick,
  onClear,
}: {
  value: string;
  hearingId: number | null;
  onChange: (name: string) => void;
  onPick: (r: ClaimantSearchResult) => void;
  onClear: () => void;
}) {
  const [results, setResults] = useState<ClaimantSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function runSearch(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const r = await searchClaimantsForPortal(q);
      setResults(r);
      setLoading(false);
      setOpen(true);
    }, 250);
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary";

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2">
        <input
          type="text"
          className={inputCls}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            runSearch(e.target.value);
          }}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          placeholder="Search claimant in hearings…"
        />
        {hearingId !== null && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted whitespace-nowrap"
            title="Unlink from hearing — keeps name, clears auto-filled link"
          >
            Unlink
          </button>
        )}
      </div>
      {hearingId !== null && (
        <p className="text-[10px] text-emerald-600 mt-0.5">
          ✓ Linked to hearing #{hearingId} — chronicle link will update live
        </p>
      )}
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {loading && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground flex items-center gap-2">
              <Loader2 size={10} className="animate-spin" /> Searching…
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">
              No matches. Press save to keep the typed name (no hearing link).
            </div>
          )}
          {!loading &&
            results.map((r) => (
              <button
                key={r.hearing_id}
                type="button"
                onClick={() => {
                  onPick(r);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-muted border-b border-border/40 last:border-0"
              >
                <div className="text-xs font-medium text-foreground truncate">
                  {r.claimant}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {r.claim_type && <span>{r.claim_type}</span>}
                  {r.hearing_date && <span>· {fmtDate(r.hearing_date)}</span>}
                  {r.claimant_link && (
                    <span className="text-blue-600">· MyCase</span>
                  )}
                  {r.chronicle_link && (
                    <span className="text-violet-600">· Chronicle</span>
                  )}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function AddEditModal({
  entry,
  specialists,
  canAssignSpecialist,
  canSetApproval,
  onClose,
  onSaved,
}: {
  entry: PortalEntry | null; // null = add mode
  specialists: MrSpecialist[];
  canAssignSpecialist: boolean;
  /** Tighter than canEdit — only system_admin / admin / mr_admin can flip
   *  the Approved by TL field. Non-permitted users see a disabled select. */
  canSetApproval: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!entry;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<EntryForm>({
    entry_date: entry?.entry_date ?? new Date().toISOString().slice(0, 10),
    hearing_date: entry?.hearing_date ?? "",
    client_name: entry?.client_name ?? "",
    provider: entry?.provider ?? "",
    mycase_link: entry?.mycase_link ?? "",
    portal_link: entry?.portal_link ?? "",
    portal_username: entry?.portal_username ?? "",
    portal_password: entry?.portal_password ?? "",
    got_mr: entry?.got_mr ?? false,
    approved_by_tl: entry?.approved_by_tl ?? false,
    mr_specialist_id: entry?.mr_specialist_id ?? null,
    hearing_id: entry?.hearing_id ?? null,
  });

  const set = (k: keyof EntryForm, v: string | boolean | number | null) =>
    setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.client_name.trim()) {
      setError("Client name is required.");
      return;
    }
    setSaving(true);
    setError("");
    const input = {
      ...form,
      entry_date: form.entry_date || null,
      hearing_date: form.hearing_date || null,
    };
    const r = isEdit
      ? await updatePortalEntry(entry!.id, input)
      : await addPortalEntry(input);
    setSaving(false);
    if (r.success) {
      onSaved();
      onClose();
    } else setError(r.message ?? "Save failed");
  }

  const inp =
    "w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary";
  const lbl =
    "text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block";
  const gotMrColor = form.got_mr
    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
    : "bg-red-50 text-red-700 border-red-200";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-xl border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <h2 className="text-sm font-semibold">
            {isEdit ? "✏️ Edit Portal Entry" : "➕ Add New Portal Entry"}
          </h2>
          <button onClick={onClose} aria-label="Close modal">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          {/* Basic Info */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 border-b pb-1">
              📋 Basic Information
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className={lbl}>Date</label>
                <div
                  className={cn(inp, "bg-muted/40 text-muted-foreground")}
                  title="Auto-set to the creation date"
                >
                  {fmtDate(form.entry_date) || "—"}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Set automatically when the entry is created.
                </p>
              </div>
              <div>
                <label className={lbl}>Hearing Date</label>
                <div
                  className={cn(inp, "bg-muted/40 text-muted-foreground")}
                  title={
                    form.hearing_id !== null
                      ? "Live from the linked hearing — updates if the dashboard reschedules"
                      : "Pick a claimant to link a hearing"
                  }
                >
                  {fmtDate(form.hearing_date) || "—"}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {form.hearing_id !== null
                    ? "Live from hearings — edit in the dashboard if it changes."
                    : "Link a claimant below to pull the hearing date."}
                </p>
              </div>
            </div>
            <div>
              <label className={lbl}>
                Search Claimant <span className="text-red-500">*</span>
              </label>
              <ClaimantSearchInput
                value={form.client_name}
                hearingId={form.hearing_id}
                onChange={(name) => {
                  // Free typing — keep the existing link unless user clears it
                  setForm((p) => ({ ...p, client_name: name }));
                }}
                onPick={(r) => {
                  setForm((p) => ({
                    ...p,
                    client_name: r.claimant,
                    mycase_link: r.claimant_link ?? p.mycase_link,
                    hearing_id: r.hearing_id,
                    hearing_date: r.hearing_date ?? p.hearing_date,
                  }));
                }}
                onClear={() => {
                  setForm((p) => ({ ...p, hearing_id: null }));
                }}
              />
            </div>
            {/* MR Specialist — available in both Add and Edit modes. Permission
                gated identically to the inline-row dropdown; server-side gate
                in updatePortalEntry only enforces on an actual value change. */}
            <div className="mt-3">
              <label className={lbl}>MR Specialist</label>
              <select
                className={inp}
                value={form.mr_specialist_id ?? ""}
                onChange={(e) =>
                  set(
                    "mr_specialist_id",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
                disabled={!canAssignSpecialist}
                title={
                  !canAssignSpecialist
                    ? "Only Admin, Manager, MR Admin, MR Lead, or MR Agent can assign specialists"
                    : undefined
                }
              >
                <option value="">— Unassigned —</option>
                {specialists.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Provider */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 border-b pb-1">
              🏥 Provider Information
            </p>
            <div className="mb-3">
              <label className={lbl}>Provider Name</label>
              <input
                type="text"
                className={inp}
                value={form.provider}
                onChange={(e) => set("provider", e.target.value)}
                placeholder="e.g., Quest Diagnostics"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={lbl}>MyCase Link</label>
                <input
                  type="url"
                  className={inp}
                  value={form.mycase_link}
                  onChange={(e) => set("mycase_link", e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <div>
                <label className={lbl}>Patient Portal Link</label>
                <input
                  type="url"
                  className={inp}
                  value={form.portal_link}
                  onChange={(e) => set("portal_link", e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>
          </div>

          {/* Credentials */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 border-b pb-1">
              🔐 Login Credentials
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Username</label>
                <input
                  type="text"
                  className={inp}
                  value={form.portal_username}
                  onChange={(e) => set("portal_username", e.target.value)}
                  placeholder="Portal username or email"
                />
              </div>
              <div>
                <label className={lbl}>Password</label>
                <input
                  type="text"
                  className={inp}
                  value={form.portal_password}
                  onChange={(e) => set("portal_password", e.target.value)}
                  placeholder="Portal password"
                />
              </div>
            </div>
          </div>

          {/* Status */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 border-b pb-1">
              ✅ Status
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Got the MR?</label>
                <select
                  className={cn(inp, "cursor-pointer font-medium", gotMrColor)}
                  value={form.got_mr ? "1" : "0"}
                  onChange={(e) => set("got_mr", e.target.value === "1")}
                >
                  <option value="0">No</option>
                  <option value="1">Yes</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Approved by TL</label>
                <select
                  className={cn(
                    inp,
                    !canSetApproval &&
                      "cursor-not-allowed opacity-60 bg-muted/30",
                  )}
                  value={form.approved_by_tl ? "1" : "0"}
                  onChange={(e) =>
                    set("approved_by_tl", e.target.value === "1")
                  }
                  disabled={!canSetApproval}
                  title={
                    !canSetApproval
                      ? "Only Admin or MR Admin can change this"
                      : undefined
                  }
                >
                  <option value="0">No</option>
                  <option value="1">Yes</option>
                </select>
                {!canSetApproval && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Locked — only Admin or MR Admin can flip this.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3 bg-muted/30 shrink-0">
          <button
            onClick={onClose}
            className="text-xs px-4 py-2 rounded-lg border border-border bg-card hover:bg-muted text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60 flex items-center gap-1.5"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            💾 {isEdit ? "Update Entry" : "Save Entry"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Mobile Card ─────────────────────────────────────────────────────────────
// Shown on small screens instead of the wide data grid.

const PortalMobileCard = memo(function PortalMobileCard({
  entry,
  permissions,
  onEdit,
  onDelete,
  onOpenNotes,
}: {
  entry: PortalEntry;
  permissions: PortalPageData["permissions"];
  onEdit: (e: PortalEntry) => void;
  onDelete: (id: number) => void;
  onOpenNotes: (
    id: number,
    field: "username" | "password" | "approved" | "got_mr",
    clientName: string,
    provider: string | null,
  ) => void;
}) {
  const { canEditEntry, canDeleteEntry } = permissions;
  const specColor = entry.specialist_color;

  return (
    <div className="border-b border-border/40 px-4 py-3 space-y-2 hover:bg-muted/20 dark:hover:bg-muted/60 transition-colors">
      {/* Header row: client + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-primary truncate">
            {formatClaimantName(entry.client_name)}
          </p>
          {entry.provider && (
            <p className="text-[11px] text-muted-foreground truncate">
              {entry.provider}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canEditEntry && (
            <button
              onClick={() => onEdit(entry)}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground"
              aria-label="Edit entry"
            >
              <Pencil size={14} />
            </button>
          )}
          {canDeleteEntry && (
            <button
              onClick={() => onDelete(entry.id)}
              className="p-1.5 rounded hover:bg-red-50 text-red-500"
              aria-label="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Dates + Specialist */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {entry.entry_date && (
          <span>
            📅 Entry:{" "}
            <span className="text-foreground">{fmtDate(entry.entry_date)}</span>
          </span>
        )}
        {entry.hearing_date && (
          <span>
            🎧 Hearing:{" "}
            <span className="text-foreground">
              {fmtDate(entry.hearing_date)}
            </span>
          </span>
        )}
        {entry.specialist_name && (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={specStyle(specColor ?? null)}
          >
            {entry.specialist_name}
          </span>
        )}
      </div>

      {/* Links row */}
      {(entry.mycase_link || entry.portal_link) && (
        <div className="flex items-center gap-2 flex-wrap">
          {entry.mycase_link && (
            <a
              href={entry.mycase_link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded"
            >
              <ExternalLink size={9} />
              MyCase
            </a>
          )}
          {entry.portal_link && (
            <a
              href={entry.portal_link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded"
            >
              <ExternalLink size={9} />
              Portal
            </a>
          )}
        </div>
      )}

      {/* Credentials */}
      {(entry.portal_username || entry.portal_password) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          {entry.portal_username && (
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground">User:</span>
              <span className="font-mono">{entry.portal_username}</span>
              <button
                onClick={() =>
                  navigator.clipboard.writeText(entry.portal_username!)
                }
                className="text-muted-foreground hover:text-primary"
                aria-label="Copy username"
              >
                <Copy size={10} />
              </button>
              <button
                onClick={() =>
                  onOpenNotes(
                    entry.id,
                    "username",
                    entry.client_name,
                    entry.provider,
                  )
                }
                className={cn(
                  "text-[9px] px-1 py-0.5 rounded border",
                  entry.username_notes.length > 0
                    ? "bg-blue-100 border-blue-300 text-blue-700"
                    : "border-border text-muted-foreground",
                )}
              >
                <StickyNote size={8} className="inline" />
                {entry.username_notes.length > 0
                  ? entry.username_notes.length
                  : ""}
              </button>
            </span>
          )}
          {entry.portal_password && (
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground">Pass:</span>
              <span>••••••</span>
              <button
                onClick={() =>
                  navigator.clipboard.writeText(entry.portal_password!)
                }
                className="text-muted-foreground hover:text-primary"
                aria-label="Copy password"
              >
                <Copy size={10} />
              </button>
              <button
                onClick={() =>
                  onOpenNotes(
                    entry.id,
                    "password",
                    entry.client_name,
                    entry.provider,
                  )
                }
                className={cn(
                  "text-[9px] px-1 py-0.5 rounded border",
                  entry.password_notes.length > 0
                    ? "bg-blue-100 border-blue-300 text-blue-700"
                    : "border-border text-muted-foreground",
                )}
              >
                <StickyNote size={8} className="inline" />
                {entry.password_notes.length > 0
                  ? entry.password_notes.length
                  : ""}
              </button>
            </span>
          )}
        </div>
      )}

      {/* Status badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            "px-2 py-0.5 rounded text-[10px] font-medium",
            entry.got_mr
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-600",
          )}
        >
          {entry.got_mr ? "✅ Got MR" : "⏳ Pending MR"}
        </span>
        <button
          onClick={() =>
            onOpenNotes(entry.id, "got_mr", entry.client_name, entry.provider)
          }
          className={cn(
            "text-[9px] px-1.5 py-0.5 rounded border",
            entry.got_mr_notes.length > 0
              ? "bg-blue-100 border-blue-300 text-blue-700"
              : "border-border text-muted-foreground",
          )}
        >
          <StickyNote size={8} className="inline" />
          MR Notes{" "}
          {entry.got_mr_notes.length > 0
            ? `(${entry.got_mr_notes.length})`
            : ""}
        </button>
        {entry.approved_by_tl && (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
            ✓ Approved TL
          </span>
        )}
        <button
          onClick={() =>
            onOpenNotes(entry.id, "approved", entry.client_name, entry.provider)
          }
          className={cn(
            "text-[9px] px-1.5 py-0.5 rounded border",
            entry.approved_notes.length > 0
              ? "bg-blue-100 border-blue-300 text-blue-700"
              : "border-border text-muted-foreground",
          )}
        >
          <StickyNote size={8} className="inline" /> Approval Notes{" "}
          {entry.approved_notes.length > 0
            ? `(${entry.approved_notes.length})`
            : ""}
        </button>
      </div>
    </div>
  );
});

// ─── Portal Table Row ─────────────────────────────────────────────────────────
// Shared grid — header and rows must use identical values.
// Date(90) | HearingDate(90) | Specialist(130) | ClientName(160) | Provider(160+) |
// PortalLink(95) | Username(160) | Password(180) | GotMR(100) | ApprovedTL(95) | Actions(95)
// MyCase column removed — the link is now reachable from the claimant name.
// Provider uses `minmax(160px, 1fr)` so it (a) has reasonable baseline width,
// and (b) absorbs any extra horizontal space on wide screens — preventing a
// trailing gap after the Actions column. Password is a fixed 180px so the
// revealed value + Eye + Copy + Notes icons all fit without truncation.
// PortalLink + GotMR widened (75→95, 70→100) so their content has enough
// horizontal slack to render visibly centered against the column header
// (at the previous widths, content nearly filled the column edge-to-edge
// and `justify-center` had almost no room to act). Actions widened
// (70→95) to fit the new History button alongside Edit + Delete.
const PORTAL_GRID =
  "90px 90px 130px 160px minmax(160px,1fr) 95px 160px 180px 100px 95px 95px";
const PORTAL_MIN_W = "1355px";

// ─── Claimant Name Display (ClaimantCell-style) ──────────────────────────────
// Mirrors the dashboard's claimant cell so a portal entry "looks like" a
// hearings row: name links to mycase, copy button, claim type + chronicle
// button. chronicle_link and claim_type are joined live from hearings (via
// the LEFT JOIN in getPortalEntries) so edits on the dashboard flow through.

function ClaimantNameDisplay({ entry }: { entry: PortalEntry }) {
  const [copied, setCopied] = useState(false);
  const name = formatClaimantName(entry.client_name);
  const mycase = entry.mycase_link ?? null;
  const chronicle = entry.chronicle_link ?? null;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const esc = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    try {
      if (mycase && typeof ClipboardItem !== "undefined") {
        const html = `<a href="${esc(mycase)}">${esc(name)}</a>`;
        const plain = `${name}\n${mycase}`;
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(mycase ? `${name}\n${mycase}` : name);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 min-w-0">
        {mycase ? (
          <button
            type="button"
            onClick={() => window.open(mycase, "_blank", "noopener,noreferrer")}
            className="truncate text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400 text-left"
          >
            {name}
          </button>
        ) : (
          <strong className="truncate text-[11px] font-medium text-foreground">
            {name}
          </strong>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-blue-600 hover:bg-muted"
          title={mycase ? "Copy name + MyCase link" : "Copy name"}
        >
          {copied ? (
            <Check className="h-2.5 w-2.5 text-emerald-600" />
          ) : (
            <Copy className="h-2.5 w-2.5" />
          )}
        </button>
      </div>
      {(entry.claim_type || chronicle) && (
        <div className="flex items-center gap-1.5 mt-0.5">
          {entry.claim_type && (
            <span className="truncate text-[9px] text-muted-foreground">
              {entry.claim_type}
            </span>
          )}
          {chronicle && (
            <button
              type="button"
              onClick={() =>
                window.open(chronicle, "_blank", "noopener,noreferrer")
              }
              className="text-[9px] font-medium text-violet-600 hover:underline dark:text-violet-400"
            >
              Chronicle
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const PortalRow = memo(function PortalRow(props: {
  entry: PortalEntry;
  permissions: PortalPageData["permissions"];
  onDelete: (id: number) => void;
  onEdit: (e: PortalEntry) => void;
  onOpenNotes: (
    id: number,
    field: "username" | "password" | "approved" | "got_mr",
    clientName: string,
    provider: string | null,
  ) => void;
  onToggleApproved?: (id: number, next: boolean) => void;
  onOpenHistory?: (e: PortalEntry) => void;
}) {
  return <PortalRowInner {...props} />;
});

function PortalRowInner({
  entry,
  permissions,
  onDelete,
  onEdit,
  onOpenNotes,
  onToggleApproved,
  onOpenHistory,
}: {
  entry: PortalEntry;
  permissions: PortalPageData["permissions"];
  onDelete: (id: number) => void;
  onEdit: (e: PortalEntry) => void;
  onOpenNotes: (
    id: number,
    field: "username" | "password" | "approved" | "got_mr",
    clientName: string,
    provider: string | null,
  ) => void;
  onToggleApproved?: (id: number, next: boolean) => void;
  onOpenHistory?: (e: PortalEntry) => void;
}) {
  const { canEditEntry, canDeleteEntry } = permissions;
  const specColor = entry.specialist_color;
  // Per-row reveal state — resets when the row unmounts (e.g. virtualizer
  // scrolls it off-screen), so passwords don't stay visible indefinitely.
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div
      className="grid px-2 border-b border-border/40 hover:bg-muted/30 dark:hover:bg-muted/70 transition-colors text-[11px] items-center"
      style={{
        gridTemplateColumns: PORTAL_GRID,
        // Single explicit row that fills the wrapper height. Without this,
        // the implicit row sizes to content (~30px) and the border-b sits
        // mid-row, with subsequent content visible below the divider.
        gridTemplateRows: "1fr",
        minWidth: PORTAL_MIN_W,
        height: "100%",
      }}
    >
      {/* Date */}
      <div className="px-1">
        <span>{fmtDate(entry.entry_date)}</span>
      </div>

      {/* Hearing Date */}
      <div className="px-1 text-center">
        <span>{fmtDate(entry.hearing_date)}</span>
      </div>

      {/* Specialist */}
      <div className="px-1">
        {entry.specialist_name ? (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={specStyle(specColor ?? null)}
          >
            {entry.specialist_name}
          </span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </div>

      {/* Client Name — ClaimantCell-style: name (linked to mycase), copy,
          claim_type + chronicle button. Same visual language as
          dashboard-client so the row "looks like" a hearings row. */}
      <div className="px-1 min-w-0">
        <ClaimantNameDisplay entry={entry} />
      </div>

      {/* Provider */}
      <div className="px-1 min-w-0">
        <span
          className="text-[11px] leading-tight truncate block"
          title={entry.provider ?? undefined}
        >
          {entry.provider ?? "—"}
        </span>
      </div>

      {/* Portal Link */}
      <div className="px-1 flex justify-center items-center gap-1 whitespace-nowrap">
        {entry.portal_link ? (
          <a
            href={entry.portal_link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded hover:bg-emerald-700"
          >
            <ExternalLink size={8} className="mr-0.5" />
            🔗
          </a>
        ) : (
          <span className="text-muted-foreground/30">—</span>
        )}
      </div>

      {/* Username */}
      <div className="px-1 flex items-center gap-1 min-w-0">
        <span className="flex-1 text-[10px] truncate">
          {entry.portal_username ?? "—"}
        </span>
        {entry.portal_username && (
          <button
            onClick={() =>
              navigator.clipboard.writeText(entry.portal_username!)
            }
            className="shrink-0 text-muted-foreground hover:text-primary p-0.5 rounded"
            aria-label="Copy username"
          >
            <Copy size={10} />
          </button>
        )}
        <button
          onClick={() =>
            onOpenNotes(entry.id, "username", entry.client_name, entry.provider)
          }
          className={cn(
            "shrink-0 text-[9px] px-1 py-0.5 rounded border transition-colors",
            entry.username_notes.length > 0
              ? "bg-blue-100 border-blue-300 text-blue-700"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
          aria-label={`Username notes (${entry.username_notes.length})`}
        >
          <StickyNote size={9} className="inline" />
          {entry.username_notes.length > 0 ? entry.username_notes.length : ""}
        </button>
      </div>

      {/* Password — extra pr-3 creates visible breathing room before the
          Got MR? column so the notes button doesn't crowd against it. */}
      <div className="px-1 pr-3 flex items-center gap-1 min-w-0">
        <span
          className={cn(
            "flex-1 text-[10px] truncate",
            showPassword && "font-mono",
          )}
          title={showPassword ? entry.portal_password ?? undefined : undefined}
        >
          {entry.portal_password
            ? showPassword
              ? entry.portal_password
              : "••••••"
            : "—"}
        </span>
        {entry.portal_password && (
          <>
            <button
              onClick={() => setShowPassword((v) => !v)}
              className="shrink-0 text-muted-foreground hover:text-primary p-0.5 rounded"
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={10} /> : <Eye size={10} />}
            </button>
            <button
              onClick={() =>
                navigator.clipboard.writeText(entry.portal_password!)
              }
              className="shrink-0 text-muted-foreground hover:text-primary p-0.5 rounded"
              aria-label="Copy password"
            >
              <Copy size={10} />
            </button>
          </>
        )}
        <button
          onClick={() =>
            onOpenNotes(entry.id, "password", entry.client_name, entry.provider)
          }
          className={cn(
            "shrink-0 text-[9px] px-1 py-0.5 rounded border transition-colors",
            entry.password_notes.length > 0
              ? "bg-blue-100 border-blue-300 text-blue-700"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
          aria-label={`Password notes (${entry.password_notes.length})`}
        >
          <StickyNote size={9} className="inline" />
          {entry.password_notes.length > 0 ? entry.password_notes.length : ""}
        </button>
      </div>

      {/* Got MR? — badge is the focal point and sits at TRUE column center
          via `justify-center` on the only flow child. Notes button is
          absolutely positioned to the right so its width doesn't bias the
          flex-group's visual center away from the badge (previously the
          badge+button group was centered, which placed the badge slightly
          left of column center). */}
      <div className="px-1 flex items-center justify-center relative">
        <span
          className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-medium",
            entry.got_mr
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-600",
          )}
        >
          {entry.got_mr ? "✅ Yes" : "⏳ No"}
        </span>
        <button
          onClick={() =>
            onOpenNotes(entry.id, "got_mr", entry.client_name, entry.provider)
          }
          className={cn(
            "absolute right-1 top-1/2 -translate-y-1/2 text-[9px] px-1 py-0.5 rounded border",
            entry.got_mr_notes.length > 0
              ? "bg-blue-100 border-blue-300 text-blue-700"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
          aria-label={`Got MR notes (${entry.got_mr_notes.length})`}
        >
          <StickyNote size={9} className="inline" />
          {entry.got_mr_notes.length > 0 ? entry.got_mr_notes.length : ""}
        </button>
      </div>

      {/* Approved by TL — inline-editable checkbox with completion-date
          stamp below when ticked. Editable only when canSetApproval (tighter
          than canEdit by design — system_admin / admin / mr_admin only).
          Falls back to the read-only check/dash for everyone else; stamp
          shows in both modes when present. */}
      <div className="px-1 flex flex-col items-center justify-center gap-0.5 leading-none">
        <div className="flex items-center justify-center gap-1">
          {permissions.canSetApproval && onToggleApproved ? (
            <input
              type="checkbox"
              checked={entry.approved_by_tl}
              onChange={(e) => onToggleApproved(entry.id, e.target.checked)}
              className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
              title={
                entry.approved_by_tl
                  ? "Unapprove this entry"
                  : "Approve this entry"
              }
              aria-label="Approved by TL"
            />
          ) : entry.approved_by_tl ? (
            <Check size={14} className="text-blue-500" />
          ) : (
            <span className="text-muted-foreground/30 text-xs">—</span>
          )}
          <button
            onClick={() =>
              onOpenNotes(
                entry.id,
                "approved",
                entry.client_name,
                entry.provider,
              )
            }
            className={cn(
              "text-[9px] px-1 py-0.5 rounded border transition-colors",
              entry.approved_notes.length > 0
                ? "bg-blue-100 border-blue-300 text-blue-700"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
            aria-label={`Approval notes (${entry.approved_notes.length})`}
          >
            <StickyNote size={9} className="inline" />
            {entry.approved_notes.length > 0
              ? entry.approved_notes.length
              : ""}
          </button>
        </div>
        {entry.approved_by_tl && entry.approved_by_tl_at && (
          <span className="text-[9px] leading-none text-muted-foreground tabular-nums">
            {fmtDate(entry.approved_by_tl_at)}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="px-1 flex items-center justify-center gap-0.5">
        {onOpenHistory && (
          <button
            onClick={() => onOpenHistory(entry)}
            className="text-[10px] p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="View activity log for this entry"
            aria-label="View entry history"
          >
            <History size={13} />
          </button>
        )}
        {canEditEntry && (
          <button
            onClick={() => onEdit(entry)}
            className="text-[10px] p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Edit"
            aria-label="Edit entry"
          >
            <Pencil size={13} />
          </button>
        )}
        {canDeleteEntry && (
          <button
            onClick={() => onDelete(entry.id)}
            className="text-[10px] p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 hover:text-red-700"
            title="Delete"
            aria-label="Delete entry"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Client Component ────────────────────────────────────────────────────
export function PatientPortalClient(data: PortalPageData) {
  const [isPending, startTransition] = useTransition();

  const [entries, setEntries] = useState<PortalEntry[]>([]);
  const [stats, setStats] = useState<PortalStats>(data.stats);
  const [total, setTotal] = useState(data.stats.total);
  const [totalPages, setTotalPages] = useState(1);

  const [filters, setFilters] = useState<PortalFilters>({
    search: "",
    mr_status: "",
    month: "",
    year: "",
    date_preset: "",
    date_from: "",
    date_to: "",
    specialist: "",
    sort_order: "desc",
    page: 1,
    per_page: 50,
  });

  // Available years derived from data.availableMonths (YYYY-MM values),
  // descending so the newest year sits at the top of the dropdown.
  const availableYears = Array.from(
    new Set(
      data.availableMonths
        .map((m) => m.val.slice(0, 4))
        .filter((y) => /^\d{4}$/.test(y)),
    ),
  ).sort((a, b) => b.localeCompare(a));

  const MONTH_OPTIONS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ] as const;

  // Modal state
  const [showAdd, setShowAdd] = useState(false);
  const [editEntry, setEditEntry] = useState<PortalEntry | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  // Snapshot of the page's filters at the moment the modal was opened.
  // Stable across page re-renders so the user's modal-local edits aren't
  // wiped if the page state happens to update behind the open modal.
  const [reportInitialFilters, setReportInitialFilters] =
    useState<PortalFilters | null>(null);
  const [notesState, setNotesState] = useState<{
    open: boolean;
    id: number;
    field: "username" | "password" | "approved" | "got_mr";
    clientName: string;
    provider: string | null;
  }>({ open: false, id: 0, field: "username", clientName: "", provider: null });

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Scroll containers — one each for the mobile card list and the desktop
  // grid body. The refresh handler restores whichever is currently visible.
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);

  // Row virtualization for the desktop grid — keeps 500/1000 per_page snappy
  // by only mounting rows visible in the scroll viewport (plus overscan).
  // We use a fixed row height (not measureElement) because PortalRow's two-
  // line claimant cell + grid layout produces measurement timing issues
  // where translateY positions stack before re-measurement completes.
  // ROW_H is the height that comfortably fits ClaimantNameDisplay's tallest
  // form (name on line 1, claim_type · Chronicle on line 2).
  const ROW_H = 52;
  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => desktopScrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 10,
  });

  const load = useCallback((f: PortalFilters) => {
    startTransition(async () => {
      const r = await getPortalEntries(f);
      setEntries(r.entries);
      setTotal(r.total);
      setTotalPages(r.total_pages);
    });
  }, []);

  // Manual refresh — re-pulls the current view (active filters / sort / page)
  // and restores scroll position so the user stays where they were. Bypasses
  // startTransition so we can await the fetch and restore on next frame.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    const dTop = desktopScrollRef.current?.scrollTop ?? 0;
    const mTop = mobileScrollRef.current?.scrollTop ?? 0;
    setRefreshing(true);
    try {
      const r = await getPortalEntries(filters);
      setEntries(r.entries);
      setTotal(r.total);
      setTotalPages(r.total_pages);
    } finally {
      setRefreshing(false);
      requestAnimationFrame(() => {
        if (desktopScrollRef.current)
          desktopScrollRef.current.scrollTop = dTop;
        if (mobileScrollRef.current) mobileScrollRef.current.scrollTop = mTop;
      });
    }
  }, [filters]);

  // Initial load
  useEffect(() => {
    load(filters);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilter = (patch: Partial<PortalFilters>) => {
    const next = { ...filters, ...patch, page: 1 };
    setFilters(next);
    load(next);
  };

  const goPage = (p: number) => {
    const next = { ...filters, page: p };
    setFilters(next);
    load(next);
  };

  // Stable handlers — passed to memoized PortalRow / PortalMobileCard.
  // Inline arrow fns would create a new ref every render, defeating memo().
  const handleDelete = useCallback(async (id: number) => {
    if (!confirm("Delete this portal entry?")) return;
    const r = await deletePortalEntry(id);
    if (r.success) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setTotal((t) => t - 1);
      setStats((s) => ({ ...s, total: s.total - 1 }));
    }
  }, []);

  const handleEdit = useCallback((entry: PortalEntry) => {
    setEditEntry(entry);
  }, []);

  // Per-row audit-trail modal — mirrors the dashboard's Hearing Audit Trail.
  const [historyEntry, setHistoryEntry] = useState<PortalEntry | null>(null);
  const handleOpenHistory = useCallback((entry: PortalEntry) => {
    setHistoryEntry(entry);
  }, []);

  // Inline toggle for Approved by TL — optimistic flip + stamp, revert on
  // server error. Wired into the row so admins can flip the value without
  // opening the modal. The companion `_at` column is mirrored client-side
  // so the date stamp under the checkbox appears immediately; the next
  // refetch overwrites with the server's exact NOW() (ms diff, invisible).
  const handleToggleApproved = useCallback(
    async (id: number, next: boolean) => {
      let prev = false;
      let prevAt: string | null = null;
      const stamp = next ? new Date().toISOString() : null;
      setEntries((curr) =>
        curr.map((e) => {
          if (e.id !== id) return e;
          prev = e.approved_by_tl;
          prevAt = e.approved_by_tl_at;
          return { ...e, approved_by_tl: next, approved_by_tl_at: stamp };
        }),
      );
      // Stats badge mirrors the change so the "Approved" tile updates instantly.
      setStats((s) => ({ ...s, approved: s.approved + (next ? 1 : -1) }));
      try {
        const r = await updatePortalField(id, "approved_by_tl", next);
        if (!r.success) throw new Error(r.message ?? "Update failed");
      } catch (err) {
        // Revert both row and stats on failure.
        setEntries((curr) =>
          curr.map((e) =>
            e.id === id
              ? { ...e, approved_by_tl: prev, approved_by_tl_at: prevAt }
              : e,
          ),
        );
        setStats((s) => ({ ...s, approved: s.approved + (prev ? 1 : -1) }));
        console.error("[patient-portal] approved_by_tl toggle failed", err);
      }
    },
    [],
  );

  const handleOpenNotes = useCallback(
    (
      id: number,
      field: "username" | "password" | "approved" | "got_mr",
      clientName: string,
      provider: string | null,
    ) => {
      setNotesState({
        open: true,
        id,
        field,
        clientName,
        provider,
      });
    },
    [],
  );

  const curPage = filters.page ?? 1;
  const perPage = filters.per_page as number;

  return (
    <>
      <AppHeader
        title="Patient Portal"
        subtitle="Medical Records Patient Portal Tracking"
      />

      <div className="max-w-475 mx-auto px-3 sm:px-6 py-6 space-y-5">
        {/* ── Back navigation ──────────────────────────────────────────────── */}
        <a
          href="/medical-records"
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-semibold transition-colors w-fit"
        >
          ← Back to MR Pivot
        </a>

        {/* ── Stat Cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total Entries"
            value={stats.total}
            bg="bg-blue-600"
          />
          <StatCard
            label="With Portal Link"
            value={stats.with_portal}
            bg="bg-violet-600"
          />
          <StatCard label="Got MR" value={stats.got_mr} bg="bg-emerald-600" />
          <StatCard
            label="Approved by TL"
            value={stats.approved}
            bg="bg-teal-600"
          />
        </div>

        {/* ── Main Card ───────────────────────────────────────────────────── */}
        <div
          className="bg-card border border-border rounded-xl overflow-hidden flex flex-col"
          style={{ maxHeight: "calc(100vh - 220px)" }}
        >
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 shrink-0">
            {/* Search */}
            <input
              type="text"
              placeholder="🔍 Search client or provider…"
              value={filters.search}
              className="text-xs px-3 py-1.5 rounded-lg border border-border bg-muted text-foreground focus:outline-none focus:border-primary w-full sm:min-w-50 sm:w-auto"
              onChange={(e) => {
                const v = e.target.value;
                setFilters((p) => ({ ...p, search: v }));
                if (searchRef.current) clearTimeout(searchRef.current);
                searchRef.current = setTimeout(
                  () => applyFilter({ search: v }),
                  300,
                );
              }}
            />

            {/* Sort — Newest/Oldest run against created_at; the two
             *  Specialist modes cluster rows by MR Specialist name
             *  (A→Z / Z→A) so entries for the same specialist appear
             *  together. Unassigned rows always sit at the bottom. */}
            <select
              value={filters.sort_order}
              onChange={(e) =>
                applyFilter({
                  sort_order: e.target.value as
                    | "asc"
                    | "desc"
                    | "specialist_asc"
                    | "specialist_desc",
                })
              }
              className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
            >
              <option value="desc">🆕 Newest First</option>
              <option value="asc">📜 Oldest First</option>
              <option value="specialist_asc">👥 MR Specialist (A→Z)</option>
              <option value="specialist_desc">👥 MR Specialist (Z→A)</option>
            </select>

            {/* MR Status */}
            <select
              value={filters.mr_status}
              onChange={(e) =>
                applyFilter({
                  mr_status: e.target.value as PortalFilters["mr_status"],
                })
              }
              className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
            >
              <option value="">All Status</option>
              <option value="got">✅ Got MR</option>
              <option value="pending">⏳ Pending</option>
            </select>

            {/* Month — abbreviation only (Jan–Dec), independent of year. */}
            <select
              value={filters.month || ""}
              onChange={(e) => applyFilter({ month: e.target.value })}
              className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
            >
              <option value="">All Months</option>
              {MONTH_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            {/* Year — 4-digit, derived from data.availableMonths. */}
            <select
              value={filters.year || ""}
              onChange={(e) => applyFilter({ year: e.target.value })}
              className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
            >
              <option value="">All Years</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            {/* Date — single calendar input, filters entries created on the
                picked day. Internally sets date_preset="specific" + date_from
                so the existing server-side handling applies. */}
            <input
              type="date"
              value={filters.date_from || ""}
              onChange={(e) =>
                applyFilter({
                  date_preset: e.target.value ? "specific" : "",
                  date_from: e.target.value,
                  date_to: "",
                })
              }
              aria-label="Filter by date created"
              title="Filter entries created on this date"
              className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
            />

            {/* Specialist */}
            <select
              value={filters.specialist}
              onChange={(e) => applyFilter({ specialist: e.target.value })}
              className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
            >
              <option value="">All Specialists</option>
              <option value="unassigned">— Unassigned —</option>
              {data.specialists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {/* Clear */}
            <button
              onClick={() =>
                applyFilter({
                  search: "",
                  mr_status: "",
                  month: "",
                  year: "",
                  date_preset: "",
                  date_from: "",
                  date_to: "",
                  specialist: "",
                })
              }
              className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground"
            >
              Clear
            </button>

            {/* Right-side actions */}
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {/* Refresh — refetches with current filters/sort/page and
                  restores scroll position so the user stays put. Class set
                  mirrors the medical-records refresh button exactly. */}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                title="Refresh table data without losing scroll, filters, or sort"
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border font-semibold transition-colors bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 hover:border-sky-300 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800 dark:hover:bg-sky-950/50 dark:hover:border-sky-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <RefreshCw
                  size={12}
                  className={cn(refreshing && "animate-spin")}
                />
                <span className="hidden sm:inline">
                  {refreshing ? "Refreshing…" : "Refresh"}
                </span>
              </button>
              <button
                onClick={() => setReportInitialFilters({ ...filters })}
                title="Per-MR-Specialist breakdown with its own filter bar (opens with the page's current filters)"
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border font-semibold transition-colors bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 hover:border-violet-300 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800 dark:hover:bg-violet-950/50"
              >
                <BarChart3 size={12} />
                <span className="hidden sm:inline">Report</span>
              </button>
              <button
                onClick={() => setShowActivity(true)}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors"
              >
                <ClipboardList size={12} />
                <span className="hidden sm:inline">Activity Log</span>
              </button>
              <button
                onClick={() => exportPortalCsv(entries)}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
              >
                <Download size={12} />
                <span className="hidden sm:inline">Export CSV</span>
              </button>
              {data.permissions.canCreateEntry && (
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors"
                >
                  <Plus size={12} />
                  <span className="hidden sm:inline">Add Entry</span>
                </button>
              )}
            </div>
          </div>
          {/* ── Mobile: card list (hidden on sm+) ─────────────────────────── */}
          <div
            ref={mobileScrollRef}
            className="block sm:hidden flex-1 overflow-y-auto min-h-0"
          >
            {isPending && (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            )}
            {!isPending && entries.length === 0 ? (
              <div className="text-center py-16 text-sm text-muted-foreground">
                No entries found.
              </div>
            ) : (
              entries.map((e) => (
                <PortalMobileCard
                  key={e.id}
                  entry={e}
                  permissions={data.permissions}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onOpenNotes={handleOpenNotes}
                />
              ))
            )}
          </div>
          {/* ── Desktop: fixed-width grid (hidden on mobile) ───────────────── */}
          <div className="hidden sm:contents">
            {/* Column headers */}
            <div className="overflow-x-auto shrink-0">
              <div
                className="grid px-2 py-2.5 bg-muted text-foreground text-[10px] font-extrabold uppercase tracking-wider border-b border-border items-center"
                style={{
                  gridTemplateColumns: PORTAL_GRID,
                  minWidth: PORTAL_MIN_W,
                }}
              >
                <div className="px-1 text-left">Date</div>
                <div className="px-1 text-center">Hearing Date</div>
                <div className="px-1 text-left">MR Specialist</div>
                <div className="px-1">Client Name</div>
                <div className="px-1">Provider</div>
                {/* Headers using `flex justify-center` instead of
                    `text-center` so they share the EXACT same centering
                    mechanism as the body cells below them — eliminates the
                    subtle horizontal drift between header text and body
                    content that `text-center` vs `justify-center` can
                    produce when each cell measures content slightly
                    differently. */}
                <div className="px-1 flex flex-col items-center justify-center leading-tight text-center">
                  <span>Portal</span>
                  <span>Link</span>
                </div>
                <div className="px-1">Username</div>
                <div className="px-1 pr-3">Password</div>
                <div className="px-1 flex items-center justify-center leading-tight">
                  Got MR?
                </div>
                <div className="px-1 flex items-center justify-center leading-tight">
                  Approved TL
                </div>
                <div className="px-1 flex items-center justify-center">
                  Actions
                </div>
              </div>
            </div>

            {/* Scrollable body — virtualized: only the rows visible in the
                viewport (plus a small overscan buffer) are mounted, so the
                page stays snappy even at 1000 entries per page. */}
            <div
              ref={desktopScrollRef}
              className="flex-1 overflow-y-auto overflow-x-auto min-h-0 relative"
            >
              {isPending && (
                <div className="absolute inset-0 bg-background/70 flex items-center justify-center z-10">
                  <Loader2 size={28} className="animate-spin text-primary" />
                </div>
              )}
              {!isPending && entries.length === 0 ? (
                <div
                  className="text-center py-16 text-sm text-muted-foreground"
                  style={{ minWidth: PORTAL_MIN_W }}
                >
                  No entries found.
                </div>
              ) : (
                <div
                  style={{
                    minWidth: PORTAL_MIN_W,
                    height: rowVirtualizer.getTotalSize(),
                    position: "relative",
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((vRow) => {
                    const e = entries[vRow.index];
                    if (!e) return null;
                    return (
                      <div
                        key={e.id}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          transform: `translateY(${vRow.start}px)`,
                          height: `${ROW_H}px`,
                          minWidth: PORTAL_MIN_W,
                          overflow: "hidden",
                        }}
                      >
                        <PortalRow
                          entry={e}
                          permissions={data.permissions}
                          onDelete={handleDelete}
                          onEdit={handleEdit}
                          onOpenNotes={handleOpenNotes}
                          onToggleApproved={handleToggleApproved}
                          onOpenHistory={handleOpenHistory}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>{" "}
          {/* end sm:contents */}
          {/* Pagination */}
          <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-t bg-muted/20 shrink-0 flex-wrap">
            <span className="text-[11px] text-muted-foreground">
              {total > 0
                ? `Showing ${Math.min((curPage - 1) * perPage + 1, total)}–${Math.min(curPage * perPage, total)} of ${total}`
                : "No results"}
            </span>
            <div className="flex items-center gap-2">
              <select
                value={filters.per_page}
                onChange={(e) =>
                  applyFilter({ per_page: Number(e.target.value), page: 1 })
                }
                className="text-xs px-2 py-1 rounded-lg border border-border bg-card text-foreground cursor-pointer"
              >
                {[25, 50, 100, 200, 500, 1000].map((s) => (
                  <option key={s} value={s}>
                    {s} / page
                  </option>
                ))}
              </select>
              <button
                disabled={curPage <= 1 || isPending}
                onClick={() => goPage(curPage - 1)}
                className="text-[11px] px-3 py-1.5 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted"
              >
                ← Prev
              </button>
              <span className="text-[11px] text-muted-foreground">
                Page {curPage} of {totalPages}
              </span>
              <button
                disabled={curPage >= totalPages || isPending}
                onClick={() => goPage(curPage + 1)}
                className="text-[11px] px-3 py-1.5 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {(showAdd || editEntry) && (
        <AddEditModal
          entry={editEntry}
          specialists={data.specialists}
          canAssignSpecialist={data.permissions.canAssignSpecialist}
          canSetApproval={data.permissions.canSetApproval}
          onClose={() => {
            setShowAdd(false);
            setEditEntry(null);
          }}
          onSaved={() => {
            load(filters);
            setStats((s) => ({ ...s, total: s.total + (editEntry ? 0 : 1) }));
          }}
        />
      )}

      <NotesModal
        key={`notes-${notesState.id}-${notesState.field}`}
        open={notesState.open}
        entryId={notesState.id}
        field={notesState.field}
        clientName={notesState.clientName}
        provider={notesState.provider}
        canEdit={data.permissions.canEdit}
        onClose={() => setNotesState((p) => ({ ...p, open: false }))}
      />

      {showActivity && (
        <ActivityLogModal
          title="📋 Patient Portal Activity Log"
          scopedActions={PORTAL_ACTIONS}
          onClose={() => setShowActivity(false)}
        />
      )}
      <PortalReportModal
        initialFilters={reportInitialFilters}
        specialists={data.specialists}
        availableYears={availableYears}
        onClose={() => setReportInitialFilters(null)}
        onDrillIn={(specialistId) => {
          // Set the page-level specialist filter to the drilled value and
          // close the modal. "unassigned" matches the sentinel used by the
          // page's filter select.
          applyFilter({
            specialist:
              specialistId === null ? "unassigned" : String(specialistId),
          });
          setReportInitialFilters(null);
        }}
      />
      {historyEntry && (
        <PortalEntryAuditTrailModal
          entryId={historyEntry.id}
          clientName={historyEntry.client_name}
          onClose={() => setHistoryEntry(null)}
        />
      )}
    </>
  );
}

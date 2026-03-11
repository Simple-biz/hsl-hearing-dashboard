"use client";

import {
  useState, useEffect, useTransition, useCallback, useRef, type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import {
  Download, Plus, Trash2, ExternalLink, ClipboardList, Loader2,
  X, ChevronLeft, ChevronRight, Copy, Eye, FileText, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

import {
  getPortalEntries, addPortalEntry, updatePortalEntry, updatePortalField,
  deletePortalEntry, getPortalNotes, addPortalNote,
  getPortalActivityLog, getPortalActivityUsers,
} from "./action";
import type {
  PortalPageData, PortalEntry, PortalFilters, PortalStats,
  PortalNote, PortalActivityEntry, MrSpecialist,
} from "./action";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "2-digit",
  });
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
  const headers = ["ID", "Date", "Hearing Date", "Specialist", "Client", "Provider", "MyCase", "Portal Link", "Username", "Password", "Got MR", "Approved TL"];
  const rows = entries.map((e) => [
    e.id, e.entry_date ?? "", e.hearing_date ?? "", e.specialist_name ?? "",
    e.client_name, e.provider ?? "", e.mycase_link ?? "", e.portal_link ?? "",
    e.portal_username ?? "", e.portal_password ?? "",
    e.got_mr ? "Yes" : "No", e.approved_by_tl ? "Yes" : "No",
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `patient-portal-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, bg }: { label: string; value: number; bg: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl px-4 py-3 text-white flex flex-col gap-1", bg)}>
      <div className="pointer-events-none absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -right-2 bottom-3 w-14 h-14 rounded-full bg-white/10" />
      <p className="relative text-[10px] font-semibold uppercase tracking-widest opacity-80">{label}</p>
      <p className="relative text-2xl font-bold tabular-nums leading-none">{value}</p>
    </div>
  );
}

// ─── Notes Modal ─────────────────────────────────────────────────────────────

function NotesModal({
  open, entryId, field, clientName, provider, canEdit, onClose, onNoteAdded,
}: {
  open: boolean;
  entryId: number;
  field: "username" | "password" | "approved";
  clientName: string;
  provider: string | null;
  canEdit: boolean;
  onClose: () => void;
  onNoteAdded?: () => void;
}) {
  const [notes, setNotes]       = useState<PortalNote[]>([]);
  const [notesLoading, startNotesTransition] = useTransition();
  const [newNote, setNewNote]   = useState("");
  const [saving, setSaving]     = useState(false);

  const FIELD_LABELS = { username: "Username Notes", password: "Password Notes", approved: "Approval Notes" };

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
      setNotes([{ user: "You", date: new Date().toISOString(), note: newNote.trim() }, ...notes]);
      setNewNote("");
      onNoteAdded?.();
    }
    setSaving(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md flex flex-col rounded-xl border bg-card shadow-2xl max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-3 shrink-0">
          <h3 className="text-sm font-semibold">📝 {FIELD_LABELS[field]}</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <div className="px-4 py-2 bg-muted/30 border-b shrink-0">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{clientName}</span>
            {provider && <> · {provider}</>}
          </p>
        </div>
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
                <button onClick={handleAddNote} disabled={saving || !newNote.trim()}
                  className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 flex items-center gap-1.5">
                  {saving && <Loader2 size={10} className="animate-spin" />}💬 Add Note
                </button>
              </div>
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground mb-2">
              Notes History <span className="font-normal">({notes.length})</span>
            </p>
            {notesLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
            ) : notes.length === 0 ? (
              <p className="text-xs text-center text-muted-foreground py-6 italic">No notes yet.</p>
            ) : (
              <div className="border border-border rounded-lg divide-y divide-border">
                {notes.map((n, i) => (
                  <div key={i} className="px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-primary">{n.user}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(n.date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs text-foreground whitespace-pre-wrap wrap-break-word">{n.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="border-t px-4 py-2.5 shrink-0 flex justify-end">
          <button onClick={onClose} className="text-xs px-4 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Link Edit Modal ──────────────────────────────────────────────────────────

function LinkModal({
  open, id, field, title, currentUrl, onClose, onSaved,
}: {
  open: boolean;
  id: number;
  field: "mycase_link" | "portal_link";
  title: string;
  currentUrl: string;
  onClose: () => void;
  onSaved: (id: number, field: string, url: string) => void;
}) {
  const [url, setUrl] = useState(currentUrl);
  const [saving, setSaving] = useState(false);

  // Note: parent passes key={id+field} so this component remounts on each new link,
  // resetting url from currentUrl automatically — no useEffect needed.

  const handleSave = async () => {
    setSaving(true);
    const r = await updatePortalField(id, field, url);
    setSaving(false);
    if (r.success) { onSaved(id, field, url); onClose(); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-3">
          <h3 className="text-sm font-semibold">🔗 {title}</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <div className="px-4 py-4 space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">URL</label>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…"
              className="w-full text-xs rounded-lg border border-border bg-muted px-3 py-2 text-foreground focus:outline-none focus:border-primary" />
            <p className="text-[10px] text-muted-foreground mt-1">Enter the full URL</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-4 py-2.5">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 flex items-center gap-1">
            {saving && <Loader2 size={10} className="animate-spin" />}Save Link
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add / Edit Entry Modal ───────────────────────────────────────────────────

type EntryForm = {
  entry_date: string; hearing_date: string; client_name: string; provider: string;
  mycase_link: string; portal_link: string; portal_username: string;
  portal_password: string; got_mr: boolean; approved_by_tl: boolean;
};

function AddEditModal({
  entry, onClose, onSaved,
}: {
  entry: PortalEntry | null; // null = add mode
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!entry;
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const [form, setForm]     = useState<EntryForm>({
    entry_date:      entry?.entry_date    ?? new Date().toISOString().slice(0, 10),
    hearing_date:    entry?.hearing_date  ?? "",
    client_name:     entry?.client_name   ?? "",
    provider:        entry?.provider      ?? "",
    mycase_link:     entry?.mycase_link   ?? "",
    portal_link:     entry?.portal_link   ?? "",
    portal_username: entry?.portal_username ?? "",
    portal_password: entry?.portal_password ?? "",
    got_mr:          entry?.got_mr        ?? false,
    approved_by_tl:  entry?.approved_by_tl ?? false,
  });

  const set = (k: keyof EntryForm, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.client_name.trim()) { setError("Client name is required."); return; }
    setSaving(true);
    const input = { ...form, entry_date: form.entry_date || null, hearing_date: form.hearing_date || null };
    const r = isEdit
      ? await updatePortalEntry(entry!.id, input)
      : await addPortalEntry(input);
    setSaving(false);
    if (r.success) { onSaved(); onClose(); }
    else setError(r.message ?? "Save failed");
  }

  const inp = "w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary";
  const lbl = "text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block";
  const gotMrColor = form.got_mr ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-red-50 text-red-700 border-red-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-xl border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <h2 className="text-sm font-semibold">{isEdit ? "✏️ Edit Portal Entry" : "➕ Add New Portal Entry"}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded px-3 py-2">{error}</p>}

          {/* Basic Info */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 border-b pb-1">📋 Basic Information</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className={lbl}>Date</label><input type="date" className={inp} value={form.entry_date} onChange={(e) => set("entry_date", e.target.value)} /></div>
              <div><label className={lbl}>Hearing Date</label><input type="date" className={inp} value={form.hearing_date} onChange={(e) => set("hearing_date", e.target.value)} /></div>
            </div>
            <div><label className={lbl}>Client Name <span className="text-red-500">*</span></label><input type="text" className={inp} value={form.client_name} onChange={(e) => set("client_name", e.target.value)} placeholder="Last, First" /></div>
          </div>

          {/* Provider */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 border-b pb-1">🏥 Provider Information</p>
            <div className="mb-3"><label className={lbl}>Provider Name</label><input type="text" className={inp} value={form.provider} onChange={(e) => set("provider", e.target.value)} placeholder="e.g., Quest Diagnostics" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>MyCase Link</label><input type="url" className={inp} value={form.mycase_link} onChange={(e) => set("mycase_link", e.target.value)} placeholder="https://…" /></div>
              <div><label className={lbl}>Patient Portal Link</label><input type="url" className={inp} value={form.portal_link} onChange={(e) => set("portal_link", e.target.value)} placeholder="https://…" /></div>
            </div>
          </div>

          {/* Credentials */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 border-b pb-1">🔐 Login Credentials</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Username</label><input type="text" className={inp} value={form.portal_username} onChange={(e) => set("portal_username", e.target.value)} placeholder="Portal username or email" /></div>
              <div><label className={lbl}>Password</label><input type="text" className={inp} value={form.portal_password} onChange={(e) => set("portal_password", e.target.value)} placeholder="Portal password" /></div>
            </div>
          </div>

          {/* Status */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 border-b pb-1">✅ Status</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Got the MR?</label>
                <select className={cn(inp, "cursor-pointer font-medium", gotMrColor)} value={form.got_mr ? "1" : "0"} onChange={(e) => set("got_mr", e.target.value === "1")}>
                  <option value="0">No</option>
                  <option value="1">Yes</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Approved by TL</label>
                <select className={inp} value={form.approved_by_tl ? "1" : "0"} onChange={(e) => set("approved_by_tl", e.target.value === "1")}>
                  <option value="0">No</option>
                  <option value="1">Yes</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3 bg-muted/30 shrink-0">
          <button onClick={onClose} className="text-xs px-4 py-2 rounded-lg border border-border bg-card hover:bg-muted text-foreground">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60 flex items-center gap-1.5">
            {saving && <Loader2 size={12} className="animate-spin" />}💾 {isEdit ? "Update Entry" : "Save Entry"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Activity Log Modal ───────────────────────────────────────────────────────

function ActivityLogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [entries, setEntries]     = useState<PortalActivityEntry[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [actLoading, startActTransition] = useTransition();
  const [dateRange, setDateRange] = useState<"all" | "today" | "week" | "month">("all");
  const [userId, setUserId]       = useState("");
  const [users, setUsers]         = useState<Array<{ id: number; full_name: string }>>([]);
  const totalPages = Math.max(1, Math.ceil(total / 50));

  const load = useCallback((p: number, dr: string, uid: string) => {
    startActTransition(async () => {
      const r = await getPortalActivityLog({ page: p, date_range: dr as "all", user_id: uid || undefined });
      setEntries(r.entries);
      setTotal(r.total);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    getPortalActivityUsers().then((u) => setUsers(u));
    load(1, dateRange, userId);
  }, [open, load]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <h2 className="text-sm font-semibold">📋 Patient Portal Activity Log</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2 shrink-0">
          <select value={dateRange} onChange={(e) => { const v = e.target.value as typeof dateRange; setDateRange(v); load(1, v, userId); }}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer">
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          <select value={userId} onChange={(e) => { setUserId(e.target.value); load(1, dateRange, e.target.value); }}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer">
            <option value="">All Users</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <span className="ml-auto text-xs text-muted-foreground">{total} entries</span>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {actLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : entries.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">No activity found.</p>
          ) : (
            <div className="space-y-0.5">
              {entries.map((e) => (
                <div key={e.id} className="flex items-start gap-3 rounded px-2 py-2 hover:bg-muted/30">
                  <span className="shrink-0 text-[9px] font-bold uppercase bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 mt-0.5">
                    {e.action.replace(/^portal_/, "").replace(/_/g, " ")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">{e.details}</p>
                    <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5">
                      <span>{new Date(e.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                      {e.user_name && <span>by <span className="font-medium text-foreground">{e.user_name}</span></span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t px-5 py-2.5 shrink-0">
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
          <div className="flex gap-1">
            <button disabled={page <= 1 || actLoading} onClick={() => { const p = page - 1; setPage(p); load(p, dateRange, userId); }}
              className="h-7 w-7 flex items-center justify-center rounded border disabled:opacity-40 hover:bg-muted">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button disabled={page >= totalPages || actLoading} onClick={() => { const p = page + 1; setPage(p); load(p, dateRange, userId); }}
              className="h-7 w-7 flex items-center justify-center rounded border disabled:opacity-40 hover:bg-muted">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Row (module-level — must NOT be defined inside a component) ─────────

const DETAIL_LABEL_CLS = "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider";
const DETAIL_VALUE_CLS = "text-xs font-medium text-foreground";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-1.5 border-b border-border/40 last:border-0">
      <span className={cn(DETAIL_LABEL_CLS, "w-32 shrink-0 pt-0.5")}>{label}</span>
      <span className={DETAIL_VALUE_CLS}>{children}</span>
    </div>
  );
}

// ─── View Details Modal ───────────────────────────────────────────────────────

function ViewDetailsModal({
  entry, onClose, onEdit,
}: {
  entry: PortalEntry | null;
  onClose: () => void;
  onEdit: (e: PortalEntry) => void;
}) {
  const [tab, setTab] = useState<"info" | "activity">("info");
  const [activities, setActivities] = useState<PortalActivityEntry[]>([]);
  const [loadingAct, startActTab] = useTransition();

  useEffect(() => {
    if (!entry || tab !== "activity") return;
    startActTab(async () => {
      const r = await getPortalActivityLog({ page: 1 });
      setActivities(r.entries);
    });
  }, [entry, tab]);

  if (!entry) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <h2 className="text-sm font-semibold">📋 {entry.client_name}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div className="flex gap-1 px-5 pt-3 border-b shrink-0">
          {(["info","activity"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("text-xs px-3 py-1.5 rounded-t-lg border-b-2 font-medium transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t === "info" ? "📄 Information" : "📝 Activity Log"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "info" && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">📅 Dates</p>
                <DetailRow label="Entry Date">{fmtDate(entry.entry_date)}</DetailRow>
                <DetailRow label="Hearing Date">{fmtDate(entry.hearing_date)}</DetailRow>
                <DetailRow label="Specialist">
                  {entry.specialist_name
                    ? <span className="px-2 py-0.5 rounded text-[10px] font-medium" style={specStyle(entry.specialist_color)}>{entry.specialist_name}</span>
                    : "—"}
                </DetailRow>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">🏥 Provider</p>
                <DetailRow label="Provider">{entry.provider ?? "—"}</DetailRow>
                <DetailRow label="MyCase Link">
                  {entry.mycase_link ? <a href={entry.mycase_link} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1"><ExternalLink size={10} />Open Link</a> : "—"}
                </DetailRow>
                <DetailRow label="Portal Link">
                  {entry.portal_link ? <a href={entry.portal_link} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1"><ExternalLink size={10} />Open Link</a> : "—"}
                </DetailRow>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">🔐 Credentials</p>
                <DetailRow label="Username">
                  <span className="flex items-center gap-1.5">
                    {entry.portal_username ?? "—"}
                    {entry.portal_username && (
                      <button onClick={() => navigator.clipboard.writeText(entry.portal_username!)} className="text-muted-foreground hover:text-primary">
                        <Copy size={10} />
                      </button>
                    )}
                  </span>
                </DetailRow>
                <DetailRow label="Password">
                  <span className="flex items-center gap-1.5">
                    {entry.portal_password ?? "—"}
                    {entry.portal_password && (
                      <button onClick={() => navigator.clipboard.writeText(entry.portal_password!)} className="text-muted-foreground hover:text-primary">
                        <Copy size={10} />
                      </button>
                    )}
                  </span>
                </DetailRow>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">✅ Status</p>
                <DetailRow label="Got MR?">
                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium", entry.got_mr ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                    {entry.got_mr ? "✅ Yes" : "⏳ No"}
                  </span>
                </DetailRow>
                <DetailRow label="Approved by TL">
                  {entry.approved_by_tl ? <span className="text-blue-500 font-bold">✓ Yes</span> : <span className="text-muted-foreground">No</span>}
                </DetailRow>
              </div>
            </div>
          )}
          {tab === "activity" && (
            loadingAct ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : activities.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">No activity recorded for this entry.</p>
            ) : (
              <div className="space-y-0.5">
                {activities.map((a) => (
                  <div key={a.id} className="flex gap-3 px-2 py-2 hover:bg-muted/30 rounded">
                    <span className="text-[9px] font-bold uppercase bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 h-fit mt-0.5 shrink-0">
                      {a.action.replace(/^portal_/, "").replace(/_/g, " ")}
                    </span>
                    <div>
                      <p className="text-xs">{a.details}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(a.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3 shrink-0">
          <button onClick={onClose} className="text-xs px-4 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground">Close</button>
          <button onClick={() => { onEdit(entry); onClose(); }}
            className="text-xs px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">✏️ Edit Entry</button>
        </div>
      </div>
    </div>
  );
}

// ─── Portal Table Row ─────────────────────────────────────────────────────────

function PortalRow({
  entry, specialists, permissions,
  onUpdate, onDelete, onViewDetails, onOpenNotes, onOpenLink,
}: {
  entry: PortalEntry;
  specialists: MrSpecialist[];
  permissions: PortalPageData["permissions"];
  onUpdate: (id: number, field: string, value: unknown) => void;
  onDelete: (id: number) => void;
  onViewDetails: (e: PortalEntry) => void;
  onOpenNotes: (id: number, field: "username" | "password" | "approved", clientName: string, provider: string | null) => void;
  onOpenLink: (id: number, field: "mycase_link" | "portal_link", title: string, url: string) => void;
}) {
  const { canEdit, canManage, canAssignSpecialist } = permissions;
  const spec = specialists.find((s) => s.id === entry.mr_specialist_id);
  const specColor = entry.specialist_color ?? spec?.bg_color;

  const inp = "text-[10px] border border-border rounded px-1.5 py-0.5 bg-card text-foreground focus:outline-none focus:border-primary";

  return (
    <tr className="border-b border-border/40 hover:bg-muted/30 transition-colors group text-[11px]">
      {/* Date */}
      <td className="px-2 py-1.5 whitespace-nowrap">
        {canEdit
          ? <input type="date" value={entry.entry_date ?? ""} className={cn(inp, "w-28")}
              onChange={(e) => onUpdate(entry.id, "entry_date", e.target.value)} />
          : <span>{fmtDate(entry.entry_date)}</span>}
      </td>

      {/* Hearing Date */}
      <td className="px-2 py-1.5 whitespace-nowrap">
        {canEdit
          ? <input type="date" value={entry.hearing_date ?? ""} className={cn(inp, "w-28")}
              onChange={(e) => onUpdate(entry.id, "hearing_date", e.target.value)} />
          : <span>{fmtDate(entry.hearing_date)}</span>}
      </td>

      {/* Specialist */}
      <td className="px-2 py-1.5 whitespace-nowrap">
        {canAssignSpecialist
          ? <select value={entry.mr_specialist_id ?? ""}
              className="text-[10px] px-1.5 py-1 rounded border-0 cursor-pointer min-w-30"
              style={specColor ? specStyle(specColor) : { backgroundColor: "#f3f4f6", color: "#374151" }}
              onChange={(e) => onUpdate(entry.id, "mr_specialist_id", e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Select —</option>
              {specialists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          : entry.specialist_name
            ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={specStyle(specColor ?? null)}>{entry.specialist_name}</span>
            : <span className="text-muted-foreground/40">—</span>
        }
      </td>

      {/* Client Name */}
      <td className="px-2 py-1.5">
        {canEdit
          ? <input type="text" value={entry.client_name} className={cn(inp, "w-36")}
              onChange={(e) => onUpdate(entry.id, "client_name", e.target.value)} />
          : <strong className="text-foreground">{entry.client_name}</strong>}
      </td>

      {/* Provider */}
      <td className="px-2 py-1.5">
        {canEdit
          ? <input type="text" value={entry.provider ?? ""} className={cn(inp, "w-28")} placeholder="Add provider…"
              onChange={(e) => onUpdate(entry.id, "provider", e.target.value)} />
          : <span>{entry.provider ?? "—"}</span>}
      </td>

      {/* MyCase Link */}
      <td className="px-2 py-1.5 text-center whitespace-nowrap">
        {entry.mycase_link
          ? <>
              <a href={entry.mycase_link} target="_blank" rel="noreferrer"
                className="inline-flex items-center text-[9px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded hover:bg-primary/80">
                <ExternalLink size={8} className="mr-0.5" />📄
              </a>
              {canEdit && (
                <button onClick={() => onOpenLink(entry.id, "mycase_link", "📄 MyCase Link", entry.mycase_link!)}
                  className="ml-1 text-[9px] border border-border px-1 py-0.5 rounded hover:bg-muted">✏️</button>
              )}
            </>
          : canEdit
            ? <button onClick={() => onOpenLink(entry.id, "mycase_link", "📄 MyCase Link", "")}
                className="text-[10px] text-muted-foreground hover:text-foreground border border-dashed border-border rounded px-1.5 py-0.5">+ Link</button>
            : <span className="text-muted-foreground/30">—</span>
        }
      </td>

      {/* Portal Link */}
      <td className="px-2 py-1.5 text-center whitespace-nowrap">
        {entry.portal_link
          ? <>
              <a href={entry.portal_link} target="_blank" rel="noreferrer"
                className="inline-flex items-center text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded hover:bg-emerald-700">
                <ExternalLink size={8} className="mr-0.5" />🔗
              </a>
              {canEdit && (
                <button onClick={() => onOpenLink(entry.id, "portal_link", "🔗 Portal Link", entry.portal_link!)}
                  className="ml-1 text-[9px] border border-border px-1 py-0.5 rounded hover:bg-muted">✏️</button>
              )}
            </>
          : canEdit
            ? <button onClick={() => onOpenLink(entry.id, "portal_link", "🔗 Portal Link", "")}
                className="text-[10px] text-muted-foreground hover:text-foreground border border-dashed border-border rounded px-1.5 py-0.5">+ Link</button>
            : <span className="text-muted-foreground/30">—</span>
        }
      </td>

      {/* Username */}
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          {canEdit
            ? <input type="text" value={entry.portal_username ?? ""} className={cn(inp, "flex-1 min-w-0 w-28")} placeholder="Username"
                onChange={(e) => onUpdate(entry.id, "portal_username", e.target.value)} />
            : <span className="flex-1 text-[10px]">{entry.portal_username ?? "—"}</span>}
          <button onClick={() => onOpenNotes(entry.id, "username", entry.client_name, entry.provider)}
            className={cn("shrink-0 text-[9px] px-1 py-0.5 rounded border transition-colors",
              entry.username_notes.length > 0 ? "bg-blue-100 border-blue-300 text-blue-700" : "border-border text-muted-foreground hover:bg-muted")}>
            📝{entry.username_notes.length > 0 ? entry.username_notes.length : ""}
          </button>
        </div>
      </td>

      {/* Password */}
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          {canEdit
            ? <input type="text" value={entry.portal_password ?? ""} className={cn(inp, "flex-1 min-w-0 w-24")} placeholder="Password"
                onChange={(e) => onUpdate(entry.id, "portal_password", e.target.value)} />
            : <span className="flex-1 text-[10px]">{entry.portal_password ? "••••••" : "—"}</span>}
          {entry.portal_password && (
            <button onClick={() => navigator.clipboard.writeText(entry.portal_password!)}
              className="shrink-0 text-muted-foreground hover:text-primary p-0.5 rounded">
              <Copy size={10} />
            </button>
          )}
          <button onClick={() => onOpenNotes(entry.id, "password", entry.client_name, entry.provider)}
            className={cn("shrink-0 text-[9px] px-1 py-0.5 rounded border transition-colors",
              entry.password_notes.length > 0 ? "bg-blue-100 border-blue-300 text-blue-700" : "border-border text-muted-foreground hover:bg-muted")}>
            📝{entry.password_notes.length > 0 ? entry.password_notes.length : ""}
          </button>
        </div>
      </td>

      {/* Got MR? */}
      <td className="px-2 py-1.5 whitespace-nowrap">
        {canEdit
          ? <select value={entry.got_mr ? "1" : "0"}
              className={cn("text-[10px] px-1.5 py-1 rounded border-0 cursor-pointer font-medium min-w-15",
                entry.got_mr ? "bg-emerald-100 text-emerald-700" : "bg-red-50 text-red-600")}
              onChange={(e) => onUpdate(entry.id, "got_mr", e.target.value === "1")}>
              <option value="0">No</option>
              <option value="1">Yes</option>
            </select>
          : <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium",
              entry.got_mr ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-600")}>
              {entry.got_mr ? "✅ Yes" : "⏳ No"}
            </span>
        }
      </td>

      {/* Approved by TL */}
      <td className="px-2 py-1.5 text-center">
        <div className="flex items-center justify-center gap-1">
          {canEdit
            ? <input type="checkbox" checked={entry.approved_by_tl} className="w-4 h-4 cursor-pointer accent-blue-500"
                onChange={(e) => onUpdate(entry.id, "approved_by_tl", e.target.checked)} />
            : entry.approved_by_tl
              ? <Check size={14} className="text-blue-500" />
              : <span className="text-muted-foreground/30 text-xs">—</span>
          }
          <button onClick={() => onOpenNotes(entry.id, "approved", entry.client_name, entry.provider)}
            className={cn("text-[9px] px-1 py-0.5 rounded border transition-colors",
              entry.approved_notes.length > 0 ? "bg-blue-100 border-blue-300 text-blue-700" : "border-border text-muted-foreground hover:bg-muted")}>
            📝{entry.approved_notes.length > 0 ? entry.approved_notes.length : ""}
          </button>
        </div>
      </td>

      {/* Actions */}
      <td className="px-2 py-1.5 text-center whitespace-nowrap">
        <button onClick={() => onViewDetails(entry)}
          className="text-[10px] p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="View Details">
          <Eye size={13} />
        </button>
        {canManage && (
          <button onClick={() => onDelete(entry.id)}
            className="text-[10px] p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 hover:text-red-700" title="Delete">
            <Trash2 size={13} />
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Main Client Component ────────────────────────────────────────────────────

export function PatientPortalClient(data: PortalPageData) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [entries, setEntries]       = useState<PortalEntry[]>([]);
  const [stats, setStats]           = useState<PortalStats>(data.stats);
  const [total, setTotal]           = useState(data.stats.total);
  const [totalPages, setTotalPages] = useState(1);

  const [filters, setFilters] = useState<PortalFilters>({
    search: "", mr_status: "", month: "", specialist: "", sort_order: "desc", page: 1, per_page: 50,
  });

  // Modals
  const [showAdd,        setShowAdd]        = useState(false);
  const [editEntry,      setEditEntry]      = useState<PortalEntry | null>(null);
  const [viewEntry,      setViewEntry]      = useState<PortalEntry | null>(null);
  const [showActivity,   setShowActivity]   = useState(false);
  const [notesState,     setNotesState]     = useState<{
    open: boolean; id: number; field: "username"|"password"|"approved"; clientName: string; provider: string | null;
  }>({ open: false, id: 0, field: "username", clientName: "", provider: null });
  const [linkState, setLinkState] = useState<{
    open: boolean; id: number; field: "mycase_link"|"portal_link"; title: string; currentUrl: string;
  }>({ open: false, id: 0, field: "mycase_link", title: "", currentUrl: "" });

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((f: PortalFilters) => {
    startTransition(async () => {
      const r = await getPortalEntries(f);
      setEntries(r.entries);
      setTotal(r.total);
      setTotalPages(r.total_pages);
    });
  }, []);

  useEffect(() => { load(filters); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleUpdate = (id: number, field: string, value: unknown) => {
    updatePortalField(id, field, value as string | number | boolean | null);
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this portal entry?")) return;
    const r = await deletePortalEntry(id);
    if (r.success) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setTotal((t) => t - 1);
      setStats((s) => ({ ...s, total: s.total - 1 }));
    }
  };

  const handleLinkSaved = (id: number, field: string, url: string) => {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: url || null } : e));
  };

  const curPage = filters.page ?? 1;
  const perPage = filters.per_page as number;
  const COLS = ["Date","Hearing Date","MR Specialist","Client Name","Provider","MyCase","Portal Link","Username","Password","Got MR?","Approved TL","Actions"];

  return (
    <>
      <AppHeader title="Patient Portal" subtitle="Medical Records Patient Portal Tracking" />

      <div className="max-w-475 mx-auto px-6 py-6 space-y-5">

        {/* ── Stat Cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Entries"    value={stats.total}       bg="bg-blue-600" />
          <StatCard label="With Portal Link" value={stats.with_portal} bg="bg-violet-600" />
          <StatCard label="Got MR"           value={stats.got_mr}      bg="bg-emerald-600" />
          <StatCard label="Approved by TL"   value={stats.approved}    bg="bg-teal-600" />
        </div>

        {/* ── Main Card ──────────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col" style={{ maxHeight: "calc(100vh - 220px)" }}>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 shrink-0">
            <input type="text" placeholder="🔍 Search client or provider…" value={filters.search}
              className="text-xs px-3 py-1.5 rounded-lg border border-border bg-muted text-foreground focus:outline-none focus:border-primary min-w-50"
              onChange={(e) => {
                const v = e.target.value;
                setFilters((p) => ({ ...p, search: v }));
                if (searchRef.current) clearTimeout(searchRef.current);
                searchRef.current = setTimeout(() => applyFilter({ search: v }), 300);
              }} />
            <select value={filters.sort_order} onChange={(e) => applyFilter({ sort_order: e.target.value as "asc" | "desc" })}
              className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer">
              <option value="desc">🆕 Newest First</option>
              <option value="asc">📜 Oldest First</option>
            </select>
            <select value={filters.mr_status} onChange={(e) => applyFilter({ mr_status: e.target.value as PortalFilters["mr_status"] })}
              className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer">
              <option value="">All Status</option>
              <option value="got">✅ Got MR</option>
              <option value="pending">⏳ Pending</option>
            </select>
            <select value={filters.month} onChange={(e) => applyFilter({ month: e.target.value })}
              className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer">
              <option value="">All Months</option>
              {data.availableMonths.map((m) => <option key={m.val} value={m.val}>{m.label}</option>)}
            </select>
            <select value={filters.specialist} onChange={(e) => applyFilter({ specialist: e.target.value })}
              className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer">
              <option value="">All Specialists</option>
              <option value="unassigned">— Unassigned —</option>
              {data.specialists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button onClick={() => applyFilter({ search: "", mr_status: "", month: "", specialist: "" })}
              className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground">Clear</button>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setShowActivity(true)}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors">
                <ClipboardList size={12} />Activity Log
              </button>
              <button onClick={() => exportPortalCsv(entries)}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors">
                <Download size={12} />Export CSV
              </button>
              {data.permissions.canEdit && (
                <button onClick={() => setShowAdd(true)}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white transition-colors">
                  <Plus size={12} />Add Entry
                </button>
              )}
              <button onClick={() => router.push("/medical-records")}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground transition-colors">
                ← MR Pivot
              </button>
            </div>
          </div>

          {/* Column headers */}
          <div className="overflow-x-auto shrink-0">
            <div className="bg-[#4a5568] text-white text-[9px] font-semibold uppercase tracking-wide" style={{ minWidth: "1400px" }}>
              <div className="flex gap-0 px-2 py-2.5">
                {COLS.map((c) => (
                  <div key={c} className={cn("shrink-0 px-1",
                    c === "Date"             ? "w-25" :
                    c === "Hearing Date"     ? "w-25" :
                    c === "MR Specialist"    ? "w-32.5" :
                    c === "Client Name"      ? "w-38.75" :
                    c === "Provider"         ? "w-30" :
                    c === "MyCase"           ? "w-18.75"  :
                    c === "Portal Link"      ? "w-18.75"  :
                    c === "Username"         ? "w-38.75" :
                    c === "Password"         ? "w-35" :
                    c === "Got MR?"          ? "w-17.5"  :
                    c === "Approved TL"      ? "w-22.5"  :
                    "w-17.5")}>{c}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto overflow-x-auto min-h-0 relative">
            {isPending && (
              <div className="absolute inset-0 bg-background/70 flex items-center justify-center z-10">
                <Loader2 size={28} className="animate-spin text-primary" />
              </div>
            )}
            <table className="w-full" style={{ minWidth: "1400px" }}>
              <tbody>
                {!isPending && entries.length === 0
                  ? <tr><td colSpan={12} className="text-center py-16 text-sm text-muted-foreground">No entries found.</td></tr>
                  : entries.map((e) => (
                      <PortalRow key={e.id} entry={e} specialists={data.specialists} permissions={data.permissions}
                        onUpdate={handleUpdate} onDelete={handleDelete}
                        onViewDetails={(e) => setViewEntry(e)}
                        onOpenNotes={(id, field, cn, prov) => setNotesState({ open: true, id, field, clientName: cn, provider: prov })}
                        onOpenLink={(id, field, title, url) => setLinkState({ open: true, id, field, title, currentUrl: url })}
                      />
                    ))
                }
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-t bg-muted/20 shrink-0 flex-wrap">
            <span className="text-[11px] text-muted-foreground">
              {total > 0
                ? `Showing ${Math.min((curPage - 1) * perPage + 1, total)}–${Math.min(curPage * perPage, total)} of ${total}`
                : "No results"}
            </span>
            <div className="flex items-center gap-2">
              <select value={filters.per_page} onChange={(e) => applyFilter({ per_page: Number(e.target.value), page: 1 })}
                className="text-xs px-2 py-1 rounded-lg border border-border bg-card text-foreground cursor-pointer">
                <option value={25}>25/page</option>
                <option value={50}>50/page</option>
                <option value={100}>100/page</option>
              </select>
              <button disabled={curPage <= 1 || isPending} onClick={() => goPage(curPage - 1)}
                className="text-[11px] px-3 py-1.5 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted">← Prev</button>
              <span className="text-[11px] text-muted-foreground">Page {curPage} of {totalPages}</span>
              <button disabled={curPage >= totalPages || isPending} onClick={() => goPage(curPage + 1)}
                className="text-[11px] px-3 py-1.5 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted">Next →</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {(showAdd || editEntry) && (
        <AddEditModal
          entry={editEntry}
          onClose={() => { setShowAdd(false); setEditEntry(null); }}
          onSaved={() => { load(filters); setStats((s) => ({ ...s, total: s.total + (editEntry ? 0 : 1) })); }}
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

      <LinkModal
        key={`link-${linkState.id}-${linkState.field}`}
        open={linkState.open}
        id={linkState.id}
        field={linkState.field}
        title={linkState.title}
        currentUrl={linkState.currentUrl}
        onClose={() => setLinkState((p) => ({ ...p, open: false }))}
        onSaved={handleLinkSaved}
      />

      <ViewDetailsModal
        entry={viewEntry}
        onClose={() => setViewEntry(null)}
        onEdit={(e) => { setEditEntry(e); setViewEntry(null); }}
      />

      <ActivityLogModal open={showActivity} onClose={() => setShowActivity(false)} />
    </>
  );
}

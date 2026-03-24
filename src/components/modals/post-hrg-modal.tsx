"use client";

import { useState, useEffect, useTransition, Fragment } from "react";
import { ChevronLeft, ChevronRight, Loader2, ClipboardList, ChevronDown, ChevronUp } from "lucide-react";
import { ModalShell } from "@/components/modals/modal-shell";
import {
  getPostHrgHearings,
  getPostHrgNotes,
  updatePostHrgDeadline,
  addPostHrgNote,
  toggleFiveDayNotice,
} from "@/app/(dashboard)/medical-records/action";
import type {
  Hearing,
  PostHrgNote,
  MrTeam,
  HearingFilters,
} from "@/app/(dashboard)/medical-records/action";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  teams: MrTeam[];
  mrStatusOptions: string[];
  hearingId?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEAM_HEX: Record<string, string> = {
  blue: "#3b82f6", orange: "#f97316", green: "#22c55e",
  yellow: "#eab308", purple: "#a855f7", red: "#ef4444",
};
function teamBg(color: string | null | undefined) {
  if (!color) return { backgroundColor: "#9ca3af", color: "#fff" };
  return { backgroundColor: TEAM_HEX[color] ?? color, color: "#fff" };
}

const MR_STATUS_CLS: Record<string, string> = {
  "Complete":                  "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "In Progress":               "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  "Ready":                     "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "Not Started":               "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  "URGENT! NEEDS ATTENTION":   "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Parses "13:00:00", "13:00", "1:00 PM" etc → "01:00 PM"
function fmtTime(t: string | null): string {
  if (!t) return "—";
  // Already has AM/PM
  if (/[AaPp][Mm]/.test(t)) {
    const clean = t.trim().toUpperCase().replace(/\s+/, "");
    const [timePart, ampm] = [clean.slice(0, -2), clean.slice(-2)];
    const [h, m] = timePart.split(":").map(Number);
    return `${String(h).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}${ampm}`;
  }
  // 24hr format: "13:00:00" or "13:00"
  const parts = t.split(":");
  const h24 = Number(parts[0]);
  const min = parts[1] ?? "00";
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12  = h24 % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${min}${ampm}`;
}

// ─── NotesList ────────────────────────────────────────────────────────────────

function NotesList({ hearingId }: { hearingId: number }) {
  const [notes, setNotes]   = useState<PostHrgNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving]  = useState(false);
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const n = await getPostHrgNotes(hearingId);
      setNotes(n);
    });
  }, [hearingId]);

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setSaving(true);
    const r = await addPostHrgNote(hearingId, newNote.trim());
    if (r.success) {
      startTransition(async () => {
        const updated = await getPostHrgNotes(hearingId);
        setNotes(updated);
      });
      setNewNote("");
    }
    setSaving(false);
  }

  if (loading) return <div className="py-4 text-center text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin inline mr-1" />Loading notes…</div>;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <textarea
          rows={2}
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a post HRG note…"
          className="flex-1 text-xs rounded border border-border bg-muted px-2 py-1.5 resize-none text-foreground focus:outline-none focus:border-primary"
        />
        <button
          onClick={handleAddNote}
          disabled={saving || !newNote.trim()}
          className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50 flex items-center gap-1 self-end"
        >
          {saving && <Loader2 size={10} className="animate-spin" />}
          Add
        </button>
      </div>
      {notes.length > 0 && (
        <div className="border border-border rounded overflow-hidden max-h-40 overflow-y-auto">
          {notes.map((n, i) => (
            <div key={i} className="px-3 py-2 border-b border-border last:border-0 bg-card">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-semibold text-primary">{n.author_name}</span>
                <span className="text-[9px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              <p className="text-xs text-foreground whitespace-pre-wrap">{n.content}</p>
            </div>
          ))}
        </div>
      )}
      {notes.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-2">No notes yet.</p>}
    </div>
  );
}

// ─── Expanded Row Panel ───────────────────────────────────────────────────────

function ExpandedRow({
  h,
  onDeadlineChange,
}: {
  h: Hearing;
  onDeadlineChange: (id: number, d: string) => void;
}) {
  const [editing, setEditing]       = useState(false);
  const [deadlineVal, setDeadlineVal] = useState(h.post_hrg_deadline ?? "");
  const [saving, setSaving]           = useState(false);

  async function save() {
    setSaving(true);
    await updatePostHrgDeadline(h.id, deadlineVal);
    onDeadlineChange(h.id, deadlineVal);
    setSaving(false);
    setEditing(false);
  }

  return (
    <tr className="bg-amber-50/60 dark:bg-amber-950/20 border-b border-border">
      <td colSpan={11} className="px-6 py-3">
        <div className="flex flex-wrap gap-6 items-start">
          {/* Deadline */}
          <div className="min-w-48">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1.5">Post HRG Deadline</p>
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={deadlineVal}
                  onChange={(e) => setDeadlineVal(e.target.value)}
                  className="text-xs px-2 py-1 rounded border border-border bg-card text-foreground"
                />
                <button onClick={save} disabled={saving}
                  className="text-xs px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
                  {saving ? <Loader2 size={10} className="animate-spin" /> : "Save"}
                </button>
                <button onClick={() => setEditing(false)}
                  className="text-xs px-2.5 py-1 rounded bg-muted hover:bg-muted/80 text-foreground">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {h.post_hrg_deadline ? (
                  <>
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{fmtDate(h.post_hrg_deadline)}</span>
                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-medium",
                      new Date(h.post_hrg_deadline) < new Date()
                        ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                        : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                    )}>
                      {new Date(h.post_hrg_deadline) < new Date() ? "Overdue" : "Upcoming"}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">No deadline set</span>
                )}
                <button onClick={() => setEditing(true)} className="text-[10px] text-primary hover:underline">Edit</button>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="flex-1 min-w-64">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">📝 Post HRG Notes</p>
            <NotesList hearingId={h.id} />
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function PostHrgModal({ open, onClose, teams, mrStatusOptions, hearingId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [hearings, setHearings]       = useState<Hearing[]>([]);
  const [total, setTotal]             = useState(0);
  const [totalPages, setTotalPages]   = useState(1);
  const [expandedId, setExpandedId]   = useState<number | null>(null);

  const [filters, setFilters] = useState<HearingFilters>({
    search: "", team_filter: "", status_filter: "",
    sort_order: "desc", page: 1, per_page: 50,
  });

  function load(f: HearingFilters) {
    startTransition(async () => {
      const res = await getPostHrgHearings(f);
      setHearings(res.hearings);
      setTotal(res.total);
      setTotalPages(res.total_pages);
      if (hearingId) setExpandedId(hearingId);
    });
  }

  useEffect(() => {
    if (open) load(filters);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilter(patch: Partial<HearingFilters>) {
    const next = { ...filters, ...patch, page: 1 };
    setFilters(next);
    load(next);
  }

  function handleDeadlineChange(id: number, deadline: string) {
    setHearings((prev) => prev.map((h) => h.id === id ? { ...h, post_hrg_deadline: deadline } : h));
  }

  if (!open) return null;

  return (
    <ModalShell
      title={`Post HRG Review (${total})`}
      icon={ClipboardList}
      onClose={onClose}
      maxWidth="max-w-7xl"
      layout="bare"
    >
      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2 px-4 py-2.5 bg-muted/20 border-b border-border shrink-0">
        <input
          type="text"
          placeholder="🔍 Search claimant…"
          value={filters.search}
          onChange={(e) => applyFilter({ search: e.target.value })}
          className="text-xs px-3 py-1.5 rounded border border-border bg-card text-foreground focus:outline-none focus:border-primary min-w-40"
        />
        <select
          value={filters.sort_order}
          onChange={(e) => applyFilter({ sort_order: e.target.value as "asc" | "desc" })}
          className="text-xs px-2 py-1.5 rounded border border-border bg-card text-foreground cursor-pointer"
        >
          <option value="desc">Date Descending</option>
          <option value="asc">Date Ascending</option>
        </select>
        <select
          value={filters.team_filter}
          onChange={(e) => applyFilter({ team_filter: e.target.value })}
          className="text-xs px-2 py-1.5 rounded border border-border bg-card text-foreground cursor-pointer"
        >
          <option value="">All Teams</option>
          <option value="unassigned">Unassigned</option>
          {teams.filter((t) => (t.team_type as string) !== "shared").map((t) => (
            <option key={t.id} value={t.id}>{t.team_name}</option>
          ))}
        </select>
        <select
          value={filters.status_filter}
          onChange={(e) => applyFilter({ status_filter: e.target.value })}
          className="text-xs px-2 py-1.5 rounded border border-border bg-card text-foreground cursor-pointer"
        >
          <option value="">All MR Statuses</option>
          {mrStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="ml-auto text-xs text-muted-foreground self-center">{total} hearing{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0">
        {isPending ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : hearings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-16">No Post HRG hearings found.</p>
        ) : (
          <table className="w-full text-[11px] border-collapse min-w-[1100px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted text-foreground text-[10px] font-extrabold uppercase tracking-wider border-b border-border">
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Hearing Date</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Time</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Claimant</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Rep</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">MR Team</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">MR Status</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Status</th>
                <th className="px-3 py-2.5 text-center whitespace-nowrap">MOA</th>
                <th className="px-3 py-2.5 text-center whitespace-nowrap">5-Day</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Post HRG</th>
                <th className="px-3 py-2.5 text-center whitespace-nowrap">Link</th>
              </tr>
            </thead>
            <tbody>
              {hearings.map((h) => {
                const isExpanded = expandedId === h.id;
                return (
                  <Fragment key={h.id}>
                    <tr
                      className={cn(
                        "border-b border-border/40 transition-colors",
                        isExpanded ? "bg-primary/5" : "hover:bg-muted/30"
                      )}
                    >
                      {/* Hearing Date */}
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-foreground">
                        {fmtDate(h.hearing_date)}
                      </td>
                      {/* Time */}
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {fmtTime(h.converted_time_est)}
                      </td>
                      {/* Claimant */}
                      <td className="px-3 py-2">
                        <div className="font-semibold text-foreground">{h.claimant}</div>
                      </td>
                      {/* Rep */}
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {h.rep_name ?? "—"}
                      </td>
                      {/* MR Team */}
                      <td className="px-3 py-2">
                        {h.mr_team_name ? (
                          <span className="inline-block text-[9px] px-1.5 py-0.5 rounded font-medium text-white whitespace-nowrap"
                            style={teamBg(h.mr_team_color)}>
                            {h.mr_team_name}
                          </span>
                        ) : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      {/* MR Status */}
                      <td className="px-3 py-2">
                        {h.medical_record_status ? (
                          <span className={cn("inline-block text-[9px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap",
                            MR_STATUS_CLS[h.medical_record_status] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          )}>
                            {h.medical_record_status}
                          </span>
                        ) : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      {/* Hearing Decision Status */}
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {h.hearing_decision_status ?? "—"}
                      </td>
                      {/* MOA */}
                      <td className="px-3 py-2 text-center">
                        {h.manner_of_appearance ? (
                          <span className="inline-block text-[9px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 font-medium">
                            {h.manner_of_appearance}
                          </span>
                        ) : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      {/* 5-Day */}
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!h.five_day_notice}
                          className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer"
                          onChange={async (e) => {
                            const val = e.target.checked;
                            setHearings((prev) => prev.map((r) => r.id === h.id ? { ...r, five_day_notice: val } : r));
                            await toggleFiveDayNotice(h.id, val);
                          }}
                        />
                      </td>
                      {/* Post HRG deadline + notes badge */}
                      <td className="px-3 py-2">
                        <div
                          className="flex items-center gap-1.5 flex-wrap cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : h.id)}
                        >
                          {h.post_hrg_deadline && (
                            <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap",
                              new Date(h.post_hrg_deadline) < new Date()
                                ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                            )}>
                              📅 {new Date(h.post_hrg_deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          )}
                          {h.post_hrg_review && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-medium">
                              Notes
                            </span>
                          )}
                          {!h.post_hrg_deadline && !h.post_hrg_review && (
                            <span className="text-[9px] text-muted-foreground/50">+ Add</span>
                          )}
                        </div>
                      </td>
                      {/* Worksheet link */}
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {h.medical_record_link ? (
                            <a
                              href={h.medical_record_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center w-6 h-6 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold"
                            >
                              S
                            </a>
                          ) : <span className="text-muted-foreground/30">—</span>}
                          {/* Expand toggle — only trigger */}
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : h.id)}
                            className="text-muted-foreground/50 hover:text-foreground transition-colors p-0.5"
                          >
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded inline panel */}
                    {isExpanded && (
                      <ExpandedRow
                        key={`exp-${h.id}`}
                        h={h}
                        onDeadlineChange={handleDeadlineChange}
                      />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-border bg-muted/20 shrink-0">
        <span className="text-xs text-muted-foreground">
          Page {filters.page} of {totalPages} — {total} total
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { const next = { ...filters, page: (filters.page ?? 1) - 1 }; setFilters(next); load(next); }}
            disabled={(filters.page ?? 1) <= 1}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-muted hover:bg-muted/80 text-foreground font-semibold disabled:opacity-40"
          >
            <ChevronLeft size={12} /> Prev
          </button>
          <button
            onClick={() => { const next = { ...filters, page: (filters.page ?? 1) + 1 }; setFilters(next); load(next); }}
            disabled={(filters.page ?? 1) >= totalPages}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-40"
          >
            Next <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

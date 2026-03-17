"use client";

import { useState, useEffect, useTransition } from "react";
import { ChevronLeft, ChevronRight, Loader2, ClipboardList } from "lucide-react";
import { ModalShell } from "@/components/modals/modal-shell";
import {
  getPostHrgHearings,
  getPostHrgNotes,
  updatePostHrgDeadline,
} from "@/app/(dashboard)/medical-records/action";
import type {
  Hearing, PostHrgNote, MrTeam, HearingFilters,
} from "@/app/(dashboard)/medical-records/action";

interface Props {
  open: boolean;
  onClose: () => void;
  teams: MrTeam[];
  mrStatusOptions: string[];
  hearingId?: number; // When provided, opens directly to that hearing's detail panel
}

// ─── DeadlineStatus ───────────────────────────────────────────────────────────

function DeadlineStatus({ deadline }: { deadline: string | null }) {
  if (!deadline) return <span className="text-xs text-muted-foreground">No deadline set</span>;
  const d = new Date(deadline);
  const overdue = d < new Date();
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
        {d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </span>
      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
        overdue
          ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
          : "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
      }`}>
        {overdue ? "Overdue" : "Upcoming"}
      </span>
    </div>
  );
}

// ─── NotesList ────────────────────────────────────────────────────────────────

function NotesList({ hearingId }: { hearingId: number }) {
  const [notes,   setNotes]   = useState<PostHrgNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getPostHrgNotes(hearingId).then((n) => { setNotes(n); setLoading(false); });
  }, [hearingId]);

  if (loading) return (
    <div className="py-6 text-center text-sm text-muted-foreground">
      <Loader2 size={18} className="animate-spin inline mr-2" />Loading notes…
    </div>
  );
  if (!notes.length) return (
    <div className="py-6 text-center text-sm text-muted-foreground italic">No notes yet.</div>
  );

  return (
    <div className="border border-border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
      {notes.map((n) => (
        <div key={n.id} className="px-4 py-3 border-b border-border last:border-0 hover:bg-muted/40">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-primary">{n.author_name}</span>
            <span className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap">{n.content}</p>
        </div>
      ))}
    </div>
  );
}

// ─── HearingDetailPanel ───────────────────────────────────────────────────────

function HearingDetailPanel({
  h, onDeadlineChange,
}: {
  h: Hearing;
  onDeadlineChange: (id: number, d: string) => void;
}) {
  const [editing,       setEditing]       = useState(false);
  const [deadlineValue, setDeadlineValue] = useState(h.post_hrg_deadline ?? "");
  const [saving,        setSaving]        = useState(false);

  async function save() {
    setSaving(true);
    await updatePostHrgDeadline(h.id, deadlineValue);
    onDeadlineChange(h.id, deadlineValue);
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className="space-y-4">
      {/* Hearing info bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-muted/40 rounded-lg text-sm">
        <span className="font-semibold text-foreground">{h.claimant}</span>
        <span className="text-muted-foreground">|</span>
        <span className="text-muted-foreground">
          {new Date(h.hearing_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
        {h.rep_name    && <><span className="text-muted-foreground">|</span><span className="text-muted-foreground">{h.rep_name}</span></>}
        {h.mr_team_name && <><span className="text-muted-foreground">|</span><span className="text-muted-foreground">{h.mr_team_name}</span></>}
      </div>

      {/* Deadline */}
      <div className="px-4 py-3 rounded-lg border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/30">
        <label className="block text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">
          Post HRG Deadline
        </label>
        {editing ? (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={deadlineValue}
              onChange={(e) => setDeadlineValue(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg border border-border bg-card text-foreground"
            />
            <button
              onClick={save}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:text-zinc-200 font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <DeadlineStatus deadline={h.post_hrg_deadline} />
            <button onClick={() => setEditing(true)} className="text-xs text-primary hover:underline font-semibold">
              Edit
            </button>
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <p className="text-sm font-semibold text-foreground mb-2">Post HRG Notes</p>
        <NotesList hearingId={h.id} />
        <p className="mt-3 text-xs text-center text-blue-600 dark:text-blue-400">
          Full post-hearing management is available in the{" "}
          <a href="/post-hearing" className="font-semibold hover:underline">Post Hearing Dashboard →</a>
        </p>
      </div>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function PostHrgModal({ open, onClose, teams, mrStatusOptions, hearingId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [hearings,    setHearings]    = useState<Hearing[]>([]);
  const [total,       setTotal]       = useState(0);
  const [totalPages,  setTotalPages]  = useState(1);
  const [selectedHearing, setSelectedHearing] = useState<Hearing | null>(null);

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
      // When opened from a specific row, auto-select that hearing
      if (hearingId) {
        const match = res.hearings.find((h) => h.id === hearingId) ?? null;
        setSelectedHearing(match);
      }
    });
  }

  useEffect(() => { if (open) load(filters); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilter(patch: Partial<HearingFilters>) {
    const next = { ...filters, ...patch, page: 1 };
    setFilters(next);
    load(next);
  }

  function handleDeadlineChange(id: number, deadline: string) {
    setHearings((prev) => prev.map((h) => h.id === id ? { ...h, post_hrg_deadline: deadline } : h));
    if (selectedHearing?.id === id) setSelectedHearing((h) => h ? { ...h, post_hrg_deadline: deadline } : h);
  }

  if (!open) return null;

  return (
    <ModalShell
      title="Post HRG Review"
      icon={ClipboardList}
      onClose={onClose}
      maxWidth="max-w-5xl"
      layout="bare"
    >
      {/* ── Filter Bar — flex-shrink-0 ──────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 px-4 py-2.5 bg-muted/20 border-b border-border flex-shrink-0">
        <input
          type="text"
          placeholder="🔍 Search…"
          value={filters.search}
          onChange={(e) => applyFilter({ search: e.target.value })}
          className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:border-primary min-w-36"
        />
        <select value={filters.sort_order} onChange={(e) => applyFilter({ sort_order: e.target.value as "asc" | "desc" })}
          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer">
          <option value="desc">Date Desc</option>
          <option value="asc">Date Asc</option>
        </select>
        <select value={filters.team_filter} onChange={(e) => applyFilter({ team_filter: e.target.value })}
          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer">
          <option value="">All Teams</option>
          <option value="unassigned">Unassigned</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.team_name}</option>)}
        </select>
        <select value={filters.status_filter} onChange={(e) => applyFilter({ status_filter: e.target.value })}
          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer">
          <option value="">All MR Statuses</option>
          {mrStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* ── Split body — flex-1 min-h-0 contains the two panes ─────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Hearing list — fixed-width, own scroll context */}
        <div className="w-60 sm:w-64 shrink-0 border-r border-border overflow-y-auto relative">
          {isPending && (
            <div className="absolute inset-0 bg-background/70 flex items-center justify-center z-10">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          )}
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border bg-muted/20 sticky top-0 z-[1]">
            {total} hearing{total !== 1 ? "s" : ""}
          </div>
          {hearings.map((h) => (
            <button
              key={h.id}
              onClick={() => setSelectedHearing(h)}
              className={`w-full text-left px-3 py-2.5 border-b border-border transition-colors hover:bg-muted/50 ${
                selectedHearing?.id === h.id ? "bg-primary/10 border-l-2 border-l-primary" : ""
              }`}
            >
              <div className="text-xs font-semibold text-foreground truncate">{h.claimant}</div>
              <div className="text-[10px] text-muted-foreground">
                {new Date(h.hearing_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {h.post_hrg_deadline && (
                  <span className="ml-1.5 text-amber-600 dark:text-amber-400">
                    📅 {new Date(h.post_hrg_deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
            </button>
          ))}
          {!isPending && hearings.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-10">No Post HRG hearings found.</p>
          )}
        </div>

        {/* Detail panel — flex-1, own scroll context */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {selectedHearing ? (
            <HearingDetailPanel h={selectedHearing} onDeadlineChange={handleDeadlineChange} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              ← Select a hearing to view details
            </div>
          )}
        </div>
      </div>

      {/* ── Pagination Footer — flex-shrink-0 ──────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-border bg-muted/20 flex-shrink-0">
        <span className="text-xs text-muted-foreground">
          Page {filters.page} of {totalPages} — {total} total
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { const next = { ...filters, page: (filters.page ?? 1) - 1 }; setFilters(next); load(next); }}
            disabled={(filters.page ?? 1) <= 1}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:text-zinc-200 font-semibold disabled:opacity-40 transition-colors"
          >
            <ChevronLeft size={12} /> Prev
          </button>
          <button
            onClick={() => { const next = { ...filters, page: (filters.page ?? 1) + 1 }; setFilters(next); load(next); }}
            disabled={(filters.page ?? 1) >= totalPages}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-40 transition-colors"
          >
            Next <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

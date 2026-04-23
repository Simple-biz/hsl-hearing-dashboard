"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// ─── Shared PostHrgReviewModal ────────────────────────────────────────────────
// Matches the dashboard-client review UX and is the canonical modal for any
// "Post HRG Review" action across the app.
//
// mode="hearing"       — reads/writes hearings.post_hrg_notes (+ requirements,
//                        deadline, deadline_prev/changed_by). Shared state that
//                        appears on dashboard, medical-records, hearings-modal,
//                        and post-hrg-development (MR rows only).
//
// mode="phd-internal"  — reads/writes post_hrg_development.details_notes for
//                        the given PHD row id. Scoped to the post-hrg team;
//                        never syncs to the parent hearing.

export interface PostHrgNote {
  user: string;
  date: string;
  note: string;
}

function parseNotes(raw: string | null | undefined): PostHrgNote[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return raw ? [{ user: "System", date: "", note: String(raw) }] : [];
    }
    return parsed.map((item: Record<string, unknown>) => ({
      user: String(item.user ?? item.author ?? item.author_name ?? "Unknown"),
      date: String(item.date ?? item.created_at ?? ""),
      note: String(item.note ?? item.content ?? ""),
    }));
  } catch {
    return raw ? [{ user: "System", date: "", note: String(raw) }] : [];
  }
}

const ROLES_CAN_EDIT_NOTES = [
  "system_admin",
  "admin",
  "manager",
  "mr_admin",
  "mr_lead",
  "mr_agent",
  "post_hearing_admin",
  "post_hearing_staff",
];

const ROLES_CAN_EDIT_REQUIREMENTS = [
  "system_admin",
  "admin",
  "post_hearing_admin",
];

interface CommonProps {
  claimant: string;
  hearingDateText?: string | null;
  assignedRep?: string | null;
  userName: string;
  userRole: string;
  onClose: () => void;
}

type HearingModeProps = CommonProps & {
  mode: "hearing";
  hearingId: number;
  initialNotes: string | null;
  initialDeadline: string | null;
  initialRequirements: string | null;
  initialDeadlinePrev: string | null;
  initialDeadlineChangedBy: string | null;
  onHearingPatch: (patch: {
    post_hrg_notes?: string | null;
    post_hrg_deadline?: string | null;
    post_hrg_review?: boolean;
    post_hrg_requirements?: string | null;
  }) => void;
};

type PhdInternalModeProps = CommonProps & {
  mode: "phd-internal";
  phdRowId: number;
  initialNotes: string | null;
  // If the PHD row links to a hearing, pass the hearing id here. The modal
  // will additionally fetch & display the hearing's `post_hrg_notes` as a
  // read-only "Notes from MR / Dashboard" section so the post-hearing team
  // has visibility into the MR thread. Their own notes still only write to
  // PHD's `details_notes`.
  linkedHearingId?: number | null;
  onPhdPatch: (patch: { details_notes?: string | null }) => void;
};

type Props = HearingModeProps | PhdInternalModeProps;

export function PostHrgReviewModal(props: Props) {
  return props.mode === "hearing" ? (
    <HearingReview {...props} />
  ) : (
    <PhdInternalReview {...props} />
  );
}

// ─── Hearing mode ─────────────────────────────────────────────────────────────

function HearingReview({
  claimant,
  hearingDateText,
  assignedRep,
  userName,
  userRole,
  onClose,
  hearingId,
  initialNotes,
  initialDeadline,
  initialRequirements,
  initialDeadlinePrev,
  initialDeadlineChangedBy,
  onHearingPatch,
}: HearingModeProps) {
  const [notes, setNotes] = useState<PostHrgNote[]>(() =>
    parseNotes(initialNotes),
  );
  const visibleNotes = notes.filter((n) => n.user !== "System Administrator");
  const [newNote, setNewNote] = useState("");
  const [deadline, setDeadline] = useState(initialDeadline ?? "");
  const [deadlinePrev, setDeadlinePrev] = useState(initialDeadlinePrev ?? "");
  const [deadlineChangedBy, setDeadlineChangedBy] = useState(
    initialDeadlineChangedBy ?? "",
  );
  const [requirements, setRequirements] = useState(initialRequirements ?? "");
  const [isEditingReq, setIsEditingReq] = useState(!initialRequirements);
  const [hasSavedReq, setHasSavedReq] = useState(!!initialRequirements);
  const [saving, setSaving] = useState(false);

  const isEditingReqRef = useRef(isEditingReq);
  useEffect(() => {
    isEditingReqRef.current = isEditingReq;
  }, [isEditingReq]);

  const savingRef = useRef(false);
  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active || savingRef.current) return;
      try {
        const { fetchPostHrgNotes } = await import("@/app/(dashboard)/actions");
        const data = (await fetchPostHrgNotes(hearingId)) as
          | string
          | {
              post_hrg_notes: string | null;
              post_hrg_deadline: string | null;
              post_hrg_requirements: string | null;
              post_hrg_deadline_prev: string | null;
              post_hrg_deadline_changed_by: string | null;
            }
          | null;
        if (!active || !data) return;
        if (typeof data === "string") {
          setNotes(parseNotes(data));
        } else {
          setNotes(parseNotes(data.post_hrg_notes));
          if (!isEditingReqRef.current) {
            setRequirements(data.post_hrg_requirements ?? "");
            setHasSavedReq(!!data.post_hrg_requirements);
          }
          if (data.post_hrg_deadline != null) setDeadline(data.post_hrg_deadline);
          if (data.post_hrg_deadline_prev !== undefined) {
            setDeadlinePrev(data.post_hrg_deadline_prev ?? "");
          }
          if (data.post_hrg_deadline_changed_by !== undefined) {
            setDeadlineChangedBy(data.post_hrg_deadline_changed_by ?? "");
          }
        }
      } catch {
        /* ignore */
      }
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [hearingId]);

  const canEditNotes = ROLES_CAN_EDIT_NOTES.includes(userRole);
  const canEditReq = ROLES_CAN_EDIT_REQUIREMENTS.includes(userRole);

  const handleAddNote = async () => {
    const trimmed = newNote.trim();
    if (!trimmed || !canEditNotes) return;
    setSaving(true);
    try {
      const { addDashboardPostHrgNote, updateHearing } = await import(
        "@/app/(dashboard)/actions"
      );
      const r = await addDashboardPostHrgNote(hearingId, trimmed, userName);
      if (r.success) {
        const added: PostHrgNote = {
          user: userName,
          date: new Date().toISOString(),
          note: trimmed,
        };
        const next = [added, ...notes];
        setNotes(next);
        onHearingPatch({
          post_hrg_notes: JSON.stringify(next),
          post_hrg_review: true,
        });
        setNewNote("");
      }
      if (deadline && deadline !== initialDeadline) {
        await updateHearing(hearingId, "post_hrg_deadline", deadline);
        onHearingPatch({ post_hrg_deadline: deadline });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (idx: number) => {
    if (!canEditNotes) return;
    const target = visibleNotes[idx];
    const fullIdx = notes.findIndex((n) => n === target);
    if (fullIdx < 0) return;
    const { deleteDashboardPostHrgNote } = await import(
      "@/app/(dashboard)/actions"
    );
    const r = await deleteDashboardPostHrgNote(hearingId, fullIdx);
    if (r.success) {
      const next = notes.filter((_, i) => i !== fullIdx);
      setNotes(next);
      onHearingPatch({
        post_hrg_notes: next.length ? JSON.stringify(next) : null,
        post_hrg_review: next.length > 0,
      });
    }
  };

  const handleUpdateDeadline = async () => {
    const { updateHearing } = await import("@/app/(dashboard)/actions");
    await updateHearing(hearingId, "post_hrg_deadline", deadline || null);
    onHearingPatch({ post_hrg_deadline: deadline || null });
  };

  const handleClearDeadline = async () => {
    setDeadline("");
    const { updateHearing } = await import("@/app/(dashboard)/actions");
    await updateHearing(hearingId, "post_hrg_deadline", null);
    onHearingPatch({ post_hrg_deadline: null });
  };

  const handleSaveRequirements = async () => {
    const trimmed = requirements.trim();
    const { updateHearing } = await import("@/app/(dashboard)/actions");
    await updateHearing(
      hearingId,
      "post_hrg_requirements",
      trimmed || null,
    );
    onHearingPatch({ post_hrg_requirements: trimmed || null });
    setRequirements(trimmed);
    setHasSavedReq(!!trimmed);
    setIsEditingReq(false);
  };

  return (
    <ModalShell
      claimant={claimant}
      hearingDateText={hearingDateText}
      assignedRep={assignedRep}
      onClose={onClose}
      banner={
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-3 py-2">
          <span className="text-blue-500 text-sm">🔗</span>
          <p className="text-[11px] text-blue-700 dark:text-blue-400">
            Synced with hearing record — changes reflect on the main dashboard
            and medical records page.
          </p>
        </div>
      }
    >
      {/* Deadline */}
      <DeadlineRow
        deadline={deadline}
        onChange={setDeadline}
        onUpdate={handleUpdateDeadline}
        onClear={handleClearDeadline}
      />
      {(deadlinePrev || deadlineChangedBy) && (
        <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5">
          {deadlinePrev && (
            <p>
              <span className="font-medium">Previous date:</span>{" "}
              <span className="font-semibold">{deadlinePrev}</span>
            </p>
          )}
          {deadlineChangedBy && (
            <p>
              <span className="font-medium">Changed by:</span>{" "}
              <span className="font-semibold">{deadlineChangedBy}</span>
            </p>
          )}
        </div>
      )}

      {/* Requirements */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-red-700 dark:text-red-400">
          Requirements
        </label>
        {canEditReq ? (
          <>
            <textarea
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              rows={3}
              placeholder="Enter requirements..."
              disabled={!isEditingReq}
              className="w-full rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 dark:text-red-300 placeholder:text-red-400 dark:placeholder:text-red-600 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 disabled:opacity-80 disabled:cursor-not-allowed"
            />
            <div className="flex gap-2">
              {isEditingReq ? (
                <button
                  className="h-7 text-xs px-3 rounded-md border border-red-300 text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                  onClick={handleSaveRequirements}
                  disabled={saving}
                >
                  {hasSavedReq ? "Update" : "Save Requirements"}
                </button>
              ) : (
                <button
                  className="h-7 text-xs px-3 rounded-md border border-red-300 text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                  onClick={() => setIsEditingReq(true)}
                >
                  Edit
                </button>
              )}
            </div>
          </>
        ) : requirements ? (
          <div className="w-full rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap min-h-15">
            {requirements}
          </div>
        ) : (
          <p className="text-xs text-red-400 dark:text-red-600 italic py-1">
            No requirements set.
          </p>
        )}
      </div>

      {/* Add note */}
      <AddNote
        canEdit={canEditNotes}
        value={newNote}
        onChange={setNewNote}
        onAdd={handleAddNote}
        saving={saving}
      />

      {/* Notes history */}
      <NotesHistory
        notes={visibleNotes}
        canEdit={canEditNotes}
        onDelete={handleDeleteNote}
      />
    </ModalShell>
  );
}

// ─── PHD-internal mode ────────────────────────────────────────────────────────

function PhdInternalReview({
  claimant,
  hearingDateText,
  assignedRep,
  userName,
  userRole,
  onClose,
  phdRowId,
  initialNotes,
  linkedHearingId,
  onPhdPatch,
}: PhdInternalModeProps) {
  const [notes, setNotes] = useState<PostHrgNote[]>(() =>
    parseNotes(initialNotes),
  );
  const [hearingNotes, setHearingNotes] = useState<PostHrgNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        const { fetchPostHrgDevNotes } = await import(
          "@/app/(dashboard)/post-hrg-development/actions"
        );
        const raw = await fetchPostHrgDevNotes(phdRowId, "details");
        if (active) setNotes(parseNotes(raw));
      } catch {
        /* */
      }
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [phdRowId]);

  // When the PHD row is linked to a hearing, also poll the hearing's
  // post_hrg_notes so the post-hearing team sees the MR / Dashboard thread
  // as read-only context.
  useEffect(() => {
    if (!linkedHearingId) {
      setHearingNotes([]);
      return;
    }
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        const { fetchPostHrgNotes } = await import(
          "@/app/(dashboard)/actions"
        );
        const data = (await fetchPostHrgNotes(linkedHearingId)) as
          | string
          | { post_hrg_notes: string | null }
          | null;
        if (!active || !data) return;
        const raw = typeof data === "string" ? data : data.post_hrg_notes;
        setHearingNotes(parseNotes(raw));
      } catch {
        /* ignore */
      }
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [linkedHearingId]);

  const canEditNotes = ROLES_CAN_EDIT_NOTES.includes(userRole);

  const handleAddNote = async () => {
    const trimmed = newNote.trim();
    if (!trimmed || !canEditNotes) return;
    setSaving(true);
    try {
      const { addPostHrgDevNote } = await import(
        "@/app/(dashboard)/post-hrg-development/actions"
      );
      const r = await addPostHrgDevNote(phdRowId, "details", trimmed, userName);
      if (r.success && r.updatedNotes) {
        setNotes(parseNotes(r.updatedNotes));
        onPhdPatch({ details_notes: r.updatedNotes });
        setNewNote("");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (idx: number) => {
    if (!canEditNotes) return;
    const { deletePostHrgDevNote } = await import(
      "@/app/(dashboard)/post-hrg-development/actions"
    );
    const r = await deletePostHrgDevNote(phdRowId, "details", idx);
    if (r.success) {
      setNotes(parseNotes(r.updatedNotes));
      onPhdPatch({ details_notes: r.updatedNotes });
    }
  };

  return (
    <ModalShell
      claimant={claimant}
      hearingDateText={hearingDateText}
      assignedRep={assignedRep}
      onClose={onClose}
      banner={
        <div className="flex items-center gap-2 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 px-3 py-2">
          <span className="text-violet-500 text-sm">🔒</span>
          <p className="text-[11px] text-violet-700 dark:text-violet-400">
            Internal Post HRG notes — visible only on the Post HRG Development
            page for this row.
          </p>
        </div>
      }
    >
      <AddNote
        canEdit={canEditNotes}
        value={newNote}
        onChange={setNewNote}
        onAdd={handleAddNote}
        saving={saving}
      />
      <NotesHistory
        notes={notes}
        canEdit={canEditNotes}
        onDelete={handleDeleteNote}
      />
      {linkedHearingId ? (
        <div className="space-y-1.5 pt-2 border-t border-border/60">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              Notes from MR / Dashboard
            </span>
            <span className="text-[10px] text-muted-foreground/70">
              ({hearingNotes.length}) — read-only
            </span>
          </div>
          {hearingNotes.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-1">
              No MR / Dashboard notes yet.
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto pr-1 space-y-1.5">
              {hearingNotes.map((n, i) => (
                <div
                  key={i}
                  className="rounded-md border bg-muted/30 px-3 py-2"
                >
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                    <span className="font-medium">{n.user || "Unknown"}</span>
                    {n.date && <span>{n.date}</span>}
                  </div>
                  <p className="text-xs whitespace-pre-wrap">{n.note}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </ModalShell>
  );
}

// ─── Shared subcomponents ─────────────────────────────────────────────────────

function ModalShell({
  claimant,
  hearingDateText,
  assignedRep,
  onClose,
  banner,
  children,
}: {
  claimant: string;
  hearingDateText?: string | null;
  assignedRep?: string | null;
  onClose: () => void;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border bg-card shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
          <div>
            <h2 className="text-sm font-semibold">Post HRG Review</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {claimant}
              {hearingDateText && ` • ${hearingDateText}`}
              {assignedRep && ` • ${assignedRep}`}
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
          {banner}
          {children}
        </div>
        <div className="border-t px-5 py-3 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="h-8 text-xs px-4 rounded-md border hover:bg-muted transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DeadlineRow({
  deadline,
  onChange,
  onUpdate,
  onClear,
}: {
  deadline: string;
  onChange: (v: string) => void;
  onUpdate: () => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium">Deadline Date</label>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="date"
          value={deadline}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 rounded-lg border bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary w-auto"
        />
        <button
          className="h-8 text-xs px-3 rounded-md border hover:bg-muted transition-colors"
          onClick={onUpdate}
        >
          Update
        </button>
        {deadline && (
          <button
            className="h-8 text-xs px-3 rounded-md hover:bg-muted transition-colors text-muted-foreground"
            onClick={onClear}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function AddNote({
  canEdit,
  value,
  onChange,
  onAdd,
  saving,
}: {
  canEdit: boolean;
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  saving: boolean;
}) {
  if (!canEdit) {
    return (
      <p className="text-xs text-muted-foreground italic py-2">
        You do not have permission to add notes.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium">Add New Note</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="Enter your note..."
        className="w-full rounded-md border bg-transparent px-3 py-2 text-xs placeholder:text-muted-foreground focus:border-ring focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onAdd();
          }
        }}
      />
      <button
        onClick={onAdd}
        disabled={saving || !value.trim()}
        className={cn(
          "h-8 text-xs px-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
        )}
      >
        {saving ? "Saving..." : "Add Note"}
      </button>
    </div>
  );
}

function NotesHistory({
  notes,
  canEdit,
  onDelete,
}: {
  notes: PostHrgNote[];
  canEdit: boolean;
  onDelete: (idx: number) => void;
}) {
  return (
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
        <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
          {notes.map((n, i) => (
            <div
              key={i}
              className="rounded-lg border bg-muted/30 p-3 space-y-1"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {n.user || "System"}
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
                {canEdit && (
                  <button
                    onClick={() => onDelete(i)}
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
  );
}

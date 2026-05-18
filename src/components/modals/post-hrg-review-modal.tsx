"use client";

import { useState, useEffect, useRef } from "react";
import { Calendar } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

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

export interface PostHrgNoteEdit {
  at: string; // ISO timestamp
  prev: string; // text before this edit
}

export interface PostHrgNote {
  user: string;
  date: string;
  note: string;
  edits?: PostHrgNoteEdit[];
}

function parseEdits(raw: unknown): PostHrgNoteEdit[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: PostHrgNoteEdit[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const item = e as Record<string, unknown>;
    out.push({
      at: String(item.at ?? ""),
      prev: String(item.prev ?? ""),
    });
  }
  return out.length > 0 ? out : undefined;
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
      edits: parseEdits(item.edits),
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

// Deadline edits are restricted to the same roles as Requirements.
const ROLES_CAN_EDIT_DEADLINE = [
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
  // When true the modal is view-only: the body is rendered `inert` (readable
  // + scrollable but non-interactive) and a lock banner is shown. Used for
  // Completed / Records Closed PHD rows.
  readOnly?: boolean;
  onClose: () => void;
  // Fired after a successful "Also apply to" cascade so the parent can
  // patch sibling rows in local state without a page refresh. `targets`
  // contains the record types that were cascaded TO.
  onCascadeApplied?: (params: {
    hearingId: number;
    field: "deadline" | "requirements";
    value: string | null;
    targets: ("MR" | "POST_HRG" | "REP")[];
  }) => void;
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
  // Per-PHD-row deadline + requirements, read/written via updatePostHrgDevField.
  // Independent of the parent hearing's post_hrg_deadline / post_hrg_requirements.
  initialDeadline?: string | null;
  initialRequirements?: string | null;
  // If the PHD row links to a hearing, pass the hearing id here. The modal
  // will additionally fetch & display the hearing's `post_hrg_notes` as a
  // read-only "Notes from MR / Dashboard" section so the post-hearing team
  // has visibility into the MR thread. Their own notes still only write to
  // PHD's `details_notes`.
  linkedHearingId?: number | null;
  // Current row's record_type — drives which "Also apply to" checkboxes
  // appear (the other types for the same hearing). Required to surface
  // the cascade UI; omitted when the caller opts out.
  currentRecordType?: "MR" | "POST_HRG" | "REP";
  onPhdPatch: (patch: {
    details_notes?: string | null;
    deadline?: string | null;
    requirements?: string | null;
  }) => void;
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
  readOnly,
  onClose,
  hearingId,
  initialNotes,
  initialDeadline,
  initialRequirements,
  initialDeadlinePrev,
  initialDeadlineChangedBy,
  onHearingPatch,
  onCascadeApplied,
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
  const [deadlineHistory, setDeadlineHistory] = useState<
    { deadline: string; set_at: string; set_by: string | null }[]
  >([]);
  const [showDeadlineHistory, setShowDeadlineHistory] = useState(false);
  // Cascade UI — which other record types to also update on Update/Clear
  const [availableCascadeTypes, setAvailableCascadeTypes] = useState<{
    MR: boolean;
    POST_HRG: boolean;
    REP: boolean;
  } | null>(null);
  const [cascadeDeadlineTargets, setCascadeDeadlineTargets] = useState<
    Set<"MR" | "POST_HRG" | "REP">
  >(new Set());
  const [cascadeReqTargets, setCascadeReqTargets] = useState<
    Set<"MR" | "POST_HRG" | "REP">
  >(new Set());

  const isEditingReqRef = useRef(isEditingReq);
  useEffect(() => {
    isEditingReqRef.current = isEditingReq;
  }, [isEditingReq]);

  const savingRef = useRef(false);
  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  // Tracks "user has picked a new deadline locally but hasn't clicked
  // Update/Clear yet". Flipped on by handleDeadlineUserChange and off by
  // the save / clear handlers. The 8s poll honors this so a mid-edit
  // pick isn't clobbered by the server value.
  const deadlineDirtyRef = useRef(false);
  const handleDeadlineUserChange = (v: string) => {
    deadlineDirtyRef.current = true;
    setDeadline(v);
  };

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active || savingRef.current) return;
      try {
        const { fetchPostHrgNotes, fetchPostHrgDeadlineHistory } = await import(
          "@/app/(dashboard)/actions"
        );
        const [data, history] = await Promise.all([
          fetchPostHrgNotes(hearingId) as Promise<
            | string
            | {
                post_hrg_notes: string | null;
                post_hrg_deadline: string | null;
                post_hrg_requirements: string | null;
                post_hrg_deadline_prev: string | null;
                post_hrg_deadline_changed_by: string | null;
              }
            | null
          >,
          fetchPostHrgDeadlineHistory(hearingId),
        ]);
        if (!active) return;
        setDeadlineHistory(history);
        if (!data) return;
        if (typeof data === "string") {
          setNotes(parseNotes(data));
        } else {
          setNotes(parseNotes(data.post_hrg_notes));
          if (!isEditingReqRef.current) {
            setRequirements(data.post_hrg_requirements ?? "");
            setHasSavedReq(!!data.post_hrg_requirements);
          }
          if (!deadlineDirtyRef.current && data.post_hrg_deadline != null) {
            setDeadline(data.post_hrg_deadline);
          }
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
  const canEditDeadline = ROLES_CAN_EDIT_DEADLINE.includes(userRole);

  // Fetch which record types the hearing has PHD rows for — drives the
  // "Also apply to" checkbox list. MR is always true (maps to hearings.*).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { fetchPhdRelatedRecordTypes } = await import(
          "@/app/(dashboard)/post-hrg-development/actions"
        );
        const data = await fetchPhdRelatedRecordTypes(hearingId);
        if (active) setAvailableCascadeTypes(data);
      } catch {
        /* ignore — checkboxes stay hidden */
      }
    })();
    return () => {
      active = false;
    };
  }, [hearingId]);

  // Cascade the chosen value to the checked record types. Runs AFTER the
  // primary update so primary state never gets rolled back if cascade fails.
  const runCascade = async (
    field: "deadline" | "requirements",
    value: string | null,
    targets: Set<"MR" | "POST_HRG" | "REP">,
  ) => {
    if (targets.size === 0) return;
    try {
      const { cascadePhdField } = await import(
        "@/app/(dashboard)/post-hrg-development/actions"
      );
      const targetList = Array.from(targets);
      await cascadePhdField(hearingId, field, value, targetList);
      onCascadeApplied?.({ hearingId, field, value, targets: targetList });
    } catch {
      /* best-effort — primary already saved */
    }
  };

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

  // Inline-edit: only the original author can edit. The server enforces this
  // too, but we also gate the UI here so non-authors don't see the affordance.
  const handleEditNote = async (
    idx: number,
    newText: string,
  ): Promise<boolean> => {
    if (!canEditNotes) return false;
    const target = visibleNotes[idx];
    if (target.user.trim().toLowerCase() !== userName.trim().toLowerCase()) {
      return false;
    }
    const fullIdx = notes.findIndex((n) => n === target);
    if (fullIdx < 0) return false;
    const { editDashboardPostHrgNote } = await import(
      "@/app/(dashboard)/actions"
    );
    const r = await editDashboardPostHrgNote(
      hearingId,
      fullIdx,
      newText,
      userName,
    );
    if (!r.success || !r.updatedNotes) return false;
    const reparsed = parseNotes(r.updatedNotes);
    setNotes(reparsed);
    onHearingPatch({ post_hrg_notes: r.updatedNotes });
    return true;
  };

  const handleUpdateDeadline = async () => {
    const value = deadline || null;
    const { updateHearing } = await import("@/app/(dashboard)/actions");
    await updateHearing(hearingId, "post_hrg_deadline", value);
    onHearingPatch({ post_hrg_deadline: value });
    deadlineDirtyRef.current = false;
    await runCascade("deadline", value, cascadeDeadlineTargets);
    setCascadeDeadlineTargets(new Set());
  };

  const handleClearDeadline = async () => {
    setDeadline("");
    const { updateHearing } = await import("@/app/(dashboard)/actions");
    await updateHearing(hearingId, "post_hrg_deadline", null);
    onHearingPatch({ post_hrg_deadline: null });
    deadlineDirtyRef.current = false;
    await runCascade("deadline", null, cascadeDeadlineTargets);
    setCascadeDeadlineTargets(new Set());
  };

  const handleSaveRequirements = async () => {
    const trimmed = requirements.trim();
    const value = trimmed || null;
    const { updateHearing } = await import("@/app/(dashboard)/actions");
    await updateHearing(hearingId, "post_hrg_requirements", value);
    onHearingPatch({ post_hrg_requirements: value });
    setRequirements(trimmed);
    setHasSavedReq(!!trimmed);
    setIsEditingReq(false);
    await runCascade("requirements", value, cascadeReqTargets);
    setCascadeReqTargets(new Set());
  };

  return (
    <ModalShell
      claimant={claimant}
      hearingDateText={hearingDateText}
      assignedRep={assignedRep}
      onClose={onClose}
      readOnly={readOnly}
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
        onChange={handleDeadlineUserChange}
        onUpdate={handleUpdateDeadline}
        onClear={handleClearDeadline}
        canEdit={canEditDeadline}
      />
      {canEditDeadline && (
        <CascadeCheckboxes
          available={availableCascadeTypes}
          excludeType="MR"
          selected={cascadeDeadlineTargets}
          onToggle={(t) =>
            setCascadeDeadlineTargets((prev) => {
              const next = new Set(prev);
              if (next.has(t)) next.delete(t);
              else next.add(t);
              return next;
            })
          }
        />
      )}
      {(deadlinePrev || deadlineChangedBy) && (
        <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5">
          {deadlinePrev && (
            <p>
              <span className="font-medium">Previous date:</span>{" "}
              <span className="font-semibold">{formatDate(deadlinePrev)}</span>
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
      {deadlineHistory.length > 1 && (
        <div className="rounded-md border bg-muted/20">
          {readOnly ? (
            // View-only: the toggle would be inert (unclickable), so render
            // the history expanded with a static, non-interactive header.
            <div className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
              <span>
                Deadline History{" "}
                <span className="text-muted-foreground/70">
                  ({deadlineHistory.length})
                </span>
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDeadlineHistory((p) => !p)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>
                Deadline History{" "}
                <span className="text-muted-foreground/70">
                  ({deadlineHistory.length})
                </span>
              </span>
              <span className="text-[10px]">
                {showDeadlineHistory ? "▾ Hide" : "▸ Show"}
              </span>
            </button>
          )}
          {(readOnly || showDeadlineHistory) && (
            <div
              className={cn(
                "pr-1 px-3 pb-2 space-y-1.5",
                // When inert (read-only) a nested scrollbox can't be wheel-
                // scrolled reliably, so let it flow and the outer modal body
                // scroll (non-inert) handle it.
                !readOnly && "max-h-56 overflow-y-auto",
              )}
            >
              {deadlineHistory.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 text-[11px] border-t border-border/40 pt-1.5 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold tabular-nums">
                      {formatDate(h.deadline)}
                    </span>
                    {h.set_by && (
                      <span className="text-muted-foreground truncate">
                        by {h.set_by}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {new Date(h.set_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
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
        <CascadeCheckboxes
          available={availableCascadeTypes}
          excludeType="MR"
          selected={cascadeReqTargets}
          onToggle={(t) =>
            setCascadeReqTargets((prev) => {
              const next = new Set(prev);
              if (next.has(t)) next.delete(t);
              else next.add(t);
              return next;
            })
          }
        />
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
        flatten={readOnly}
        currentUserName={userName}
        onDelete={handleDeleteNote}
        onEdit={handleEditNote}
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
  readOnly,
  onClose,
  phdRowId,
  initialNotes,
  initialDeadline,
  initialRequirements,
  linkedHearingId,
  currentRecordType,
  onPhdPatch,
  onCascadeApplied,
}: PhdInternalModeProps) {
  const [notes, setNotes] = useState<PostHrgNote[]>(() =>
    parseNotes(initialNotes),
  );
  const [hearingNotes, setHearingNotes] = useState<PostHrgNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Deadline + Requirements (per-PHD-row, independent of hearings.post_hrg_*)
  const [deadline, setDeadline] = useState<string>(initialDeadline ?? "");
  const [requirements, setRequirements] = useState<string>(
    initialRequirements ?? "",
  );
  const [isEditingReq, setIsEditingReq] = useState<boolean>(
    !initialRequirements,
  );
  const [hasSavedReq, setHasSavedReq] = useState<boolean>(!!initialRequirements);
  const [deadlineHistory, setDeadlineHistory] = useState<
    { deadline: string; set_at: string; set_by: string | null }[]
  >([]);
  const [showDeadlineHistory, setShowDeadlineHistory] = useState(false);

  // Cascade UI (only meaningful when a linked hearing exists).
  const [availableCascadeTypes, setAvailableCascadeTypes] = useState<{
    MR: boolean;
    POST_HRG: boolean;
    REP: boolean;
  } | null>(null);
  const [cascadeDeadlineTargets, setCascadeDeadlineTargets] = useState<
    Set<"MR" | "POST_HRG" | "REP">
  >(new Set());
  const [cascadeReqTargets, setCascadeReqTargets] = useState<
    Set<"MR" | "POST_HRG" | "REP">
  >(new Set());
  const isEditingReqRef = useRef(isEditingReq);
  useEffect(() => {
    isEditingReqRef.current = isEditingReq;
  }, [isEditingReq]);
  const savingRef = useRef(saving);
  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  // Tracks user-edited but not-yet-saved deadline state (see hearing-mode
  // for rationale). Wraps setDeadline for user input; cleared on save/clear.
  const deadlineDirtyRef = useRef(false);
  const handleDeadlineUserChange = (v: string) => {
    deadlineDirtyRef.current = true;
    setDeadline(v);
  };

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        const { fetchPostHrgDevNotes, fetchPhdDeadlineHistory } = await import(
          "@/app/(dashboard)/post-hrg-development/actions"
        );
        const [raw, history] = await Promise.all([
          fetchPostHrgDevNotes(phdRowId, "details"),
          fetchPhdDeadlineHistory(phdRowId),
        ]);
        if (active) {
          setNotes(parseNotes(raw));
          setDeadlineHistory(history);
        }
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

  // Poll deadline + requirements so concurrent edits from another user
  // surface within the 8s window. Skip while saving to avoid clobbering
  // the local draft mid-keystroke.
  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active || savingRef.current) return;
      try {
        const { fetchPostHrgDevDeadlineAndRequirements } = await import(
          "@/app/(dashboard)/post-hrg-development/actions"
        );
        const data = await fetchPostHrgDevDeadlineAndRequirements(phdRowId);
        if (!active) return;
        if (!deadlineDirtyRef.current && data.deadline != null) {
          setDeadline(data.deadline);
        }
        if (!isEditingReqRef.current) {
          setRequirements(data.requirements ?? "");
          setHasSavedReq(!!data.requirements);
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
  const canEditReq = ROLES_CAN_EDIT_REQUIREMENTS.includes(userRole);
  const canEditDeadline = ROLES_CAN_EDIT_DEADLINE.includes(userRole);

  // Fetch which record types exist for the linked hearing so the modal can
  // offer "Also apply to" cascade checkboxes. No-op for orphan PHD rows.
  useEffect(() => {
    if (!linkedHearingId) {
      setAvailableCascadeTypes(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const { fetchPhdRelatedRecordTypes } = await import(
          "@/app/(dashboard)/post-hrg-development/actions"
        );
        const data = await fetchPhdRelatedRecordTypes(linkedHearingId);
        if (active) setAvailableCascadeTypes(data);
      } catch {
        /* ignore — checkboxes stay hidden */
      }
    })();
    return () => {
      active = false;
    };
  }, [linkedHearingId]);

  const runCascade = async (
    field: "deadline" | "requirements",
    value: string | null,
    targets: Set<"MR" | "POST_HRG" | "REP">,
  ) => {
    if (!linkedHearingId || targets.size === 0) return;
    try {
      const { cascadePhdField } = await import(
        "@/app/(dashboard)/post-hrg-development/actions"
      );
      const targetList = Array.from(targets);
      await cascadePhdField(linkedHearingId, field, value, targetList);
      onCascadeApplied?.({
        hearingId: linkedHearingId,
        field,
        value,
        targets: targetList,
      });
    } catch {
      /* best-effort — primary already saved */
    }
  };

  const handleUpdateDeadline = async () => {
    setSaving(true);
    try {
      const { updatePostHrgDevField } = await import(
        "@/app/(dashboard)/post-hrg-development/actions"
      );
      const next = deadline || null;
      await updatePostHrgDevField(phdRowId, "deadline", next);
      onPhdPatch({ deadline: next });
      deadlineDirtyRef.current = false;
      await runCascade("deadline", next, cascadeDeadlineTargets);
      setCascadeDeadlineTargets(new Set());
    } finally {
      setSaving(false);
    }
  };

  const handleClearDeadline = async () => {
    setSaving(true);
    try {
      const { updatePostHrgDevField } = await import(
        "@/app/(dashboard)/post-hrg-development/actions"
      );
      await updatePostHrgDevField(phdRowId, "deadline", null);
      setDeadline("");
      onPhdPatch({ deadline: null });
      deadlineDirtyRef.current = false;
      await runCascade("deadline", null, cascadeDeadlineTargets);
      setCascadeDeadlineTargets(new Set());
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRequirements = async () => {
    if (!canEditReq) return;
    setSaving(true);
    try {
      const { updatePostHrgDevField } = await import(
        "@/app/(dashboard)/post-hrg-development/actions"
      );
      const next = requirements.trim() || null;
      await updatePostHrgDevField(phdRowId, "requirements", next);
      setIsEditingReq(false);
      setHasSavedReq(!!next);
      onPhdPatch({ requirements: next });
      await runCascade("requirements", next, cascadeReqTargets);
      setCascadeReqTargets(new Set());
    } finally {
      setSaving(false);
    }
  };

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

  // "Previous date" / "Changed by" indicator — derived from the per-row
  // deadline history (no _prev/_changed_by columns on post_hrg_development,
  // unlike hearings). History is sorted newest-first: [0] is the latest
  // change, [1] the one before it. Only meaningful once an actual change
  // exists on top of the seeded baseline (length > 1), matching MR mode.
  const hasDeadlineChange = deadlineHistory.length > 1;
  const deadlinePrev = hasDeadlineChange ? deadlineHistory[1].deadline : "";
  const deadlineChangedBy = hasDeadlineChange
    ? (deadlineHistory[0].set_by ?? "")
    : "";

  return (
    <ModalShell
      claimant={claimant}
      hearingDateText={hearingDateText}
      assignedRep={assignedRep}
      onClose={onClose}
      readOnly={readOnly}
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
      {/* Deadline (per-PHD-row) */}
      <DeadlineRow
        deadline={deadline}
        onChange={handleDeadlineUserChange}
        onUpdate={handleUpdateDeadline}
        onClear={handleClearDeadline}
        canEdit={canEditDeadline}
      />
      {canEditDeadline && currentRecordType && (
        <CascadeCheckboxes
          available={availableCascadeTypes}
          excludeType={currentRecordType}
          selected={cascadeDeadlineTargets}
          onToggle={(t) =>
            setCascadeDeadlineTargets((prev) => {
              const next = new Set(prev);
              if (next.has(t)) next.delete(t);
              else next.add(t);
              return next;
            })
          }
        />
      )}
      {(deadlinePrev || deadlineChangedBy) && (
        <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5">
          {deadlinePrev && (
            <p>
              <span className="font-medium">Previous date:</span>{" "}
              <span className="font-semibold">{formatDate(deadlinePrev)}</span>
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
      {deadlineHistory.length > 1 && (
        <div className="rounded-md border bg-muted/20">
          {readOnly ? (
            // View-only: the toggle would be inert (unclickable), so render
            // the history expanded with a static, non-interactive header.
            <div className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
              <span>
                Deadline History{" "}
                <span className="text-muted-foreground/70">
                  ({deadlineHistory.length})
                </span>
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDeadlineHistory((p) => !p)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>
                Deadline History{" "}
                <span className="text-muted-foreground/70">
                  ({deadlineHistory.length})
                </span>
              </span>
              <span className="text-[10px]">
                {showDeadlineHistory ? "▾ Hide" : "▸ Show"}
              </span>
            </button>
          )}
          {(readOnly || showDeadlineHistory) && (
            <div
              className={cn(
                "pr-1 px-3 pb-2 space-y-1.5",
                !readOnly && "max-h-56 overflow-y-auto",
              )}
            >
              {deadlineHistory.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 text-[11px] border-t border-border/40 pt-1.5 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold tabular-nums">
                      {formatDate(h.deadline)}
                    </span>
                    {h.set_by && (
                      <span className="text-muted-foreground truncate">
                        by {h.set_by}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {new Date(h.set_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Requirements (per-PHD-row) */}
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
        {currentRecordType && (
          <CascadeCheckboxes
            available={availableCascadeTypes}
            excludeType={currentRecordType}
            selected={cascadeReqTargets}
            onToggle={(t) =>
              setCascadeReqTargets((prev) => {
                const next = new Set(prev);
                if (next.has(t)) next.delete(t);
                else next.add(t);
                return next;
              })
            }
          />
        )}
      </div>

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
        flatten={readOnly}
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
            <div
              className={cn(
                "pr-1 space-y-1.5",
                !readOnly && "max-h-56 overflow-y-auto",
              )}
            >
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
  readOnly,
  children,
}: {
  claimant: string;
  hearingDateText?: string | null;
  assignedRep?: string | null;
  onClose: () => void;
  banner?: React.ReactNode;
  readOnly?: boolean;
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
          {readOnly && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 px-3 py-2">
              <span className="text-slate-500 text-sm">🔒</span>
              <p className="text-[11px] text-slate-700 dark:text-slate-300">
                This record is closed/completed and is view-only. Reopen it from
                the Completed / Records Closed list to make changes.
              </p>
            </div>
          )}
          {banner}
          {/* `inert` keeps the body readable + scrollable but blocks all
              edits/clicks/focus when the record is in a terminal status. */}
          <div inert={readOnly ? true : undefined} className={readOnly ? "opacity-70" : undefined}>
            <div className="space-y-4">{children}</div>
          </div>
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

// Shared cascade-target checkbox row. Rendered below Deadline / Requirements
// in both hearing and phd-internal modes. Shows at most 2 checkboxes (the
// other record types present for the same hearing, minus the current type).
function CascadeCheckboxes({
  available,
  excludeType,
  selected,
  onToggle,
  disabled,
}: {
  available: { MR: boolean; POST_HRG: boolean; REP: boolean } | null;
  excludeType: "MR" | "POST_HRG" | "REP";
  selected: Set<"MR" | "POST_HRG" | "REP">;
  onToggle: (t: "MR" | "POST_HRG" | "REP") => void;
  disabled?: boolean;
}) {
  if (!available) return null;
  const all: ("MR" | "POST_HRG" | "REP")[] = ["MR", "POST_HRG", "REP"];
  const visible = all.filter((t) => t !== excludeType && available[t]);
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      <span className="font-medium">Also apply to:</span>
      {visible.map((t) => {
        const label = t === "POST_HRG" ? "Post HRG" : t;
        return (
          <label
            key={t}
            className="inline-flex items-center gap-1.5 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              checked={selected.has(t)}
              onChange={() => onToggle(t)}
              disabled={disabled}
              className="h-3.5 w-3.5 rounded border-border cursor-pointer accent-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <span className="text-foreground/80">{label}</span>
          </label>
        );
      })}
    </div>
  );
}

// ISO YYYY-MM-DD <-> US MM/DD/YYYY conversion. The native <input type="date">
// follows the OS/browser locale for its visible value, so on non-US locales
// it can render as dd/mm/yyyy. We force US display by swapping in a text
// input and overlaying a hidden native picker (for date-picking UX).
// Tolerant of the value arriving as a Date (Postgres `date` columns come
// back as JS Date unless cast `::text`), an ISO datetime string, a plain
// `YYYY-MM-DD` string, or null/undefined. Anything unrecognized → "".
function isoToUs(iso: unknown): string {
  if (iso == null) return "";
  let s: string;
  if (iso instanceof Date) {
    if (Number.isNaN(iso.getTime())) return "";
    s = `${iso.getFullYear()}-${String(iso.getMonth() + 1).padStart(2, "0")}-${String(iso.getDate()).padStart(2, "0")}`;
  } else {
    s = String(iso);
  }
  // Prefix match so ISO datetimes ("2025-10-14T00:00:00Z") work too.
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${m[2]}/${m[3]}/${m[1]}`;
}

function usToIso(us: unknown): string | null {
  if (typeof us !== "string") return null;
  const m = us.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  // Reject invalid calendar dates like 02/31/2025 that JS would roll over.
  const roundtrip = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return roundtrip === `${yyyy}-${mm}-${dd}` ? roundtrip : null;
}

function DeadlineRow({
  deadline,
  onChange,
  onUpdate,
  onClear,
  canEdit = true,
}: {
  deadline: string;
  onChange: (v: string) => void;
  onUpdate: () => void;
  onClear: () => void;
  /** When false, the deadline is shown read-only (role-gated). */
  canEdit?: boolean;
}) {
  const [text, setText] = useState<string>(() => isoToUs(deadline));

  // Keep the visible US-formatted text in sync when `deadline` changes from
  // outside (picker selection, poll refresh, clear, etc.) but don't fight
  // the user while they're mid-typing.
  useEffect(() => {
    const fromIso = isoToUs(deadline);
    if (fromIso !== text && usToIso(text) !== deadline) {
      setText(fromIso);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);

  const handleTextChange = (raw: string) => {
    setText(raw);
    if (!raw.trim()) {
      onChange("");
      return;
    }
    const iso = usToIso(raw);
    if (iso) onChange(iso);
  };

  const handlePickerChange = (iso: string) => {
    setText(isoToUs(iso));
    onChange(iso);
  };

  if (!canEdit) {
    return (
      <div className="space-y-1.5">
        <label className="text-xs font-medium">Deadline Date</label>
        <div className="flex items-center gap-2">
          <span className="h-8 inline-flex items-center rounded-lg border bg-muted/40 px-3 text-xs tabular-nums text-foreground">
            {deadline ? formatDate(deadline) : "No deadline set"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium">Deadline Date</label>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            placeholder="MM/DD/YYYY"
            value={text}
            maxLength={10}
            onChange={(e) => handleTextChange(e.target.value)}
            className="h-8 rounded-lg border bg-background pl-3 pr-8 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary w-32 tabular-nums"
          />
          {/* Visible calendar icon — the hidden native date input sits on
              top of this area so clicking the icon opens the OS picker. */}
          <Calendar
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/70"
            aria-hidden="true"
          />
          <input
            type="date"
            value={deadline}
            onChange={(e) => handlePickerChange(e.target.value)}
            aria-label="Open date picker"
            className="absolute inset-y-0 right-0 w-7 opacity-0 cursor-pointer"
          />
        </div>
        <button
          className="h-8 text-xs px-3 rounded-md border hover:bg-muted transition-colors"
          onClick={onUpdate}
        >
          Update
        </button>
        {deadline && (
          <button
            className="h-8 text-xs px-3 rounded-md hover:bg-muted transition-colors text-muted-foreground"
            onClick={() => {
              setText("");
              onClear();
            }}
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
  currentUserName,
  onDelete,
  onEdit,
  flatten,
}: {
  notes: PostHrgNote[];
  canEdit: boolean;
  /**
   * When true, drop the inner fixed-height scrollbox so the list flows and
   * the outer (non-inert) modal body handles scrolling. Used for the
   * read-only / inert view of Completed / Records Closed rows.
   */
  flatten?: boolean;
  /**
   * Current user's display name. Compared against `note.user` to gate the
   * inline-edit button — only the original author sees it. The server
   * enforces this independently.
   */
  currentUserName?: string;
  onDelete: (idx: number) => void;
  /**
   * Optional — if omitted, edit affordance is hidden everywhere (used by
   * call sites that don't want inline editing yet).
   */
  onEdit?: (idx: number, newText: string) => Promise<boolean>;
}) {
  // Index of the note currently in edit mode, or -1 if none. We allow at
  // most one note being edited at a time.
  const [editingIdx, setEditingIdx] = useState(-1);
  const [editDraft, setEditDraft] = useState("");
  const [saving, setSaving] = useState(false);
  // Set of indices whose previous-versions panel is expanded.
  const [expandedHistory, setExpandedHistory] = useState<Set<number>>(
    new Set(),
  );

  const fmt = (d: string) => {
    if (!d) return "";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const toggleHistory = (i: number) => {
    setExpandedHistory((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const startEdit = (i: number, current: string) => {
    setEditingIdx(i);
    setEditDraft(current);
  };
  const cancelEdit = () => {
    setEditingIdx(-1);
    setEditDraft("");
  };
  const saveEdit = async () => {
    if (!onEdit || editingIdx < 0) return;
    setSaving(true);
    try {
      const ok = await onEdit(editingIdx, editDraft);
      if (ok) cancelEdit();
    } finally {
      setSaving(false);
    }
  };

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
        <div
          className={cn(
            "pr-1 space-y-2",
            !flatten && "max-h-72 overflow-y-auto",
          )}
        >
          {notes.map((n, i) => {
            const isEditing = editingIdx === i;
            const isAuthor =
              !!currentUserName &&
              !!n.user &&
              n.user.trim().toLowerCase() ===
                currentUserName.trim().toLowerCase();
            const canEditThis = canEdit && isAuthor && !!onEdit;
            const editCount = n.edits?.length ?? 0;
            const isHistoryOpen = expandedHistory.has(i);
            return (
              <div
                key={i}
                className="rounded-lg border bg-muted/30 p-3 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {n.user || "System"}
                    </span>
                    {n.date && <span>{fmt(n.date)}</span>}
                    {editCount > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleHistory(i)}
                        className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
                        title="Show previous versions"
                      >
                        edited {editCount}× {isHistoryOpen ? "▴" : "▾"}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {canEditThis && !isEditing && (
                      <button
                        onClick={() => startEdit(i, n.note)}
                        className="text-xs text-muted-foreground hover:text-blue-600"
                        title="Edit note"
                      >
                        ✎
                      </button>
                    )}
                    {canEdit && !isEditing && (
                      <button
                        onClick={() => onDelete(i)}
                        className="text-xs text-muted-foreground hover:text-red-600"
                        title="Delete note"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <div className="space-y-1.5">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      autoFocus
                      rows={3}
                      className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={cancelEdit}
                        disabled={saving}
                        className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={saving || !editDraft.trim()}
                        className="rounded bg-blue-600 px-2 py-0.5 text-[11px] text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs whitespace-pre-wrap">{n.note}</p>
                )}
                {editCount > 0 && isHistoryOpen && (
                  <div className="mt-1 space-y-1 rounded border border-dashed border-amber-300 bg-amber-50/50 p-2 dark:border-amber-800 dark:bg-amber-950/20">
                    <p className="text-[9px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
                      Previous versions
                    </p>
                    {n.edits!.map((e, ei) => (
                      <div
                        key={ei}
                        className="border-l-2 border-amber-300 pl-2 dark:border-amber-700"
                      >
                        <p className="text-[9px] text-muted-foreground">
                          {e.at ? fmt(e.at) : "—"}
                        </p>
                        <p className="text-[11px] whitespace-pre-wrap text-foreground/80">
                          {e.prev}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

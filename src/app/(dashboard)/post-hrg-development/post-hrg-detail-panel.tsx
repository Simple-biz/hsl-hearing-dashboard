"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  User,
  FileText,
  Clock,
  ExternalLink,
  CheckSquare,
  AlertTriangle,
  CheckCircle2,
  Circle,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PostHrgDevRow } from "./actions";
import { RepHistoryModal } from "@/components/modals/rep-history-modal";
import { HearingAuditTrailModal } from "@/components/modals/hearing-audit-trail-modal";

// ── Date helpers ──────────────────────────────────────────────────────────────

function fmtDate(d: string | null, includeYear = true) {
  if (!d) return null;
  try {
    return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(includeYear ? { year: "numeric" } : {}),
    });
  } catch {
    return d;
  }
}

function fmtDateTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getHearingDateStyle(dateStr: string | null): {
  label: string;
  cls: string;
  dot: string;
} {
  if (!dateStr)
    return {
      label: "No date",
      cls: "text-muted-foreground",
      dot: "bg-muted-foreground/40",
    };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T12:00:00");
  const diffDays = Math.round(
    (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0)
    return {
      label: "TODAY",
      cls: "text-red-600 font-bold dark:text-red-400",
      dot: "bg-red-500 animate-pulse",
    };
  if (diffDays === 1)
    return {
      label: "Tomorrow",
      cls: "text-yellow-600 font-semibold dark:text-yellow-400",
      dot: "bg-yellow-400",
    };
  if (diffDays > 1 && diffDays <= 7)
    return {
      label: `In ${diffDays} days`,
      cls: "text-amber-600 dark:text-amber-400",
      dot: "bg-amber-400",
    };
  if (diffDays > 7)
    return {
      label: `In ${diffDays} days`,
      cls: "text-emerald-600 dark:text-emerald-400",
      dot: "bg-emerald-500",
    };
  // Past
  return {
    label: `${Math.abs(diffDays)}d ago`,
    cls: "text-blue-600 dark:text-blue-400",
    dot: "bg-blue-400",
  };
}

function getDeadlineStyle(dateStr: string | null, status: string | null) {
  if (!dateStr) return null;
  if (status?.toLowerCase() === "completed") return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T12:00:00");
  const diffDays = Math.round(
    (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays < 0)
    return {
      label: "Overdue",
      cls: "text-red-600 dark:text-red-400",
      badge: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
    };
  if (diffDays === 0)
    return {
      label: "Due today",
      cls: "text-red-600 dark:text-red-400",
      badge: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
    };
  if (diffDays <= 3)
    return {
      label: "Due soon",
      cls: "text-amber-600 dark:text-amber-400",
      badge:
        "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    };
  return null;
}

// ── Status badge ──────────────────────────────────────────────────────────────

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

function StatusPill({
  value,
  map,
}: {
  value: string | null;
  map: Record<string, { bg: string; color: string }>;
}) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  const hex = map[value];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={hex ? { backgroundColor: hex.bg, color: hex.color } : undefined}
    >
      {value}
    </span>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      </div>
      <div className="rounded-lg border bg-card/60 px-3 py-2.5 space-y-2">
        {children}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 min-h-5">
      <span className="text-[11px] text-muted-foreground shrink-0 pt-0.5">
        {label}
      </span>
      <div className="text-right min-w-0">{children}</div>
    </div>
  );
}

function CheckRow({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {checked ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
      ) : (
        <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
      )}
      <span
        className={cn(
          "text-xs",
          checked ? "text-foreground font-medium" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
}

// ── INDICATOR colors ──────────────────────────────────────────────────────────

const INDICATOR_OPTIONS: {
  value: string;
  label: string;
  color: string;
}[] = [
  { value: "green", label: "Need to check / monitor", color: "#39FF14" },
  { value: "yellow", label: "CE's that need response", color: "#FACC15" },
  { value: "blue", label: "Normal CE's", color: "#93C5FD" },
  { value: "gray", label: "Assigned to Charlotte", color: "#9CA3AF" },
  { value: "orange", label: "Assigned to Esther", color: "#FB923C" },
];

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  row: PostHrgDevRow | null;
  onClose: () => void;
}

export function PostHrgDetailPanel({ row, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [showRepHistory, setShowRepHistory] = useState(false);
  const [showAuditTrail, setShowAuditTrail] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (row) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [row]);

  if (!row) return null;

  const hearingStyle = getHearingDateStyle(row.hearing_date);
  const deadlineStyle = getDeadlineStyle(row.deadline, row.status);
  const indicator = INDICATOR_OPTIONS.find((o) => o.value === row.indicator);

  const isWithdrawn =
    row.post_hearing_status?.toLowerCase().includes("withdrawal") ||
    row.post_hearing_status?.toLowerCase().includes("dismissed");

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-full max-w-sm flex flex-col",
          "bg-card border-l border-border shadow-2xl",
          "animate-in slide-in-from-right duration-200",
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "shrink-0 border-b px-5 py-4",
            isWithdrawn ? "bg-red-50 dark:bg-red-950/20" : "bg-muted/30",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/* Claimant name + link */}
              <div className="flex items-center gap-2 flex-wrap">
                {row.claimant_link ? (
                  <a
                    href={row.claimant_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base font-semibold text-blue-600 hover:underline dark:text-blue-400 truncate flex items-center gap-1"
                  >
                    {row.claimant}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <h2 className="text-base font-semibold truncate">
                    {row.claimant}
                  </h2>
                )}
                {indicator && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold shrink-0 text-zinc-800 dark:text-zinc-100"
                    style={{
                      backgroundColor: indicator.color + "50",
                      border: `1px solid ${indicator.color}`,
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: indicator.color }}
                    />
                    {indicator.label}
                  </span>
                )}
              </div>

              {/* Subline */}
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                {row.claim_type && <span>{row.claim_type}</span>}
                {row.ssn_last_4 && (
                  <>
                    {row.claim_type && <span className="text-border">·</span>}
                    <span className="font-mono">···· {row.ssn_last_4}</span>
                  </>
                )}
                {row.chronicle_link && (
                  <>
                    <span className="text-border">·</span>
                    <a
                      href={row.chronicle_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-600 hover:underline dark:text-violet-400 font-medium"
                    >
                      Chronicle ↗
                    </a>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Hearing date banner */}
          {row.hearing_date && (
            <div className="mt-3 flex items-center gap-2">
              <span
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  hearingStyle.dot,
                )}
              />
              <span className="text-xs font-medium text-muted-foreground">
                Hearing:{" "}
                <span className={cn("ml-1", hearingStyle.cls)}>
                  {fmtDate(row.hearing_date)} · {hearingStyle.label}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 space-y-4">
            {/* Status cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border bg-muted/20 px-3 py-2">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1">
                  PH Status
                </p>
                <StatusPill
                  value={row.post_hearing_status}
                  map={PH_STATUS_HEX}
                />
              </div>
              <div className="rounded-lg border bg-muted/20 px-3 py-2">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1">
                  Status
                </p>
                <StatusPill value={row.status} map={STATUS_HEX} />
              </div>
            </div>

            {/* Deadline */}
            {row.deadline && (
              <div
                className={cn(
                  "flex items-center justify-between rounded-lg border px-3 py-2",
                  deadlineStyle
                    ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20"
                    : "bg-muted/20",
                )}
              >
                <div className="flex items-center gap-2">
                  {deadlineStyle ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium">
                    Deadline: {fmtDate(row.deadline)}
                  </span>
                </div>
                {deadlineStyle && (
                  <span
                    className={cn(
                      "text-[10px] font-bold rounded-full px-2 py-0.5",
                      deadlineStyle.badge,
                    )}
                  >
                    {deadlineStyle.label}
                  </span>
                )}
              </div>
            )}

            {/* People */}
            <Section title="People" icon={<User className="h-3.5 w-3.5" />}>
              <InfoRow label="Representative">
                <div className="flex flex-col items-end gap-1">
                  {row.representative_name || row.assigned_rep ? (
                    <span className="text-xs font-medium">
                      {row.representative_name || row.assigned_rep}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                  {row.hearing_id && (
                    <button
                      type="button"
                      onClick={() => setShowRepHistory(true)}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="View representative assignment history for this hearing"
                    >
                      <History className="h-3 w-3" />
                      Rep History
                    </button>
                  )}
                </div>
              </InfoRow>
              <InfoRow label="Responsible">
                {row.person_responsible ? (
                  <span className="text-xs font-medium">
                    {row.person_responsible}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </InfoRow>
            </Section>

            {/* Docs */}
            <Section
              title="Documents"
              icon={<FileText className="h-3.5 w-3.5" />}
            >
              <InfoRow label="Docs Needed">
                <span className="text-xs font-medium">
                  {row.type_of_docs_needed || (
                    <span className="text-muted-foreground">—</span>
                  )}
                </span>
              </InfoRow>
              <div className="pt-1 space-y-1.5">
                <CheckRow
                  label="EM Sent / Task Created"
                  checked={row.em_sent_task_created}
                />
                <CheckRow
                  label="EXT Letter Sent"
                  checked={row.ext_letter_sent}
                />
              </div>
            </Section>

            {/* Details */}
            {row.details && (
              <Section
                title="Details"
                icon={<FileText className="h-3.5 w-3.5" />}
              >
                <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                  {row.details}
                </p>
              </Section>
            )}

            {/* Remarks */}
            {row.remarks && (
              <Section
                title="Remarks"
                icon={<FileText className="h-3.5 w-3.5" />}
              >
                <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                  {row.remarks}
                </p>
              </Section>
            )}

            {/* Post HRG */}
            {(row.post_hrg_deadline || row.post_hrg_notes) && (
              <Section
                title="Post HRG Review"
                icon={<CheckSquare className="h-3.5 w-3.5" />}
              >
                {row.post_hrg_deadline && (
                  <InfoRow label="Deadline">
                    <span className="text-xs font-medium tabular-nums">
                      {fmtDate(row.post_hrg_deadline)}
                    </span>
                  </InfoRow>
                )}
                {row.post_hrg_notes &&
                  (() => {
                    try {
                      const notes = JSON.parse(row.post_hrg_notes);
                      if (Array.isArray(notes) && notes.length > 0) {
                        return (
                          <div className="space-y-1.5 pt-1">
                            {notes.slice(0, 3).map((n, i) => (
                              <div
                                key={i}
                                className="rounded-md bg-muted/50 px-2.5 py-1.5"
                              >
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-[10px] font-semibold text-foreground">
                                    {n.user || "Unknown"}
                                  </span>
                                  {n.date && (
                                    <span className="text-[9px] text-muted-foreground">
                                      {fmtDateTime(n.date)}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-snug whitespace-pre-wrap">
                                  {n.note}
                                </p>
                              </div>
                            ))}
                            {notes.length > 3 && (
                              <p className="text-[10px] text-muted-foreground text-center">
                                +{notes.length - 3} more notes
                              </p>
                            )}
                          </div>
                        );
                      }
                    } catch {
                      /* */
                    }
                    return null;
                  })()}
              </Section>
            )}

            {/* Timeline */}
            <Section
              title="Record Info"
              icon={<Clock className="h-3.5 w-3.5" />}
            >
              <InfoRow label="Created">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fmtDateTime(row.created_at)}
                </span>
              </InfoRow>
              <InfoRow label="Updated">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fmtDateTime(row.updated_at)}
                </span>
              </InfoRow>
              {row.hearing_id && (
                <InfoRow label="Hearing ID">
                  <span className="text-xs font-mono text-muted-foreground">
                    #{row.hearing_id}
                  </span>
                </InfoRow>
              )}
            </Section>
          </div>
        </div>

        {/* Audit Trail — only when the PHD row links to a hearing (the
            audit trail is keyed by hearing_id). Rep History lives up in the
            People section, below the rep name. */}
        {row.hearing_id && (
          <div className="shrink-0 border-t bg-muted/10 px-5 py-2.5">
            <button
              type="button"
              onClick={() => setShowAuditTrail(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="View the full activity history for this hearing"
            >
              <History className="h-3 w-3" />
              Audit Log
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 border-t bg-muted/20 px-5 py-2.5 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            Press{" "}
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[9px]">
              Esc
            </kbd>{" "}
            to close
          </p>
          {row.claimant_link && (
            <a
              href={row.claimant_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline dark:text-blue-400"
            >
              Open case <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {showRepHistory && row.hearing_id && (
        <RepHistoryModal
          hearingId={row.hearing_id}
          claimant={row.claimant}
          onClose={() => setShowRepHistory(false)}
        />
      )}
      {showAuditTrail && row.hearing_id && (
        <HearingAuditTrailModal
          hearingId={row.hearing_id}
          claimant={row.claimant}
          onClose={() => setShowAuditTrail(false)}
        />
      )}
    </>,
    document.body,
  );
}

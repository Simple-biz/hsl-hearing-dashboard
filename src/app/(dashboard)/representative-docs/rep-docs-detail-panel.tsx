"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ExternalLink,
  Calendar,
  User,
  FileText,
  CheckSquare,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RepDocsRow, RepDocsAssigneeOption } from "./actions";

// ── Reuse the same date formatter ──
function formatDate(iso: string | null) {
  if (!iso) return null;
  const input = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  const d = new Date(input);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_STYLES: Record<string, string> = {
  "not started":
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  incomplete:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  complete:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  withdrawn: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  postponed: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
  favorable:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const CHECKER_STATUS_STYLES: Record<string, string> = {
  "not started":
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  incomplete:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  complete:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const WORKFLOW_STEPS = [
  { key: "uploaded_noh", atKey: "uploaded_noh_at", label: "Uploaded NOH" },
  {
    key: "sent_repdocs_to_cl",
    atKey: "sent_repdocs_to_cl_at",
    label: "Sent RepDocs to CL",
  },
  {
    key: "repdocs_signed",
    atKey: "repdocs_signed_at",
    label: "RepDocs Signed",
  },
  { key: "contact_ltr", atKey: "contact_ltr_at", label: "Contact Letter" },
  { key: "repdocs_split", atKey: "repdocs_split_at", label: "RepDocs Split" },
  {
    key: "repdocs_uploaded_chronicle",
    atKey: "repdocs_uploaded_chronicle_at",
    label: "Uploaded in Chronicle",
  },
  {
    key: "oho_confirmation",
    atKey: "oho_confirmation_at",
    label: "OHO Confirmation",
  },
] as const;

const CHECKER_STEPS = [
  { key: "checker_calendar", label: "Calendar" },
  { key: "checker_chronicle_claim", label: "Chronicle Claim" },
  { key: "checker_noh", label: "NOH" },
  { key: "checker_contact_ltr", label: "Contact Letter" },
] as const;

interface Props {
  row: RepDocsRow | null;
  assignees: RepDocsAssigneeOption[];
  ohoAssignees: RepDocsAssigneeOption[];
  onClose: () => void;
}

export function RepDocsDetailPanel({
  row,
  assignees,
  ohoAssignees,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll while open
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

  const statusKey = (row.overall_status || "not started").toLowerCase();
  const checkerStatusKey = (row.checker_status || "not started").toLowerCase();
  const assignee = assignees.find((a) => a.name === row.assigned_to);
  const ohoAssignee = ohoAssignees.find((a) => a.name === row.oho_assigned_to);

  const completedSteps = WORKFLOW_STEPS.filter((s) =>
    Boolean(row[s.key]),
  ).length;
  const totalSteps = WORKFLOW_STEPS.length;
  const progressPct = Math.round((completedSteps / totalSteps) * 100);

  const isWithdrawn = statusKey === "withdrawn";

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-full max-w-md flex flex-col",
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
              <div className="flex items-center gap-2 flex-wrap">
                {row.claimant_link ? (
                  <a
                    href={row.claimant_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base font-semibold text-blue-600 hover:underline dark:text-blue-400 truncate"
                  >
                    {row.claimant}
                  </a>
                ) : (
                  <h2 className="text-base font-semibold truncate">
                    {row.claimant}
                  </h2>
                )}
                {row.overall_status && (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold shrink-0",
                      STATUS_STYLES[statusKey] || STATUS_STYLES["not started"],
                    )}
                  >
                    {row.overall_status}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                {row.claim_type && <span>{row.claim_type}</span>}
                {row.ssn_last_4 && (
                  <>
                    <span className="text-border">·</span>
                    <span className="font-mono">···· {row.ssn_last_4}</span>
                  </>
                )}
                {row.hearing_date && (
                  <>
                    <span className="text-border">·</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(row.hearing_date)}
                    </span>
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
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Progress bar */}
          {!isWithdrawn && (
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-center justify-between mb-1.5 text-xs">
                <span className="font-medium text-muted-foreground">
                  Workflow Progress
                </span>
                <span className="tabular-nums font-semibold">
                  {completedSteps}/{totalSteps}
                  <span className="text-muted-foreground font-normal ml-1">
                    steps
                  </span>
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    progressPct === 100 ? "bg-emerald-500" : "bg-blue-500",
                  )}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Info cards */}
          <div className="px-5 py-3 space-y-4">
            {/* People */}
            <Section title="People" icon={<User className="h-3.5 w-3.5" />}>
              <InfoRow label="Representative">
                {row.representative_name ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold",
                      row.rep_type === "in-house" ||
                        row.rep_type === "internal_advocates"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
                    )}
                  >
                    {row.rep_type === "in-house" ||
                    row.rep_type === "internal_advocates"
                      ? "🏠"
                      : "📋"}{" "}
                    {row.representative_name}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </InfoRow>
              <InfoRow label="Assigned To">
                {row.assigned_to ? (
                  <span
                    className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold"
                    style={
                      assignee?.bg_color
                        ? {
                            backgroundColor: assignee.bg_color,
                            color: "#fff",
                          }
                        : undefined
                    }
                  >
                    {row.assigned_to}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    Not assigned
                  </span>
                )}
              </InfoRow>
              {row.oho_assigned_to && (
                <InfoRow label="OHO Assignee">
                  <span
                    className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold"
                    style={
                      ohoAssignee?.bg_color
                        ? {
                            backgroundColor: ohoAssignee.bg_color,
                            color: "#fff",
                          }
                        : undefined
                    }
                  >
                    {row.oho_assigned_to}
                  </span>
                </InfoRow>
              )}
            </Section>

            {/* Links */}
            {(row.claimant_link || row.chronicle_link) && (
              <Section
                title="Links"
                icon={<ExternalLink className="h-3.5 w-3.5" />}
              >
                {row.claimant_link && (
                  <InfoRow label="Claimant">
                    <a
                      href={row.claimant_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Open link <ExternalLink className="h-3 w-3" />
                    </a>
                  </InfoRow>
                )}
                {row.chronicle_link && (
                  <InfoRow label="Chronicle">
                    <a
                      href={row.chronicle_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-violet-600 hover:underline dark:text-violet-400"
                    >
                      Open link <ExternalLink className="h-3 w-3" />
                    </a>
                  </InfoRow>
                )}
              </Section>
            )}

            {/* Workflow steps */}
            <Section
              title="Workflow Steps"
              icon={<FileText className="h-3.5 w-3.5" />}
            >
              <div className="space-y-1">
                {WORKFLOW_STEPS.map((step) => {
                  const done = Boolean(row[step.key]);
                  const ts = row[step.atKey] as string | null;
                  return (
                    <div
                      key={step.key}
                      className="flex items-center gap-2.5 py-1"
                    >
                      <div
                        className={cn(
                          "h-4 w-4 rounded-full shrink-0 flex items-center justify-center",
                          done
                            ? "bg-emerald-500"
                            : "border-2 border-muted-foreground/30",
                        )}
                      >
                        {done && (
                          <svg
                            className="h-2.5 w-2.5 text-white"
                            viewBox="0 0 10 10"
                            fill="none"
                          >
                            <path
                              d="M2 5l2.5 2.5L8 3"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                      <span
                        className={cn(
                          "flex-1 text-xs",
                          done
                            ? "text-foreground font-medium"
                            : "text-muted-foreground",
                        )}
                      >
                        {step.label}
                      </span>
                      {ts && (
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                          {formatDateTime(ts)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* Checker */}
            <Section
              title="Checker"
              icon={<CheckSquare className="h-3.5 w-3.5" />}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-muted-foreground">Status:</span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold",
                    CHECKER_STATUS_STYLES[checkerStatusKey] ||
                      CHECKER_STATUS_STYLES["not started"],
                  )}
                >
                  {row.checker_status || "Not Started"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {CHECKER_STEPS.map((step) => {
                  const done = Boolean(row[step.key]);
                  return (
                    <div
                      key={step.key}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs",
                        done
                          ? "bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300"
                          : "bg-muted/50 text-muted-foreground",
                      )}
                    >
                      <div
                        className={cn(
                          "h-3 w-3 rounded-full shrink-0 flex items-center justify-center",
                          done
                            ? "bg-blue-500"
                            : "border border-muted-foreground/30",
                        )}
                      >
                        {done && (
                          <svg
                            className="h-2 w-2 text-white"
                            viewBox="0 0 10 10"
                            fill="none"
                          >
                            <path
                              d="M2 5l2.5 2.5L8 3"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                      {step.label}
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* Timeline */}
            <Section title="Timeline" icon={<Clock className="h-3.5 w-3.5" />}>
              <div className="space-y-1">
                {WORKFLOW_STEPS.filter((s) => row[s.atKey])
                  .sort((a, b) => {
                    const ta = new Date(row[a.atKey] as string).getTime();
                    const tb = new Date(row[b.atKey] as string).getTime();
                    return tb - ta;
                  })
                  .map((step) => (
                    <div
                      key={step.key}
                      className="flex items-center justify-between py-0.5 text-xs"
                    >
                      <span className="text-muted-foreground">
                        {step.label}
                      </span>
                      <span className="tabular-nums text-foreground">
                        {formatDateTime(row[step.atKey] as string)}
                      </span>
                    </div>
                  ))}
                {!WORKFLOW_STEPS.some((s) => row[s.atKey]) && (
                  <p className="text-xs text-muted-foreground">
                    No activity yet.
                  </p>
                )}
              </div>
            </Section>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t bg-muted/20 px-5 py-3">
          <p className="text-[10px] text-muted-foreground">
            Press{" "}
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[9px]">
              Esc
            </kbd>{" "}
            to close
          </p>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ── Small helpers ──
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
      <div className="rounded-lg border bg-card/50 px-3 py-2.5 space-y-1.5">
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
    <div className="flex items-center justify-between gap-2 min-h-6">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

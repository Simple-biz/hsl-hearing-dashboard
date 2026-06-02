"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  User,
  FileText,
  Clock,
  ExternalLink,
  CheckCircle2,
  Circle,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Hearing } from "./types";
import { RepHistoryModal } from "@/components/modals/rep-history-modal";
import { HearingAuditTrailModal } from "@/components/modals/hearing-audit-trail-modal";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
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
}

function fmtTime(t: string | null): string {
  if (!t) return "—";
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ampm}`;
}

function teamHex(color: string | null): string {
  if (!color) return "#e5e7eb";
  return color.startsWith("#") ? color : `#${color}`;
}

function isLightHex(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length !== 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155;
}

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

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  row: Hearing | null;
  onClose: () => void;
}

export function MedicalRecordsDetailPanel({ row, onClose }: Props) {
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
    document.body.style.overflow = row ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [row]);

  if (!row) return null;

  const teamColor = teamHex(row.mr_team_color);
  const teamText = row.mr_team_id
    ? isLightHex(teamColor)
      ? "#1f2937"
      : "#fff"
    : "#374151";

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
        <div className="shrink-0 border-b bg-muted/30 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
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
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {fmtDate(row.hearing_date)} • {fmtTime(row.converted_time_est)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          {/* People */}
          <Section title="People" icon={<User className="h-3.5 w-3.5" />}>
            <InfoRow label="Representative">
              <div className="flex flex-col items-end gap-1">
                {row.rep_name ? (
                  <span className="text-xs font-medium">{row.rep_name}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
                <button
                  type="button"
                  onClick={() => setShowRepHistory(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="View representative assignment history for this hearing"
                >
                  <History className="h-3 w-3" />
                  Rep History
                </button>
              </div>
            </InfoRow>
            <InfoRow label="MR Team">
              {row.mr_team_name ? (
                <span
                  className="inline-block text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{ backgroundColor: teamColor, color: teamText }}
                >
                  {row.mr_team_name}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </InfoRow>
          </Section>

          {/* Medical Records */}
          <Section
            title="Medical Records"
            icon={<FileText className="h-3.5 w-3.5" />}
          >
            <InfoRow label="MR Status">
              <span className="text-xs font-medium">
                {row.medical_record_status || (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>
            </InfoRow>
            <InfoRow label="Decision">
              <span className="text-xs font-medium">
                {row.hearing_decision_status || (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>
            </InfoRow>
            <InfoRow label="Manner of Appearance">
              <span className="text-xs font-medium">
                {row.manner_of_appearance || (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>
            </InfoRow>
            <InfoRow label="MR Link">
              {row.medical_record_link ? (
                <a
                  href={row.medical_record_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400 inline-flex items-center gap-1"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </InfoRow>
          </Section>

          {/* Status flags */}
          <Section title="Status" icon={<Clock className="h-3.5 w-3.5" />}>
            <CheckRow label="Task Assigned" checked={row.task_assigned} />
            <CheckRow label="5-Day Notice" checked={row.five_day_notice} />
            <CheckRow label="Credited" checked={row.credited === true} />
            <CheckRow
              label="Post HRG Review"
              checked={!!row.post_hrg_review}
            />
            {row.post_hrg_deadline && (
              <InfoRow label="Post HRG Deadline">
                <span className="text-xs font-medium tabular-nums">
                  {fmtDate(row.post_hrg_deadline)}
                </span>
              </InfoRow>
            )}
          </Section>
        </div>

        {/* Audit Trail */}
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

      {showRepHistory && (
        <RepHistoryModal
          hearingId={row.id}
          claimant={row.claimant}
          onClose={() => setShowRepHistory(false)}
        />
      )}
      {showAuditTrail && (
        <HearingAuditTrailModal
          hearingId={row.id}
          claimant={row.claimant}
          onClose={() => setShowAuditTrail(false)}
        />
      )}
    </>,
    document.body,
  );
}

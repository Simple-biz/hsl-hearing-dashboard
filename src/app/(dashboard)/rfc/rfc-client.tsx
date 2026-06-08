"use client";

import { useState, useEffect, useTransition, useCallback, useRef } from "react";
import { AppHeader } from "@/components/layout/app-header";
import {
  Download,
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
  ClipboardList,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

import {
  getRfcEntries,
  addRfcEntry,
  updateRfcField,
  deleteRfcEntry,
  getRfcActivityLog,
} from "./action";
import type {
  RfcPageData,
  RfcEntry,
  RfcFilters,
  RfcStats,
  RfcActivityLogEntry,
} from "./action";
import { RfcCommentModal } from "@/components/modals";

// ─── Filter constants ─────────────────────────────────────────────────────────
// Static Month options (Jan–Dec). Shared by both filter bars in this file.
const MONTH_OPTIONS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Derive distinct 4-digit years from the existing `availableMonths` prop
 *  (each value is "YYYY-MM"). Descending so newest year sits at the top. */
function deriveAvailableYears(
  availableMonths: ReadonlyArray<{ val: string }>,
): string[] {
  return Array.from(
    new Set(
      availableMonths
        .map((m) => m.val.slice(0, 4))
        .filter((y) => /^\d{4}$/.test(y)),
    ),
  ).sort((a, b) => b.localeCompare(a));
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

function colorStyle(bg: string | null | undefined): React.CSSProperties {
  if (!bg) return {};
  return { backgroundColor: bg, color: isLight(bg) ? "#1f2937" : "#ffffff" };
}

function teamHex(color: string | null | undefined): string {
  const MAP: Record<string, string> = {
    blue: "#3b82f6",
    orange: "#f97316",
    green: "#22c55e",
    yellow: "#eab308",
    purple: "#a855f7",
    red: "#ef4444",
  };
  if (!color) return "#9ca3af";
  return MAP[color] ?? color;
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

// Comments come from the DB either as plain text or as a JSON array of
// `{ author, content }` entries (older notes format). Both shapes are
// flattened into a single readable string here.
type CommentNote = { author?: string; content?: string };

function flattenComments(raw: string | null): string {
  if (!raw) return "";
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return (parsed as CommentNote[])
        .map((n) => `[${n.author ?? "Unknown"}] ${n.content ?? ""}`)
        .join(" | ");
    }
  } catch {
    /* plain text fallback */
  }
  return raw;
}

function exportRfcCsv(entries: RfcEntry[]) {
  const headers = [
    "ID",
    "Date",
    "MR Team",
    "Hearing Date",
    "Client Name",
    "Doc Type",
    "Provider",
    "Date Signed",
    "MyCase Link",
    "Method",
    "Date Received",
    "Filed to OHO",
    "Approved by TL",
    "Comments",
  ];
  const rows = entries.map((e) => [
    e.id,
    e.entry_date ?? "",
    e.team_name ?? "",
    e.hearing_date ?? "",
    e.client_name,
    e.document_type ?? "",
    e.provider_name ?? "",
    e.date_signed ?? "",
    e.mycase_link ?? "",
    e.method_received ?? "",
    e.date_received ?? "",
    e.filed_to_oho ? "Yes" : "No",
    e.approved_by_tl ? "Yes" : "No",
    flattenComments(e.comments),
  ]);
  const csv = [headers, ...rows]
    .map((r) =>
      r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rfc-export-${new Date().toISOString().slice(0, 10)}.csv`;
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
      <div className="pointer-events-none absolute -right-2 -bottom-3 w-14 h-14 rounded-full bg-white/10" />
      <p className="relative text-[10px] font-semibold uppercase tracking-widest opacity-80">
        {label}
      </p>
      <p className="relative text-2xl font-bold tabular-nums leading-none">
        {value}
      </p>
    </div>
  );
}

// ─── Add Entry Modal ──────────────────────────────────────────────────────────

function AddEntryModal({
  data,
  onClose,
  onSaved,
}: {
  data: RfcPageData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    mr_team_id: "",
    hearing_date: "",
    client_name: "",
    document_type: "",
    provider_name: "",
    date_signed: "",
    mycase_link: "",
    method_received: "",
    date_received: "",
    filed_to_oho: false,
    approved_by_tl: false,
    comments: "",
  });

  const set = (k: string, v: string | boolean) =>
    setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.client_name.trim()) {
      setError("Client name is required.");
      return;
    }
    setSaving(true);
    const res = await addRfcEntry({
      ...form,
      mr_team_id: form.mr_team_id ? Number(form.mr_team_id) : null,
      entry_date: form.entry_date || null,
      hearing_date: form.hearing_date || null,
      date_signed: form.date_signed || null,
      date_received: form.date_received || null,
    });
    setSaving(false);
    if (res.success) {
      onSaved();
      onClose();
    } else setError(res.message ?? "Save failed");
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary";
  const labelCls =
    "text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col rounded-t-xl sm:rounded-xl border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <h2 className="text-sm font-semibold">➕ Add RFC Entry</h2>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Date</label>
              <input
                type="date"
                className={inputCls}
                value={form.entry_date}
                onChange={(e) => set("entry_date", e.target.value)}
              />
            </div>
            {data.permissions.canAssignTeam && (
              <div>
                <label className={labelCls}>MR Team</label>
                <select
                  className={inputCls}
                  value={form.mr_team_id}
                  onChange={(e) => set("mr_team_id", e.target.value)}
                >
                  <option value="">— Select Team —</option>
                  {data.mrTeams.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.team_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Hearing Date</label>
              <input
                type="date"
                className={inputCls}
                value={form.hearing_date}
                onChange={(e) => set("hearing_date", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>
                Client Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={inputCls}
                value={form.client_name}
                onChange={(e) => set("client_name", e.target.value)}
                placeholder="Last, First"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Type of Document</label>
              <select
                className={inputCls}
                value={form.document_type}
                onChange={(e) => set("document_type", e.target.value)}
              >
                <option value="">— Select Type —</option>
                {data.documentTypes.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Provider Name</label>
              <input
                type="text"
                className={inputCls}
                value={form.provider_name}
                onChange={(e) => set("provider_name", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Date Signed</label>
              <input
                type="date"
                className={inputCls}
                value={form.date_signed}
                onChange={(e) => set("date_signed", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>MyCase Link</label>
              <input
                type="url"
                className={inputCls}
                value={form.mycase_link}
                onChange={(e) => set("mycase_link", e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Method Received</label>
              <select
                className={inputCls}
                value={form.method_received}
                onChange={(e) => set("method_received", e.target.value)}
              >
                <option value="">— Select Method —</option>
                {data.methodOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Date Received</label>
              <input
                type="date"
                className={inputCls}
                value={form.date_received}
                onChange={(e) => set("date_received", e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-8">
            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-emerald-500"
                checked={form.filed_to_oho}
                onChange={(e) => set("filed_to_oho", e.target.checked)}
              />
              Filed to OHO
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-blue-500"
                checked={form.approved_by_tl}
                onChange={(e) => set("approved_by_tl", e.target.checked)}
              />
              Approved by TL
            </label>
          </div>

          <div>
            <label className={labelCls}>Comments</label>
            <textarea
              className={inputCls}
              rows={2}
              value={form.comments}
              onChange={(e) => set("comments", e.target.value)}
              placeholder="Optional notes..."
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3 bg-muted/30 shrink-0">
          <button
            onClick={onClose}
            className="text-xs px-4 py-2 rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-60 flex items-center gap-1.5"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Activity Log Modal ───────────────────────────────────────────────────────

function RfcActivityLogModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<RfcActivityLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / 50));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function fetchLog() {
      setLoading(true);
      const r = await getRfcActivityLog(page);
      if (cancelled) return;
      setEntries(r.entries);
      setTotal(r.total);
      setLoading(false);
    }
    fetchLog();
    return () => {
      cancelled = true;
    };
  }, [open, page]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[80vh] flex flex-col rounded-t-xl sm:rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <h2 className="text-sm font-semibold">📋 RFC Activity Log</h2>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              No activity entries found.
            </p>
          ) : (
            <div className="space-y-1">
              {entries.map((e) => (
                <div
                  key={e.id}
                  className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/30"
                >
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase bg-blue-100 text-blue-700">
                    {e.action.replace(/_/g, " ")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">{e.details}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                      <span>
                        {new Date(e.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      {e.user_name && (
                        <span>
                          by{" "}
                          <span className="font-medium text-foreground">
                            {e.user_name}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t px-5 py-2.5 shrink-0">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
              className="h-7 w-7 flex items-center justify-center rounded border border-border disabled:opacity-40 hover:bg-muted"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 w-7 flex items-center justify-center rounded border border-border disabled:opacity-40 hover:bg-muted"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── RFC Row (inline editing) ─────────────────────────────────────────────────

function RfcRow({
  entry,
  data,
  onUpdate,
  onDelete,
  onComment,
}: {
  entry: RfcEntry;
  data: RfcPageData;
  onUpdate: (id: number, field: string, value: unknown) => void;
  onDelete: (id: number) => void;
  onComment: (entry: RfcEntry) => void;
}) {
  const { permissions: p, documentTypes, methodOptions, mrTeams } = data;
  const docType = documentTypes.find((d) => d.value === entry.document_type);
  const method = methodOptions.find((m) => m.value === entry.method_received);
  const team = mrTeams.find((t) => t.id === entry.mr_team_id);
  const teamColor = entry.team_color
    ? teamHex(entry.team_color)
    : team?.team_color
      ? teamHex(team.team_color)
      : undefined;

  function fmtDate(d: string | null) {
    if (!d) return "—";
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  }

  const gridCols = p.canDelete
    ? "115px 120px 115px 155px 110px 155px 115px 65px 120px 120px 80px 95px 45px"
    : "115px 120px 115px 155px 110px 155px 115px 65px 120px 120px 80px 95px";

  return (
    <div
      className="grid gap-0 border-b border-border/40 hover:bg-muted/30 transition-colors text-[11px] items-center"
      style={{ gridTemplateColumns: gridCols }}
    >
      {/* Entry Date */}
      <div className="px-3 py-1.5 whitespace-nowrap">
        {p.canEdit ? (
          <input
            type="date"
            value={entry.entry_date ?? ""}
            className="text-[10px] border border-border rounded px-1.5 py-0.5 bg-card text-foreground w-full max-w-28"
            onChange={(e) => onUpdate(entry.id, "entry_date", e.target.value)}
          />
        ) : (
          <span className="text-foreground">{fmtDate(entry.entry_date)}</span>
        )}
      </div>

      {/* MR Team */}
      <div className="px-3 py-1.5 whitespace-nowrap text-center">
        {p.canAssignTeam ? (
          <select
            value={entry.mr_team_id ?? ""}
            className="text-[10px] px-1.5 py-1 rounded border-0 cursor-pointer font-medium w-full"
            style={
              teamColor
                ? {
                    backgroundColor: teamColor,
                    color: isLight(teamColor) ? "#1f2937" : "#fff",
                  }
                : { backgroundColor: "#e5e7eb", color: "#374151" }
            }
            onChange={(e) =>
              onUpdate(
                entry.id,
                "mr_team_id",
                e.target.value ? Number(e.target.value) : null,
              )
            }
          >
            <option value="">—</option>
            {mrTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.team_name}
              </option>
            ))}
          </select>
        ) : entry.team_name ? (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={
              teamColor
                ? {
                    backgroundColor: teamColor,
                    color: isLight(teamColor) ? "#1f2937" : "#fff",
                  }
                : {}
            }
          >
            {entry.team_name}
          </span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </div>

      {/* Hearing Date */}
      <div className="px-3 py-1.5 whitespace-nowrap">
        {p.canEdit ? (
          <input
            type="date"
            value={entry.hearing_date ?? ""}
            className="text-[10px] border border-border rounded px-1.5 py-0.5 bg-card text-foreground w-full max-w-28"
            onChange={(e) => onUpdate(entry.id, "hearing_date", e.target.value)}
          />
        ) : (
          <span>{fmtDate(entry.hearing_date)}</span>
        )}
      </div>

      {/* Client Name */}
      <div className="px-3 py-1.5">
        {p.canEdit ? (
          <input
            type="text"
            value={entry.client_name}
            className="text-[10px] border border-border rounded px-1.5 py-0.5 bg-card text-foreground w-full"
            onChange={(e) => onUpdate(entry.id, "client_name", e.target.value)}
          />
        ) : (
          <strong className="text-foreground">{entry.client_name}</strong>
        )}
      </div>

      {/* Doc Type */}
      <div className="px-3 py-1.5 whitespace-nowrap flex items-center justify-center">
        {p.canEdit ? (
          <select
            value={entry.document_type ?? ""}
            className="text-[10px] px-1.5 py-1 rounded border-0 cursor-pointer text-center"
            style={
              docType?.color
                ? colorStyle(docType.color)
                : { backgroundColor: "#f3f4f6", color: "#374151" }
            }
            onChange={(e) =>
              onUpdate(entry.id, "document_type", e.target.value)
            }
          >
            <option value="">—</option>
            {documentTypes.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        ) : entry.document_type ? (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={docType?.color ? colorStyle(docType.color) : {}}
          >
            {entry.document_type}
          </span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </div>

      {/* Provider */}
      <div className="px-3 py-1.5">
        {p.canEdit ? (
          <input
            type="text"
            value={entry.provider_name ?? ""}
            className="text-[10px] border border-border rounded px-1.5 py-0.5 bg-card text-foreground w-full"
            onChange={(e) =>
              onUpdate(entry.id, "provider_name", e.target.value)
            }
          />
        ) : (
          <span className="text-foreground truncate">
            {entry.provider_name ?? "—"}
          </span>
        )}
      </div>

      {/* Date Signed */}
      <div className="px-3 py-1.5 whitespace-nowrap">
        {p.canEdit ? (
          <input
            type="date"
            value={entry.date_signed ?? ""}
            className="text-[10px] border border-border rounded px-1.5 py-0.5 bg-card text-foreground w-full max-w-28"
            onChange={(e) => onUpdate(entry.id, "date_signed", e.target.value)}
          />
        ) : (
          <span>{fmtDate(entry.date_signed)}</span>
        )}
      </div>

      {/* MyCase Link */}
      <div className="px-3 py-1.5 flex items-center justify-center">
        {entry.mycase_link ? (
          <a
            href={entry.mycase_link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded hover:bg-primary/80"
          >
            <ExternalLink size={9} />
            Link
          </a>
        ) : p.canEdit ? (
          <button
            onClick={() => {
              const v = prompt("MyCase link:");
              if (v) onUpdate(entry.id, "mycase_link", v);
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground border border-dashed border-border rounded px-1.5 py-0.5"
          >
            +
          </button>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </div>

      {/* Method Received */}
      <div className="px-3 py-1.5 whitespace-nowrap text-center">
        {p.canEdit ? (
          <select
            value={entry.method_received ?? ""}
            className="text-[10px] px-1.5 py-1 rounded border-0 cursor-pointer w-full"
            style={
              method?.color
                ? colorStyle(method.color)
                : { backgroundColor: "#f3f4f6", color: "#374151" }
            }
            onChange={(e) =>
              onUpdate(entry.id, "method_received", e.target.value)
            }
          >
            <option value="">—</option>
            {methodOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        ) : entry.method_received ? (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={method?.color ? colorStyle(method.color) : {}}
          >
            {entry.method_received}
          </span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </div>

      {/* Date Received */}
      <div className="px-3 py-1.5 whitespace-nowrap">
        {p.canEdit ? (
          <input
            type="date"
            value={entry.date_received ?? ""}
            className="text-[10px] border border-border rounded px-1.5 py-0.5 bg-card text-foreground w-full max-w-28"
            onChange={(e) =>
              onUpdate(entry.id, "date_received", e.target.value)
            }
          />
        ) : (
          <span>{fmtDate(entry.date_received)}</span>
        )}
      </div>

      {/* Filed to OHO */}
      <div className="px-3 py-1.5 flex items-center justify-center">
        {p.canEdit ? (
          <input
            type="checkbox"
            checked={entry.filed_to_oho}
            className="w-4 h-4 cursor-pointer accent-emerald-500"
            onChange={(e) =>
              onUpdate(entry.id, "filed_to_oho", e.target.checked)
            }
          />
        ) : entry.filed_to_oho ? (
          <span className="text-emerald-500 font-bold">✓</span>
        ) : (
          <span className="text-muted-foreground/30">—</span>
        )}
      </div>

      {/* Approved by TL + Comment */}
      <div className="px-2 py-1.5 flex items-center justify-center gap-1">
        {p.canEdit ? (
          <input
            type="checkbox"
            checked={entry.approved_by_tl}
            className="w-4 h-4 cursor-pointer accent-blue-500"
            onChange={(e) =>
              onUpdate(entry.id, "approved_by_tl", e.target.checked)
            }
          />
        ) : entry.approved_by_tl ? (
          <span className="text-blue-500 font-bold">✓</span>
        ) : (
          <span className="text-muted-foreground/30">—</span>
        )}
        <button
          onClick={() => onComment(entry)}
          className={cn(
            "inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded border transition-colors",
            entry.comments
              ? "bg-yellow-50 border-yellow-300 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-300"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
          title="View comments"
        >
          📝
        </button>
      </div>

      {/* Actions */}
      {p.canDelete && (
        <div className="px-3 py-1.5 text-center">
          <button
            onClick={() => {
              if (confirm(`Delete entry for "${entry.client_name}"?`))
                onDelete(entry.id);
            }}
            className="text-red-500 hover:text-red-700 transition-colors p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Mobile Card (replaces table rows on small screens) ──────────────────────

function RfcMobileCard({
  entry,
  data,
  onUpdate,
  onDelete,
  onComment,
}: {
  entry: RfcEntry;
  data: RfcPageData;
  onUpdate: (id: number, field: string, value: unknown) => void;
  onDelete: (id: number) => void;
  onComment: (entry: RfcEntry) => void;
}) {
  const { permissions: p, documentTypes, methodOptions, mrTeams } = data;
  const docType = documentTypes.find((d) => d.value === entry.document_type);
  const method = methodOptions.find((m) => m.value === entry.method_received);
  const team = mrTeams.find((t) => t.id === entry.mr_team_id);
  const teamColor = entry.team_color
    ? teamHex(entry.team_color)
    : team?.team_color
      ? teamHex(team.team_color)
      : undefined;

  function fmtDate(d: string | null) {
    if (!d) return "—";
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  }

  return (
    <div className="border-b border-border/40 px-4 py-3 space-y-2 hover:bg-muted/20 transition-colors">
      {/* Row 1: Client name + doc type badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {p.canEdit ? (
            <input
              type="text"
              value={entry.client_name}
              className="text-xs font-semibold border border-border rounded px-2 py-1 bg-card text-foreground w-full"
              onChange={(e) =>
                onUpdate(entry.id, "client_name", e.target.value)
              }
            />
          ) : (
            <span className="text-xs font-semibold text-foreground">
              {entry.client_name}
            </span>
          )}
        </div>
        {p.canEdit ? (
          <select
            value={entry.document_type ?? ""}
            className="text-[10px] px-1.5 py-1 rounded border-0 cursor-pointer shrink-0"
            style={
              docType?.color
                ? colorStyle(docType.color)
                : { backgroundColor: "#f3f4f6", color: "#374151" }
            }
            onChange={(e) =>
              onUpdate(entry.id, "document_type", e.target.value)
            }
          >
            <option value="">—</option>
            {documentTypes.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        ) : entry.document_type ? (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0"
            style={docType?.color ? colorStyle(docType.color) : {}}
          >
            {entry.document_type}
          </span>
        ) : null}
      </div>

      {/* Row 2: Team + dates */}
      <div className="flex items-center gap-2 flex-wrap">
        {p.canAssignTeam ? (
          <select
            value={entry.mr_team_id ?? ""}
            className="text-[10px] px-1.5 py-1 rounded border-0 cursor-pointer font-medium"
            style={
              teamColor
                ? {
                    backgroundColor: teamColor,
                    color: isLight(teamColor) ? "#1f2937" : "#fff",
                  }
                : { backgroundColor: "#e5e7eb", color: "#374151" }
            }
            onChange={(e) =>
              onUpdate(
                entry.id,
                "mr_team_id",
                e.target.value ? Number(e.target.value) : null,
              )
            }
          >
            <option value="">—</option>
            {mrTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.team_name}
              </option>
            ))}
          </select>
        ) : entry.team_name ? (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={
              teamColor
                ? {
                    backgroundColor: teamColor,
                    color: isLight(teamColor) ? "#1f2937" : "#fff",
                  }
                : {}
            }
          >
            {entry.team_name}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/50">No Team</span>
        )}
        <span className="text-[10px] text-muted-foreground">
          Entry:{" "}
          <span className="text-foreground">{fmtDate(entry.entry_date)}</span>
        </span>
        <span className="text-[10px] text-muted-foreground">
          Hrg:{" "}
          <span className="text-foreground">{fmtDate(entry.hearing_date)}</span>
        </span>
      </div>

      {/* Row 3: Provider + method */}
      <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
        {entry.provider_name && (
          <span className="text-foreground">{entry.provider_name}</span>
        )}
        {p.canEdit ? (
          <select
            value={entry.method_received ?? ""}
            className="text-[10px] px-1.5 py-0.5 rounded border-0 cursor-pointer"
            style={
              method?.color
                ? colorStyle(method.color)
                : { backgroundColor: "#f3f4f6", color: "#374151" }
            }
            onChange={(e) =>
              onUpdate(entry.id, "method_received", e.target.value)
            }
          >
            <option value="">— Method —</option>
            {methodOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        ) : entry.method_received ? (
          <span
            className="px-1.5 py-0.5 rounded font-medium"
            style={method?.color ? colorStyle(method.color) : {}}
          >
            {entry.method_received}
          </span>
        ) : null}
      </div>

      {/* Row 4: Checkboxes + MyCase + Delete */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-1.5 text-[10px] text-foreground cursor-pointer">
          {p.canEdit ? (
            <input
              type="checkbox"
              checked={entry.filed_to_oho}
              className="w-3.5 h-3.5 accent-emerald-500"
              onChange={(e) =>
                onUpdate(entry.id, "filed_to_oho", e.target.checked)
              }
            />
          ) : (
            <span
              className={
                entry.filed_to_oho
                  ? "text-emerald-500 font-bold"
                  : "text-muted-foreground/30"
              }
            >
              {entry.filed_to_oho ? "✓" : "✗"}
            </span>
          )}
          Filed OHO
        </label>
        <label className="flex items-center gap-1.5 text-[10px] text-foreground cursor-pointer">
          {p.canEdit ? (
            <input
              type="checkbox"
              checked={entry.approved_by_tl}
              className="w-3.5 h-3.5 accent-blue-500"
              onChange={(e) =>
                onUpdate(entry.id, "approved_by_tl", e.target.checked)
              }
            />
          ) : (
            <span
              className={
                entry.approved_by_tl
                  ? "text-blue-500 font-bold"
                  : "text-muted-foreground/30"
              }
            >
              {entry.approved_by_tl ? "✓" : "✗"}
            </span>
          )}
          Appr. TL
        </label>
        <button
          onClick={() => onComment(entry)}
          className={cn(
            "inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border transition-colors",
            entry.comments
              ? "bg-yellow-50 border-yellow-300 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-300"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          📝{" "}
          {entry.comments ? (
            <span className="font-semibold">Notes</span>
          ) : (
            <span>+ Add</span>
          )}
        </button>
        {entry.mycase_link ? (
          <a
            href={entry.mycase_link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded hover:bg-primary/80"
          >
            <ExternalLink size={9} />
            MyCase
          </a>
        ) : p.canEdit ? (
          <button
            onClick={() => {
              const v = prompt("MyCase link:");
              if (v) onUpdate(entry.id, "mycase_link", v);
            }}
            className="text-[10px] text-muted-foreground border border-dashed border-border rounded px-1.5 py-0.5"
          >
            + Link
          </button>
        ) : null}
        {p.canDelete && (
          <button
            onClick={() => {
              if (confirm(`Delete entry for "${entry.client_name}"?`))
                onDelete(entry.id);
            }}
            className="ml-auto text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── View Details Modal (fullscreen) ─────────────────────────────────────────

function ViewDetailsModal({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: RfcPageData;
}) {
  const [isPending, startTransition] = useTransition();
  const [entries, setEntries] = useState<RfcEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<RfcFilters>({
    search: "",
    sort_order: "desc",
    status: "",
    month: "",
    year: "",
    hearing_date: "",
    team: "",
    doc_type: "",
    page: 1,
    per_page: 100,
  });
  const [commentEntry, setCommentEntry] = useState<RfcEntry | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((f: RfcFilters) => {
    startTransition(async () => {
      const r = await getRfcEntries(f);
      setEntries(r.entries);
      setTotal(r.total);
      setTotalPages(r.total_pages);
    });
  }, []);

  useEffect(() => {
    if (open) load(filters);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilter(patch: Partial<RfcFilters>) {
    const next = { ...filters, ...patch, page: 1 };
    setFilters(next);
    load(next);
  }

  function handleUpdate(id: number, field: string, value: unknown) {
    updateRfcField(id, field, value as string | number | boolean | null);
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    );
  }

  function handleDelete(id: number) {
    deleteRfcEntry(id).then(() => {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setTotal((t) => t - 1);
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-6 overflow-auto">
      <div className="w-full max-w-425 max-h-[95vh] flex flex-col rounded-xl border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0 rounded-t-xl">
          <h2 className="text-sm font-semibold">
            📋 RFC Documents — Full View
          </h2>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground hover:text-foreground" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2.5 shrink-0">
          <input
            type="text"
            placeholder="🔍 Search client or provider…"
            value={filters.search}
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-muted text-foreground focus:outline-none min-w-45"
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
          <select
            value={filters.sort_order}
            onChange={(e) =>
              applyFilter({ sort_order: e.target.value as "asc" | "desc" })
            }
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
          >
            <option value="desc">🆕 Newest First</option>
            <option value="asc">📜 Oldest First</option>
          </select>
          <select
            value={filters.status}
            onChange={(e) =>
              applyFilter({ status: e.target.value as RfcFilters["status"] })
            }
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
          >
            <option value="">All Status</option>
            <option value="filed">✅ Filed to OHO</option>
            <option value="pending">⏳ Pending</option>
            <option value="approved">✓ Approved by TL</option>
          </select>
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
          <select
            value={filters.year || ""}
            onChange={(e) => applyFilter({ year: e.target.value })}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
          >
            <option value="">All Years</option>
            {deriveAvailableYears(data.availableMonths).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filters.hearing_date || ""}
            onChange={(e) => applyFilter({ hearing_date: e.target.value })}
            aria-label="Filter by hearing date"
            title="Filter to entries with this exact hearing date"
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
          />
          <select
            value={filters.team}
            onChange={(e) => applyFilter({ team: e.target.value })}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
          >
            <option value="">All Teams</option>
            <option value="unassigned">— Unassigned —</option>
            {data.mrTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.team_name}
              </option>
            ))}
          </select>
          <select
            value={filters.doc_type}
            onChange={(e) => applyFilter({ doc_type: e.target.value })}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer"
          >
            <option value="">All Doc Types</option>
            {data.documentTypes.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              applyFilter({
                search: "",
                sort_order: "desc",
                status: "",
                month: "",
                year: "",
                hearing_date: "",
                team: "",
                doc_type: "",
              })
            }
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground"
          >
            Reset
          </button>
          <span className="ml-auto text-xs text-muted-foreground">
            {total.toLocaleString()} entries
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto min-h-0 relative">
          {isPending && (
            <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10">
              <Loader2 size={28} className="animate-spin text-primary" />
            </div>
          )}
          <div className="text-[11px]" style={{ minWidth: "1400px" }}>
            {/* Header */}
            <div
              className="grid gap-0 bg-muted border-b border-border sticky top-0 z-2"
              style={{
                gridTemplateColumns: data.permissions.canDelete
                  ? "115px 120px 115px 155px 110px 155px 115px 65px 120px 120px 80px 95px 45px"
                  : "115px 120px 115px 155px 110px 155px 115px 65px 120px 120px 80px 95px",
              }}
            >
              <div className="px-3 py-2.5 text-center text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap text-foreground">
                Date
              </div>
              <div className="px-3 py-2.5 text-center text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap text-foreground">
                MR Team
              </div>
              <div className="px-3 py-2.5 text-left text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap text-foreground">
                Hearing Date
              </div>
              <div className="px-3 py-2.5 text-center text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap text-foreground">
                Client Name
              </div>
              <div className="px-3 py-2.5 text-center text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap text-foreground">
                Doc Type
              </div>
              <div className="px-3 py-2.5 text-center text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap text-foreground">
                Provider
              </div>
              <div className="px-3 py-2.5 text-left text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap text-foreground">
                Date Signed
              </div>
              <div className="px-3 py-2.5 text-center text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap text-foreground">
                MyCase
              </div>
              <div className="px-3 py-2.5 text-center text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap text-foreground">
                Method
              </div>
              <div className="px-3 py-2.5 text-left text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap text-foreground">
                Date Received
              </div>
              <div className="px-3 py-2.5 text-center text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap text-foreground">
                Filed OHO
              </div>
              <div className="px-3 py-2.5 text-center text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap text-foreground">
                Appr. TL
              </div>
              {data.permissions.canDelete && (
                <div className="px-3 py-2.5 text-center text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap text-foreground">
                  Del
                </div>
              )}
            </div>
            {/* Rows */}
            {entries.length === 0 && !isPending ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No entries found.
              </div>
            ) : (
              entries.map((e) => (
                <RfcRow
                  key={e.id}
                  entry={e}
                  data={data}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onComment={setCommentEntry}
                />
              ))
            )}
          </div>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t px-5 py-2.5 shrink-0 rounded-b-xl bg-muted/20">
          <span className="text-xs text-muted-foreground">
            Page {filters.page} of {totalPages} ({total.toLocaleString()}{" "}
            entries)
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={(filters.page ?? 1) <= 1 || isPending}
              onClick={() => {
                const p = { ...filters, page: (filters.page ?? 1) - 1 };
                setFilters(p);
                load(p);
              }}
              className="h-7 w-7 flex items-center justify-center rounded border border-border disabled:opacity-40 hover:bg-muted"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              disabled={(filters.page ?? 1) >= totalPages || isPending}
              onClick={() => {
                const p = { ...filters, page: (filters.page ?? 1) + 1 };
                setFilters(p);
                load(p);
              }}
              className="h-7 w-7 flex items-center justify-center rounded border border-border disabled:opacity-40 hover:bg-muted"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      {commentEntry && (
        <RfcCommentModal
          entry={commentEntry}
          onClose={() => setCommentEntry(null)}
        />
      )}
    </div>
  );
}

// ─── Main Client Component ────────────────────────────────────────────────────

export function RfcClient(data: RfcPageData) {
  const [isPending, startTransition] = useTransition();

  const [entries, setEntries] = useState<RfcEntry[]>([]);
  const [stats, setStats] = useState<RfcStats>(data.stats);
  const [total, setTotal] = useState(data.stats.total);
  const [totalPages, setTotalPages] = useState(1);

  const [filters, setFilters] = useState<RfcFilters>({
    search: "",
    sort_order: "desc",
    status: "",
    month: "",
    year: "",
    hearing_date: "",
    team: "",
    doc_type: "",
    page: 1,
    per_page: 50,
  });

  const [showAdd, setShowAdd] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showViewDetails, setShowViewDetails] = useState(false);
  const [commentEntry, setCommentEntry] = useState<RfcEntry | null>(null);

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((f: RfcFilters) => {
    startTransition(async () => {
      const r = await getRfcEntries(f);
      setEntries(r.entries);
      setTotal(r.total);
      setTotalPages(r.total_pages);
      setStats(r.stats);
    });
  }, []);

  useEffect(() => {
    load(filters);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilter(patch: Partial<RfcFilters>) {
    const next = { ...filters, ...patch, page: 1 };
    setFilters(next);
    load(next);
  }

  function goPage(p: number) {
    const next = { ...filters, page: p };
    setFilters(next);
    load(next);
  }

  async function handleUpdate(id: number, field: string, value: unknown) {
    await updateRfcField(id, field, value as string | number | boolean | null);
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    );
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this entry?")) return;
    const r = await deleteRfcEntry(id);
    if (r.success) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setTotal((t) => t - 1);
      setStats((s) => ({ ...s, total: s.total - 1 }));
    }
  }

  const perPage = filters.per_page as number;
  const curPage = filters.page ?? 1;
  // const COLS = ["Date", "MR Team", "Hearing Date", "Client Name", "Doc Type", "Provider", "Date Signed", "MyCase", "Method", "Date Received", "Filed OHO", "Appr. TL"];

  return (
    <>
      <AppHeader
        title="RFC Documents"
        subtitle="Medical Records RFC &amp; Document Tracking"
      />

      <div className="max-w-450 mx-auto px-6 py-6 space-y-5">
        {/* ── Back navigation ──────────────────────────────────────────────── */}
        <a
          href="/medical-records"
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-semibold transition-colors w-fit"
        >
          ← Back to MR Pivot
        </a>

        {/* ── Stat Cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total Entries"
            value={stats.total}
            bg="bg-violet-600"
          />
          <StatCard
            label="Filed to OHO"
            value={stats.filed}
            bg="bg-emerald-600"
          />
          <StatCard
            label="Approved by TL"
            value={stats.approved}
            bg="bg-blue-600"
          />
          <StatCard label="Pending" value={stats.pending} bg="bg-amber-500" />
        </div>

        {/* ── Main Card ────────────────────────────────────────────────── */}
        <div
          className="bg-card border border-border rounded-xl overflow-hidden flex flex-col"
          style={{ maxHeight: "calc(100vh - 160px)" }}
        >
          {/* Card Header */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 border-b border-border bg-muted/30 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                📋 RFC Documents
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                ({total})
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
              <button
                onClick={() => setShowViewDetails(true)}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
              >
                🔍 <span className="hidden sm:inline">View Details</span>
                <span className="sm:hidden">Details</span>
              </button>
              {data.permissions.canEdit && (
                <button
                  onClick={() => setShowActivity(true)}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors"
                >
                  <ClipboardList size={12} />
                  <span className="hidden sm:inline">Activity Log</span>
                  <span className="sm:hidden">Log</span>
                </button>
              )}
              {data.permissions.canExport && (
                <button
                  onClick={() => exportRfcCsv(entries)}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                >
                  <Download size={12} />
                  <span className="hidden sm:inline">Export CSV</span>
                  <span className="sm:hidden">Export</span>
                </button>
              )}
              {data.permissions.canCreate && (
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-[#6A4C93] hover:bg-[#5a3d80] text-white transition-colors"
                >
                  <Plus size={12} />
                  <span className="hidden sm:inline">Add Entry</span>
                  <span className="sm:hidden">Add</span>
                </button>
              )}
            </div>
          </div>

          {/* Filter Bar */}
          <div className="border-b px-4 py-2.5 shrink-0 space-y-2">
            {/* Search — full width */}
            <input
              type="text"
              placeholder="🔍 Search client or provider…"
              value={filters.search}
              className="text-xs px-3 py-1.5 rounded-lg border border-border bg-muted text-foreground focus:outline-none focus:border-primary w-full"
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
            {/* Selects — 2-col on mobile, flex-wrap on desktop */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
              <select
                value={filters.sort_order}
                onChange={(e) =>
                  applyFilter({ sort_order: e.target.value as "asc" | "desc" })
                }
                className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer w-full sm:w-auto"
              >
                <option value="desc">🆕 Newest First</option>
                <option value="asc">📜 Oldest First</option>
              </select>
              <select
                value={filters.status}
                onChange={(e) =>
                  applyFilter({
                    status: e.target.value as RfcFilters["status"],
                  })
                }
                className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer w-full sm:w-auto"
              >
                <option value="">All Status</option>
                <option value="filed">✅ Filed to OHO</option>
                <option value="pending">⏳ Pending</option>
                <option value="approved">✓ Approved by TL</option>
              </select>
              <select
                value={filters.month || ""}
                onChange={(e) => applyFilter({ month: e.target.value })}
                className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer w-full sm:w-auto"
              >
                <option value="">All Months</option>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={filters.year || ""}
                onChange={(e) => applyFilter({ year: e.target.value })}
                className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer w-full sm:w-auto"
              >
                <option value="">All Years</option>
                {deriveAvailableYears(data.availableMonths).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={filters.hearing_date || ""}
                onChange={(e) => applyFilter({ hearing_date: e.target.value })}
                aria-label="Filter by hearing date"
                title="Filter to entries with this exact hearing date"
                className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer w-full sm:w-auto"
              />
              <select
                value={filters.team}
                onChange={(e) => applyFilter({ team: e.target.value })}
                className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer w-full sm:w-auto"
              >
                <option value="">All Teams</option>
                <option value="unassigned">— Unassigned —</option>
                {data.mrTeams.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.team_name}
                  </option>
                ))}
              </select>
              <select
                value={filters.doc_type}
                onChange={(e) => applyFilter({ doc_type: e.target.value })}
                className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground cursor-pointer w-full sm:w-auto"
              >
                <option value="">All Doc Types</option>
                {data.documentTypes.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() =>
                  applyFilter({
                    search: "",
                    sort_order: "desc",
                    status: "",
                    month: "",
                    year: "",
                    hearing_date: "",
                    team: "",
                    doc_type: "",
                  })
                }
                className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground transition-colors w-full sm:w-auto"
              >
                Clear
              </button>
            </div>
          </div>

          {/* ── Mobile card list (< md) ─────────────────────────────── */}
          <div className="md:hidden flex-1 overflow-y-auto min-h-0 relative">
            {isPending && (
              <div className="absolute inset-0 bg-background/70 flex items-center justify-center z-10">
                <Loader2 size={28} className="animate-spin text-primary" />
              </div>
            )}
            {!isPending && entries.length === 0 ? (
              <p className="text-center py-16 text-sm text-muted-foreground">
                No entries found.
              </p>
            ) : (
              entries.map((e) => (
                <RfcMobileCard
                  key={e.id}
                  entry={e}
                  data={data}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onComment={setCommentEntry}
                />
              ))
            )}
          </div>

          {/* ── Desktop table (≥ md) ─────────────────────────────────── */}
          <div className="hidden md:flex md:flex-col md:flex-1 md:min-h-0">
            {/* Single scroll container for header + rows */}
            <div className="flex-1 overflow-auto min-h-0 relative">
              {isPending && (
                <div className="absolute inset-0 bg-background/70 flex items-center justify-center z-10">
                  <Loader2 size={28} className="animate-spin text-primary" />
                </div>
              )}
              {/* Column headers — sticky */}
              <div
                className="grid gap-0 bg-muted border-b border-border sticky top-0 z-2 text-[9px] font-semibold uppercase tracking-wide"
                style={{
                  gridTemplateColumns: data.permissions.canDelete
                    ? "115px 120px 115px 155px 110px 155px 115px 65px 120px 120px 80px 95px 45px"
                    : "115px 120px 115px 155px 110px 155px 115px 65px 120px 120px 80px 95px",
                  minWidth: "1400px",
                }}
              >
                <div className="px-3 py-2.5 text-center text-foreground whitespace-nowrap">
                  Date
                </div>
                <div className="px-3 py-2.5 text-center text-foreground whitespace-nowrap">
                  MR Team
                </div>
                <div className="px-3 py-2.5 text-left text-foreground whitespace-nowrap">
                  Hearing Date
                </div>
                <div className="px-3 py-2.5 text-center text-foreground whitespace-nowrap">
                  Client Name
                </div>
                <div className="px-3 py-2.5 text-center text-foreground whitespace-nowrap">
                  Doc Type
                </div>
                <div className="px-3 py-2.5 text-center text-foreground whitespace-nowrap">
                  Provider
                </div>
                <div className="px-3 py-2.5 text-left text-foreground whitespace-nowrap">
                  Date Signed
                </div>
                <div className="px-3 py-2.5 text-center text-foreground whitespace-nowrap">
                  MyCase
                </div>
                <div className="px-3 py-2.5 text-center text-foreground whitespace-nowrap">
                  Method
                </div>
                <div className="px-3 py-2.5 text-left text-foreground whitespace-nowrap">
                  Date Received
                </div>
                <div className="px-3 py-2.5 text-center text-foreground whitespace-nowrap">
                  Filed OHO
                </div>
                <div className="px-3 py-2.5 text-center text-foreground whitespace-nowrap">
                  Appr. TL
                </div>
                {data.permissions.canDelete && (
                  <div className="px-3 py-2.5 text-center text-foreground whitespace-nowrap">
                    Del
                  </div>
                )}
              </div>
              {/* Rows */}
              <div style={{ minWidth: "1400px" }}>
                {!isPending && entries.length === 0 ? (
                  <div className="text-center py-16 text-sm text-muted-foreground">
                    No entries found.
                  </div>
                ) : (
                  entries.map((e) => (
                    <RfcRow
                      key={e.id}
                      entry={e}
                      data={data}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                      onComment={setCommentEntry}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-4 sm:px-5 py-2.5 border-t border-border bg-muted/20 shrink-0">
            <span className="text-[11px] text-muted-foreground">
              Showing {Math.min((curPage - 1) * perPage + 1, total)}–
              {Math.min(curPage * perPage, total)} of {total}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={filters.per_page}
                onChange={(e) =>
                  applyFilter({ per_page: Number(e.target.value), page: 1 })
                }
                className="text-xs px-2 py-1 rounded-lg border border-border bg-card text-foreground cursor-pointer"
              >
                <option value={25}>25/page</option>
                <option value={50}>50/page</option>
                <option value={100}>100/page</option>
              </select>
              <button
                disabled={curPage <= 1 || isPending}
                onClick={() => goPage(curPage - 1)}
                className="text-[11px] px-3 py-1.5 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted transition-colors"
              >
                ← Prev
              </button>
              <span className="text-[11px] text-muted-foreground">
                Page {curPage} of {totalPages}
              </span>
              <button
                disabled={curPage >= totalPages || isPending}
                onClick={() => goPage(curPage + 1)}
                className="text-[11px] px-3 py-1.5 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {showAdd && (
        <AddEntryModal
          data={data}
          onClose={() => setShowAdd(false)}
          onSaved={() => load(filters)}
        />
      )}
      <RfcActivityLogModal
        open={showActivity}
        onClose={() => setShowActivity(false)}
      />
      <ViewDetailsModal
        open={showViewDetails}
        onClose={() => setShowViewDetails(false)}
        data={data}
      />
      {commentEntry && (
        <RfcCommentModal
          entry={commentEntry}
          onClose={() => setCommentEntry(null)}
        />
      )}
    </>
  );
}

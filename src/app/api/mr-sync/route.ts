// Proxies the MR Pivot "Sync to Google Sheets" button → N8N webhook.
// Auth is handled via the existing getSession() wrapper (next-auth / JWT).
// Role check delegates to canSyncGoogleSheets() in @/lib/roles — single
// source of truth for all permission logic in this codebase.
//
// N8N webhook node must be set to "Respond to Webhook" (synchronous) so the
// full change-log payload comes back in this response rather than just an ack.
//
// This route also exposes GET so the UI can restore the latest completed sync
// session after a browser refresh without re-running the workflow.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canSyncGoogleSheets } from "@/lib/roles";
import { db } from "@/lib/db";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_SYNC_URL;
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;
const DEFAULT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1zbztk8oFKUWSDYg1WB2KHXRpL3TDis35PTsodKvBFXg/edit#gid=1264115306";

// Raised from 25 s → 55 s to accommodate 6000+ row syncs.
// Stay under the 60 s Vercel Pro hard limit with a 5 s safety buffer.
const SYNC_TIMEOUT_MS = 55_000;

type SyncErrorCode =
  | "SYNC_CONFIG_ERROR"
  | "SYNC_UNAUTHORIZED"
  | "SYNC_FORBIDDEN"
  | "SYNC_TIMEOUT"
  | "SYNC_SERVICE_UNAVAILABLE"
  | "SYNC_UPSTREAM_ERROR"
  | "SYNC_INVALID_RESPONSE";

type ChangeType = "created" | "updated" | "deleted";
type DbEventType = "create" | "update" | "delete";
type HistorySource = "fresh_run" | "latest_completed_session";
type DiffValue = string | boolean | null;

type SyncBackup = {
  fileId?: string;
  fileName?: string;
  url?: string;
  createdAt?: string | null;
};

type DbLatestSyncRow = {
  last_event_id: number | string | null;
  last_session_start_event_id: number | string | null;
  history_completed_at: string | null;
  last_triggered_by_id: string | number | null;
  last_triggered_by_name: string | null;
  last_triggered_by_role: string | null;
  last_backup_file_id: string | null;
  last_backup_file_name: string | null;
  last_backup_url: string | null;
  last_backup_created_at: string | null;
  last_sheet_url: string | null;
  last_sheet_document_id: string | null;
  last_sheet_gid: string | null;
  id: number | string | null;
  hearing_id: number | string | null;
  event_type: DbEventType | null;
  payload: unknown;
  changed_fields: unknown;
  created_at: string | null;
};

type SyncResult = {
  runAt: string;
  triggeredBy: string;
  triggeredByRole?: string;
  triggeredById?: string;
  sheetUrl: string;
  syncStatus?: "completed" | "busy" | "no_change";
  historySource?: HistorySource;
  historyCompletedAt?: string | null;
  message?: string;
  summary: {
    total: number;
    created: number;
    updated: number;
    deleted: number;
  };
  backup?: SyncBackup | null;
  lastEventId?: number | null;
  sessionStartEventId?: number | null;
  changes: Array<{
    type: ChangeType;
    record: string;
    sheetRow: number;
    diffs: Array<{
      field: string;
      old: DiffValue;
      new: DiffValue;
    }>;
    note?: string;
    time: string;
  }>;
};

function errorResponse(status: number, code: SyncErrorCode, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

function missingEnvResponse(name: string) {
  console.error(`[api/mr-sync] Missing required env var: ${name}`);

  return errorResponse(
    500,
    "SYNC_CONFIG_ERROR",
    "Google Sheets sync is temporarily unavailable. Please try again later.",
  );
}

function parseMaybeJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function resolveSheetUrl(value: string | null | undefined) {
  return value || DEFAULT_SHEET_URL;
}

function buildLatestSyncResult(rows: DbLatestSyncRow[]): SyncResult | null {
  if (!rows.length) return null;

  const sessionMeta = rows[0];
  const historyCompletedAt = sessionMeta.history_completed_at;

  if (!historyCompletedAt) return null;

  const FIELD_TO_LABEL: Record<string, string> = {
    claimant: "Claimant",
    hearing_decision_status: "Status",
    medical_record_status: "Medical Records Status",
    medical_record_link: "MR Worksheet",
    mr_team_name: "MR TEAM",
    claim_type: "Claim Type",
    hearing_date: "Hearing Date",
    hearing_time: "Time",
    time_zone: "Time Zone",
    converted_time_est: "Converted Time in EST",
    manner_of_appearance: "Claimant's MOA",
    alj: "ALJ",
    medical_expert: "Medical Expert",
    vocational_expert: "Vocational Expert",
    task_assigned: "Task Assigned",
    five_day_notice: "5-Day Letter Sent",
    credited: "Credited",
    post_hrg_deadline: "Post HRG Review Deadline",
  };

  const updateGroups = new Map<
    string,
    {
      type: "updated";
      record: string;
      sheetRow: number;
      time: string;
      diffsByField: Map<string, { field: string; old: DiffValue; new: DiffValue }>;
    }
  >();
  const passthroughChanges: SyncResult["changes"] = [];

  const eventRows = rows.filter((row) => row.id !== null && row.event_type);

  for (const row of eventRows) {
    const payload = parseMaybeJson<Record<string, unknown>>(row.payload, {});
    const changedFields = parseMaybeJson<
      Record<string, { old?: string | boolean | null; new?: string | boolean | null }>
    >(row.changed_fields, {});
    const record =
      (typeof payload.claimant === "string" && payload.claimant) ||
      `Hearing #${String(row.hearing_id ?? row.id ?? "unknown")}`;
    const eventTime = row.created_at || historyCompletedAt;

    if (row.event_type === "create") {
      passthroughChanges.push({
        type: "created",
        record,
        sheetRow: 0,
        diffs: [],
        note: "New row was appended to Google Sheets in the latest completed sync.",
        time: eventTime,
      });
      continue;
    }

    if (row.event_type === "delete") {
      passthroughChanges.push({
        type: "deleted",
        record,
        sheetRow: 0,
        diffs: [],
        note: "Row was removed from Google Sheets in the latest completed sync.",
        time: eventTime,
      });
      continue;
    }

    if (row.event_type !== "update") {
      continue;
    }

    const hearingKey = String(row.hearing_id ?? payload.id ?? record ?? "unknown");
    let group = updateGroups.get(hearingKey);

    if (!group) {
      group = {
        type: "updated",
        record,
        sheetRow: 0,
        time: eventTime,
        diffsByField: new Map(),
      };
      updateGroups.set(hearingKey, group);
    }

    if (record) group.record = record;

    if (new Date(eventTime).getTime() > new Date(group.time).getTime()) {
      group.time = eventTime;
    }

    for (const [dbField, change] of Object.entries(changedFields)) {
      const field = FIELD_TO_LABEL[dbField] || dbField;
      const existing = group.diffsByField.get(field);

      if (!existing) {
        group.diffsByField.set(field, {
          field,
          old: change?.old ?? null,
          new: change?.new ?? null,
        });
      } else {
        group.diffsByField.set(field, {
          field,
          old: existing.old,
          new: change?.new ?? null,
        });
      }
    }
  }

  const groupedUpdateChanges: SyncResult["changes"] = Array.from(updateGroups.values()).map(
    (group) => ({
      type: "updated",
      record: group.record,
      sheetRow: group.sheetRow,
      diffs: Array.from(group.diffsByField.values()),
      time: group.time,
    }),
  );

  const changes = [...passthroughChanges, ...groupedUpdateChanges].sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
  );

  const created = changes.filter((item) => item.type === "created").length;
  const updated = changes.filter((item) => item.type === "updated").length;
  const deleted = changes.filter((item) => item.type === "deleted").length;

  const lastEventId = Number(sessionMeta.last_event_id ?? 0);
  const sessionStartEventId = Number(sessionMeta.last_session_start_event_id ?? 0);

  const backup =
    sessionMeta.last_backup_file_id ||
    sessionMeta.last_backup_file_name ||
    sessionMeta.last_backup_url ||
    sessionMeta.last_backup_created_at
      ? {
          fileId: sessionMeta.last_backup_file_id || undefined,
          fileName: sessionMeta.last_backup_file_name || undefined,
          url: sessionMeta.last_backup_url || undefined,
          createdAt: sessionMeta.last_backup_created_at || historyCompletedAt,
        }
      : null;

  return {
    runAt: historyCompletedAt,
    triggeredBy: sessionMeta.last_triggered_by_name || "Unknown user",
    triggeredByRole: sessionMeta.last_triggered_by_role || "",
    triggeredById:
      sessionMeta.last_triggered_by_id !== null && sessionMeta.last_triggered_by_id !== undefined
        ? String(sessionMeta.last_triggered_by_id)
        : "",
    sheetUrl: resolveSheetUrl(sessionMeta.last_sheet_url),
    syncStatus: "completed",
    historySource: "latest_completed_session",
    historyCompletedAt,
    backup,
    lastEventId,
    sessionStartEventId,
    summary: {
      total: changes.length,
      created,
      updated,
      deleted,
    },
    changes,
  };
}

async function requireSyncUser() {
  const session = await getSession();

  if (!session?.user) {
    return {
      error: errorResponse(
        401,
        "SYNC_UNAUTHORIZED",
        "Please sign in again before running the Google Sheets sync.",
      ),
      session: null,
    };
  }

  if (!canSyncGoogleSheets(session.user.role)) {
    return {
      error: errorResponse(
        403,
        "SYNC_FORBIDDEN",
        "You do not have permission to run the Google Sheets sync.",
      ),
      session: null,
    };
  }

  return { error: null, session };
}

export async function GET() {
  const auth = await requireSyncUser();
  if (auth.error) return auth.error;

  try {
    const { rows } = await db.query<DbLatestSyncRow>(`
      SELECT
        w.last_event_id,
        w.last_session_start_event_id,
        w.updated_at AS history_completed_at,
        w.last_triggered_by_id,
        w.last_triggered_by_name,
        w.last_triggered_by_role,
        w.last_backup_file_id,
        w.last_backup_file_name,
        w.last_backup_url,
        w.last_backup_created_at,
        w.last_sheet_url,
        w.last_sheet_document_id,
        w.last_sheet_gid,
        e.id,
        e.hearing_id,
        e.event_type,
        e.payload,
        e.changed_fields,
        e.created_at
      FROM sync_watermarks w
      LEFT JOIN hearing_sync_events e
        ON e.id > COALESCE(w.last_session_start_event_id, 0)
       AND e.id <= COALESCE(w.last_event_id, 0)
      WHERE w.key = 'mr_google_sheets_events'
      ORDER BY e.id ASC;
    `);

    const latestResult = buildLatestSyncResult(rows);

    if (!latestResult) {
      return NextResponse.json({ ok: true, hasLatestSync: false });
    }

    return NextResponse.json({ ok: true, hasLatestSync: true, ...latestResult });
  } catch (error) {
    console.error("[api/mr-sync] Failed to load latest sync session →", error);
    return errorResponse(
      500,
      "SYNC_SERVICE_UNAVAILABLE",
      "We could not load the latest sync history right now.",
    );
  }
}

export async function POST(request: Request) {
  if (!N8N_WEBHOOK_URL) {
    return missingEnvResponse("N8N_WEBHOOK_SYNC_URL");
  }

  if (!N8N_WEBHOOK_SECRET) {
    return missingEnvResponse("N8N_WEBHOOK_SECRET");
  }

  let clientPayload: Record<string, unknown> = {};
  try {
    clientPayload = await request.json();
  } catch {
    clientPayload = {};
  }

  const auth = await requireSyncUser();
  if (auth.error) return auth.error;
  if (!auth.session) {
    return errorResponse(
      401,
      "SYNC_UNAUTHORIZED",
      "Please sign in again before running the Google Sheets sync.",
    );
  }
  const { session } = auth;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  let n8nRes: Response;
  try {
    n8nRes = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${N8N_WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({
        ...clientPayload,
        triggeredBy: session.user.name,
        triggeredByRole: session.user.role,
        triggeredById: session.user.id,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof Error && err.name === "AbortError";

    return errorResponse(
      isTimeout ? 504 : 502,
      isTimeout ? "SYNC_TIMEOUT" : "SYNC_SERVICE_UNAVAILABLE",
      isTimeout
        ? "Sync is taking longer than expected. The sheet may still finish updating in the background."
        : "The sync service is temporarily unavailable. Please try again in a moment.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!n8nRes.ok) {
    const text = await n8nRes.text().catch(() => "");
    console.error("[api/mr-sync] N8N error →", n8nRes.status, text);

    return errorResponse(
      502,
      "SYNC_UPSTREAM_ERROR",
      "The sync could not be completed right now. Please try again shortly.",
    );
  }

  try {
    const data = (await n8nRes.json()) as Partial<SyncResult> & Record<string, unknown>;
    const sheetUrl =
      typeof data.sheetUrl === "string" && data.sheetUrl ? data.sheetUrl : DEFAULT_SHEET_URL;

    const lastEventId =
      typeof data.lastEventId === "number"
        ? data.lastEventId
        : typeof data.__lastEventId === "number"
          ? data.__lastEventId
          : typeof data.__lastEventId === "string"
            ? Number(data.__lastEventId)
            : undefined;

    const sessionStartEventId =
      typeof data.sessionStartEventId === "number"
        ? data.sessionStartEventId
        : typeof data.__sessionStartEventId === "number"
          ? data.__sessionStartEventId
          : typeof data.__sessionStartEventId === "string"
            ? Number(data.__sessionStartEventId)
            : undefined;

    return NextResponse.json({
      ok: true,
      ...data,
      sheetUrl,
      ...(Number.isFinite(lastEventId) ? { lastEventId } : {}),
      ...(Number.isFinite(sessionStartEventId) ? { sessionStartEventId } : {}),
    });
  } catch (error) {
    console.error("[api/mr-sync] Invalid JSON response from N8N →", error);

    return errorResponse(
      502,
      "SYNC_INVALID_RESPONSE",
      "The sync finished with an unreadable response. Please try again shortly.",
    );
  }
}

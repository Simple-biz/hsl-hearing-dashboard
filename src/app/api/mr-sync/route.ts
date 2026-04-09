// Proxies the MR Pivot "Sync to Google Sheets" button → N8N webhook.
// Auth is handled via the existing getSession() wrapper (next-auth / JWT).
// Role check delegates to canSyncGoogleSheets() in @/lib/roles — single
// source of truth for all permission logic in this codebase.
//
// N8N webhook node must be set to "Respond to Webhook" (synchronous) so the
// full change-log payload comes back in this response rather than just an ack.
//
// Vercel function timeout heads-up:
//   Hobby  → 10 s hard limit  (may be tight for large sheets)
//   Pro    → 60 s hard limit  (comfortable for most datasets)
// Adjust SYNC_TIMEOUT_MS to stay safely under whichever plan we're on.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canSyncGoogleSheets } from "@/lib/roles";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_SYNC_URL;
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;

// Raised from 25 s → 55 s to accommodate 6000+ row syncs.
// Stay under the 60 s Vercel Pro hard limit with a 5 s safety buffer.
// If instance is on Vercel Hobby (10 s limit), switch to 
// the delta-sync approach in the N8N SQL instead — see fetch-db-rows-delta.sql.
const SYNC_TIMEOUT_MS = 55_000;

type SyncErrorCode =
  | "SYNC_CONFIG_ERROR"
  | "SYNC_UNAUTHORIZED"
  | "SYNC_FORBIDDEN"
  | "SYNC_TIMEOUT"
  | "SYNC_SERVICE_UNAVAILABLE"
  | "SYNC_UPSTREAM_ERROR"
  | "SYNC_INVALID_RESPONSE";

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

  const session = await getSession();

  if (!session?.user) {
    return errorResponse(
      401,
      "SYNC_UNAUTHORIZED",
      "Please sign in again before running the Google Sheets sync.",
    );
  }

  if (!canSyncGoogleSheets(session.user.role)) {
    return errorResponse(
      403,
      "SYNC_FORBIDDEN",
      "You do not have permission to run the Google Sheets sync.",
    );
  }

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
    const data = await n8nRes.json();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    console.error("[api/mr-sync] Invalid JSON response from N8N →", error);

    return errorResponse(
      502,
      "SYNC_INVALID_RESPONSE",
      "The sync finished with an unreadable response. Please try again shortly.",
    );
  }
}

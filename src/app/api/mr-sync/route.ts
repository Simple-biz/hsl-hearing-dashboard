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
const SYNC_TIMEOUT_MS = 25_000;

function missingEnvResponse(name: string) {
  return NextResponse.json(
    { message: `Server misconfiguration: missing ${name}.` },
    { status: 500 },
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
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  if (!canSyncGoogleSheets(session.user.role)) {
    return NextResponse.json(
      { message: "Your role does not have permission to run this sync." },
      { status: 403 },
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

    return NextResponse.json(
      {
        message: isTimeout
          ? "Sync timed out — the sheet may still be updating. Check it directly."
          : "Could not reach the N8N automation service. Ensure the webhook is active.",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!n8nRes.ok) {
    const text = await n8nRes.text().catch(() => "");
    console.error("[api/mr-sync] N8N error →", n8nRes.status, text);

    return NextResponse.json(
      { message: "The N8N workflow returned an error. Check the N8N execution log." },
      { status: 502 },
    );
  }

  const data = await n8nRes.json();
  return NextResponse.json(data);
}

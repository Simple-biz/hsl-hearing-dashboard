// Proxies the MR Pivot "Sync to Google Sheets" button → N8N webhook.
// Auth is handled via your existing getSession() wrapper (next-auth / JWT).
// Role check delegates to canSyncGoogleSheets() in @/lib/roles — single
// source of truth for all permission logic in this codebase.
//
// N8N webhook node must be set to "Respond to Webhook" (synchronous) so the
// full change-log payload comes back in this response rather than just an ack.
//
// Vercel function timeout heads-up:
//   Hobby  → 10 s hard limit  (may be tight for large sheets)
//   Pro    → 60 s hard limit  (comfortable for most datasets)
// Adjust SYNC_TIMEOUT_MS to stay safely under whichever plan you're on.

import { NextResponse }          from "next/server";
import { getSession }            from "@/lib/session";      // your existing wrapper
import { canSyncGoogleSheets }   from "@/lib/roles";        // see addition below

// ─── Env vars — matching your actual .env.local keys ─────────────────────────

const N8N_WEBHOOK_URL    = process.env.N8N_WEBHOOK_SYNC_URL!;  // https://auto.simple.biz/webhook/web-app-sync
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET!;
const SYNC_TIMEOUT_MS    = 25_000;

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST() {
  // 1. Auth — getSession() reads the NextAuth JWT cookie automatically.
  //    No need to pass the request; NextAuth handles it server-side.
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  // 2. Role check — delegates to roles.ts (see the addition below)
  //    session.user.role is already typed as string via your auth.ts declarations.
  if (!canSyncGoogleSheets(session.user.role)) {
    return NextResponse.json(
      { message: "Your role does not have permission to run this sync." },
      { status: 403 }
    );
  }

  // 3. Call N8N with a timeout guard
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  let n8nRes: Response;
  try {
    n8nRes = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Matches the "Header Auth" credential you set up in N8N:
        //   Header Name  → Authorization
        //   Header Value → Bearer <N8N_WEBHOOK_SECRET>
        Authorization: `Bearer ${N8N_WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({
        triggeredBy:     session.user.name,
        triggeredByRole: session.user.role,
        triggeredById:   session.user.id,
      }),
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
      { status: 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!n8nRes.ok) {
    const text = await n8nRes.text().catch(() => "");
    console.error("[api/mr-sync] N8N error →", n8nRes.status, text);
    return NextResponse.json(
      { message: "The N8N workflow returned an error. Check the N8N execution log." },
      { status: 502 }
    );
  }

  // 4. Forward the change-log payload to the frontend as-is
  const data = await n8nRes.json();
  return NextResponse.json(data);
}

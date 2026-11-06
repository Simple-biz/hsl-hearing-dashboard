import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  CasewellApiError,
  fetchClientAssigneePage,
  isCasewellConfigured,
} from "@/lib/casewell";

// ~120 pages at ~2s each is ~4 minutes. Fluid compute is on for this
// project, which allows up to 800s on Pro.
export const maxDuration = 800;

/** Casewell case level swept on every run. */
const LEVEL = "Hearing";
/** Stop paging with headroom left, so the DB write always runs. */
const TIME_BUDGET_MS = 700_000;

/**
 * Casewell POC Sync Cron
 *
 * Copies each claimant's Casewell assignee (ClientListItem.assigned_user_name)
 * into hearings.poc, shown as the read-only POC column on the dashboard.
 *
 * Sweeps every Casewell client at the Hearing level (~12k, ~120 pages) and
 * matches them to hearings on the legacy (Chronicle) client id at the end of
 * chronicle_link. Only rows whose POC actually changed are written;
 * poc_synced_at marks when that happened. Hearings with no chronicle_link,
 * or whose client has moved past the Hearing level, keep their last value.
 *
 * Why a full sweep and not incremental: Casewell's last_change_date is the
 * SSA status date, not a record-edit date, and its updated_at is shared by
 * hundreds of rows per batch update, which makes cursor paging on it unstable.
 *
 * Schedule: Every 30 minutes (:10 and :40) via Vercel Cron, skipping the
 * 08:00 UTC hour when PHMR Rebuild's own Casewell sweep uses the same
 * rate-limited API key.
 * GET /api/cron/sync-poc?cron_key=SECRET
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cronSecret =
    searchParams.get("cron_key") ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isCasewellConfigured()) {
    return NextResponse.json(
      { error: "Casewell API not configured" },
      { status: 500 },
    );
  }

  const started = Date.now();

  // legacy client id -> assignee name (null = unassigned in Casewell)
  const assignees = new Map<number, string | null>();
  let cursor: string | null = null;
  let pages = 0;
  let skipped = 0;
  let complete = false;

  try {
    while (true) {
      const page = await fetchClientAssigneePage({
        level: LEVEL,
        cursor,
        throttle: pages > 0,
      });
      pages++;
      skipped += page.skipped;
      for (const c of page.items) assignees.set(c.legacyClientId, c.assignedUserName);
      cursor = page.nextCursor;
      if (!cursor) {
        complete = true;
        break;
      }
      if (Date.now() - started > TIME_BUDGET_MS) break;
    }
  } catch (error) {
    // Write whatever was collected before the failure; the next run covers
    // the rest. Message only: never the URL or any response content.
    console.error(
      "[sync-poc] Casewell fetch stopped:",
      error instanceof CasewellApiError ? error.message : "unexpected error",
    );
    if (assignees.size === 0) {
      return NextResponse.json(
        { error: "Casewell fetch failed", pages },
        { status: 502 },
      );
    }
  }

  const ids = [...assignees.keys()];
  const names = ids.map((id) => assignees.get(id) ?? null);

  // Single statement: match on the trailing numeric id in chronicle_link and
  // write only where the value differs.
  const { rowCount } = await db.query(
    `UPDATE hearings h
        SET poc = v.name,
            poc_synced_at = NOW()
       FROM unnest($1::bigint[], $2::text[]) AS v(legacy_id, name)
      WHERE h.chronicle_link ~ '/clients/[0-9]+'
        AND substring(h.chronicle_link from '/clients/([0-9]+)')::bigint = v.legacy_id
        AND h.poc IS DISTINCT FROM v.name`,
    [ids, names],
  );

  return NextResponse.json({
    complete,
    pages,
    casewellClients: assignees.size,
    skipped,
    updated: rowCount ?? 0,
    seconds: Math.round((Date.now() - started) / 1000),
  });
}

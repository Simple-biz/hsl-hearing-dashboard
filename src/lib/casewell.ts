/**
 * Casewell partner API client (read-only).
 *
 * Used by the POC sync cron to read each client's Casewell assignee. Auth is
 * a single `X-API-Key` header; config comes from CASEWELL_API_BASE_URL
 * (HTTPS origin, no path) and CASEWELL_API_KEY.
 *
 * Retry rules follow the PHMR Rebuild client (src/lib/casewell-client.ts in
 * that repo), which found them against the live API:
 *   - The key is rate-limited to ~60 requests/minute and shared with PHMR's
 *     own sweeps, so pages are spaced 1.1s apart and 429s are retried,
 *     honouring Retry-After, with each wait capped at 30s.
 *   - 500/502/503/504 and dropped connections are transient: retried with
 *     doubling backoff (3s, 6s, 12s, 24s).
 *   - Total time spent waiting is capped at 2 minutes, and each attempt at
 *     30s, so a cron run can never hang.
 *   - Responses over 1 MB are refused.
 *
 * PHI: responses carry real claimant data. Nothing here logs a response
 * body, a URL with ids in it, or any field value.
 */

const PAGE_SIZE = 100; // API maximum; 250 returns 422
const PAGE_DELAY_MS = 1100;
const MAX_RESPONSE_BYTES = 1_000_000;
const ATTEMPT_TIMEOUT_MS = 30_000;
const RATE_LIMIT_RETRIES = 3;
const DEFAULT_RETRY_AFTER_MS = 15_000;
const GATEWAY_RETRIES = 4;
const GATEWAY_RETRY_MS = 3_000;
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const MAX_SINGLE_WAIT_MS = 30_000;
const MAX_TOTAL_WAIT_MS = 120_000;

export class CasewellApiError extends Error {
  /** HTTP status, or 0 when no usable HTTP response arrived. */
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CasewellApiError";
    this.status = status;
  }
}

/** The two fields the POC sync reads from a ClientListItem. */
export interface CasewellClientAssignee {
  legacyClientId: number;
  assignedUserName: string | null;
}

export interface CasewellAssigneePage {
  items: CasewellClientAssignee[];
  nextCursor: string | null;
  /** Rows with no usable legacy_client_id, left out of items. */
  skipped: number;
}

export function isCasewellConfigured(): boolean {
  return !!process.env.CASEWELL_API_BASE_URL && !!process.env.CASEWELL_API_KEY;
}

function requireConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.CASEWELL_API_BASE_URL;
  const apiKey = process.env.CASEWELL_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new CasewellApiError("Casewell API is not configured", 0);
  }
  if (!baseUrl.startsWith("https://")) {
    throw new CasewellApiError("CASEWELL_API_BASE_URL must be HTTPS", 0);
  }
  return { baseUrl, apiKey };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Attempt =
  | { ok: true; json: unknown }
  | { ok: false; status: number; retryAfter: string | null };

async function attemptOnce(url: URL, apiKey: string): Promise<Attempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "X-API-Key": apiKey },
      signal: controller.signal,
      cache: "no-store",
    });
    const retryAfter = res.headers.get("retry-after");
    if (!res.ok) return { ok: false, status: res.status, retryAfter };
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      throw new CasewellApiError("Casewell response over 1 MB", 0);
    }
    const body = await res.text();
    if (body.length > MAX_RESPONSE_BYTES) {
      throw new CasewellApiError("Casewell response over 1 MB", 0);
    }
    // A non-JSON 200 is usually a gateway HTML page: treat as transient.
    try {
      return { ok: true, json: JSON.parse(body) };
    } catch {
      return { ok: false, status: 0, retryAfter: null };
    }
  } catch (error) {
    if (error instanceof CasewellApiError) throw error;
    // Timeout or dropped connection. The error text can carry the URL, so it
    // is not passed on.
    return { ok: false, status: 0, retryAfter: null };
  } finally {
    clearTimeout(timer);
  }
}

async function casewellGet(
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const { baseUrl, apiKey } = requireConfig();
  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let rateLimitAttempt = 0;
  let gatewayAttempt = 0;
  let totalWaitMs = 0;
  while (true) {
    const attempt = await attemptOnce(url, apiKey);
    if (attempt.ok) return attempt.json;

    let waitMs: number | null = null;
    if (attempt.status === 429 && rateLimitAttempt < RATE_LIMIT_RETRIES) {
      rateLimitAttempt++;
      const ra = Number(attempt.retryAfter);
      waitMs = Math.min(
        Number.isFinite(ra) && ra > 0 ? ra * 1000 : DEFAULT_RETRY_AFTER_MS,
        MAX_SINGLE_WAIT_MS,
      );
    } else if (
      (attempt.status === 0 || RETRYABLE_STATUSES.has(attempt.status)) &&
      gatewayAttempt < GATEWAY_RETRIES
    ) {
      gatewayAttempt++;
      waitMs = Math.min(
        GATEWAY_RETRY_MS * 2 ** (gatewayAttempt - 1),
        MAX_SINGLE_WAIT_MS,
      );
    }

    if (waitMs === null || totalWaitMs + waitMs > MAX_TOTAL_WAIT_MS) {
      throw new CasewellApiError(
        `Casewell API request failed (${attempt.status || "network error"})`,
        attempt.status,
      );
    }
    totalWaitMs += waitMs;
    await sleep(waitMs);
  }
}

/**
 * One page of Casewell clients at one case level, reduced to legacy id +
 * assignee. `legacy_client_id` is the Chronicle client id, the number at the
 * end of hearings.chronicle_link.
 *
 * Filtered by level, not hearing date: most Casewell clients (including ones
 * with a scheduled hearing here) have no hearing_schedule_date, so a date
 * filter silently misses them.
 */
export async function fetchClientAssigneePage({
  level,
  cursor,
  throttle,
}: {
  level: string; // e.g. "Hearing"
  cursor: string | null;
  throttle: boolean;
}): Promise<CasewellAssigneePage> {
  if (throttle) await sleep(PAGE_DELAY_MS);

  // The spec says a cursor overrides page/page_size, not filters, so the
  // filter is sent on every page.
  const params: Record<string, string> = {
    page_size: String(PAGE_SIZE),
    level,
  };
  if (cursor) params.cursor = cursor;
  const json = await casewellGet("/api/clients", params);

  if (!json || typeof json !== "object" || !Array.isArray((json as { items?: unknown }).items)) {
    throw new CasewellApiError("Casewell client list had an unexpected shape", 0);
  }
  const page = json as { items: unknown[]; next_cursor?: unknown };

  const items: CasewellClientAssignee[] = [];
  let skipped = 0;
  for (const raw of page.items) {
    const row = raw as { legacy_client_id?: unknown; assigned_user_name?: unknown };
    const id = Number(row?.legacy_client_id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      skipped++;
      continue;
    }
    const name =
      typeof row.assigned_user_name === "string" && row.assigned_user_name.trim()
        ? row.assigned_user_name.trim()
        : null;
    items.push({ legacyClientId: id, assignedUserName: name });
  }

  const next = typeof page.next_cursor === "string" && page.next_cursor ? page.next_cursor : null;
  return { items, nextCursor: next, skipped };
}

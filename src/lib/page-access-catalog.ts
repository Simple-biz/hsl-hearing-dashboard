// ─── Page Access Catalog ──────────────────────────────────────────────────────
//
// The set of pages an admin can grant/revoke per-user in the "Access
// Overrides" modal (Pages tab). Mirrors field-access-catalog.ts.
//
// Only operational pages that are currently role-gated are listed here.
// System pages (admin, settings, import*) stay role-locked by design and
// are intentionally NOT user-overridable.
//
// Role defaults live in PAGE_ACCESS (roles.ts). "allowlist" pages have NO
// role default — access is granted only via an explicit override row.

// Scoped to the same pages that have per-field access management (minus
// Dashboard, which is the app home and isn't gated). mr_reports / import_rfc
// stay listed (hidden) so their allowlist enforcement keeps working.
export type PageAccessKey =
  | "medical_records"
  | "mr_reports"
  | "import_rfc"
  | "representative_docs"
  | "post_hrg_development"
  | "pre_hearing_mr";

export interface PageAccessEntry {
  /** Must match the key used in PAGE_ACCESS / page route guards. */
  key: PageAccessKey;
  /** User-facing label in the admin modal. */
  label: string;
  /**
   * Allowlist page — no role grants access by default; a user reaches it
   * ONLY through an explicit `can_access = true` override row. Generalizes
   * the old hardcoded PAGE_USER_IDS map.
   */
  allowlist?: boolean;
  /**
   * Hidden from the admin "Pages" tab UI, but STILL fully enforced — the
   * resolver, route guards, nav, and any existing override rows behave
   * normally. Use to stage a page out of the admin UI without changing its
   * access behavior (e.g. pending sign-off from the affected users).
   */
  hidden?: boolean;
}

export const PAGE_ACCESS_CATALOG: PageAccessEntry[] = [
  { key: "medical_records", label: "Medical Records (MR Pivot)" },
  { key: "post_hrg_development", label: "Post HRG Development" },
  { key: "representative_docs", label: "Representative Docs" },
  { key: "pre_hearing_mr", label: "Pre Hearing MR (external)" },
  // Hidden from the admin UI for now — allowlist behavior is unchanged
  // (still user-1/7 only); pending confirmation with the MR Reports /
  // Import RFC users. Listed here so allowlist enforcement keeps working.
  { key: "mr_reports", label: "MR Reports", allowlist: true, hidden: true },
  { key: "import_rfc", label: "Import RFC", allowlist: true, hidden: true },
];

/** Pages shown in the admin "Pages" tab (hidden ones excluded). */
export const VISIBLE_PAGE_ACCESS_CATALOG: PageAccessEntry[] =
  PAGE_ACCESS_CATALOG.filter((p) => !p.hidden);

/** Page keys shown in the admin "Pages" tab — used to scope bulk reset. */
export const VISIBLE_PAGE_KEYS: PageAccessKey[] =
  VISIBLE_PAGE_ACCESS_CATALOG.map((p) => p.key);

/** Page keys whose role default is "nobody" — access only via explicit grant. */
export const ALLOWLIST_PAGES: PageAccessKey[] = PAGE_ACCESS_CATALOG.filter(
  (p) => p.allowlist,
).map((p) => p.key);

const CATALOG_KEYS = new Set<string>(PAGE_ACCESS_CATALOG.map((p) => p.key));

/** True if `key` is an admin-overridable page (incl. hidden ones). */
export function isPageAccessKey(key: string): key is PageAccessKey {
  return CATALOG_KEYS.has(key);
}

"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import { X as XIcon, Loader2, RotateCcw, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  getUserFieldAccess,
  setUserFieldAccess,
  resetUserFieldAccess,
  getUserPageAccess,
  setUserPageAccess,
  resetUserPageAccess,
} from "@/app/(dashboard)/admin/actions";
import {
  FIELD_ACCESS_CATALOG,
  type FieldAccessPageKey,
} from "@/lib/field-access-catalog";
import {
  VISIBLE_PAGE_ACCESS_CATALOG,
  ALLOWLIST_PAGES,
  type PageAccessKey,
} from "@/lib/page-access-catalog";
import {
  canEditField,
  MR_PIVOT_EDITABLE,
  PAGE_ACCESS,
  type UserRole,
} from "@/lib/roles";

// Per-page role-default resolver — mirrors lib/field-access.ts so the modal
// can show "what would the role default be" for each checkbox without an
// extra round trip. Keep these two switches in sync.
function resolveRoleDefault(
  role: UserRole,
  pageKey: FieldAccessPageKey,
  fieldKey: string,
): boolean {
  switch (pageKey) {
    case "dashboard":
      return canEditField(role, fieldKey);
    case "medical_records":
      return (MR_PIVOT_EDITABLE[fieldKey] ?? []).includes(role);
    case "post_hrg_development":
      if (fieldKey === "requirements")
        return role === "system_admin" || role === "admin";
      return PAGE_ACCESS.post_hrg_development.includes(role);
    case "representative_docs":
      return PAGE_ACCESS.representative_docs.includes(role);
    case "rfc":
      // Mirror of RFC_PAGE_ACTIONS in roles.ts (action-style keys).
      switch (fieldKey) {
        case "create_entry":
        case "assign_team":
          return [
            "system_admin",
            "admin",
            "manager",
            "mr_admin",
            "mr_lead",
          ].includes(role);
        case "edit_entry":
        case "update_status":
          return [
            "system_admin",
            "admin",
            "manager",
            "mr_admin",
            "mr_lead",
            "mr_agent",
          ].includes(role);
        case "delete_entry":
          return ["system_admin", "admin", "manager"].includes(role);
        default:
          return false;
      }
    case "patient_portal":
      // Mirror of derivePortalPermissions in patient-portal/types.ts.
      switch (fieldKey) {
        case "create_entry":
        case "edit_entry":
          return [
            "system_admin",
            "admin",
            "manager",
            "mr_admin",
            "mr_lead",
            "mr_agent",
            "hearings_admin",
          ].includes(role);
        case "delete_entry":
          return [
            "system_admin",
            "admin",
            "manager",
            "mr_admin",
            "mr_lead",
            "hearings_admin",
          ].includes(role);
        case "assign_specialist":
          return [
            "system_admin",
            "admin",
            "manager",
            "mr_admin",
            "mr_lead",
            "mr_agent",
          ].includes(role);
        default:
          return false;
      }
    default:
      return false;
  }
}

// Page-access role default — mirrors lib/page-access.ts resolvePageRoleDefault.
// Allowlist pages have no role default; access only via an explicit grant.
function resolvePageDefault(role: UserRole, pageKey: string): boolean {
  if ((ALLOWLIST_PAGES as string[]).includes(pageKey)) return false;
  const allowed = PAGE_ACCESS[pageKey];
  return allowed ? allowed.includes(role) : false;
}

type Tab = "pages" | "fields";

interface Props {
  open: boolean;
  user: {
    id: number;
    full_name: string;
    role: UserRole;
  } | null;
  onClose: () => void;
}

export function UserAccessModal({ open, user, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("fields");

  // ── Field-access tab state ──────────────────────────────────────────────
  const [pageKey, setPageKey] = useState<FieldAccessPageKey>(
    FIELD_ACCESS_CATALOG[0].key,
  );
  const [effective, setEffective] = useState<Map<string, boolean>>(new Map());
  const [savedOverrides, setSavedOverrides] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [loading, startLoad] = useTransition();

  // ── Page-access tab state ───────────────────────────────────────────────
  const [pageEffective, setPageEffective] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [pageSaved, setPageSaved] = useState<Map<string, boolean>>(new Map());
  const [pageLoading, startPageLoad] = useTransition();

  const [saving, setSaving] = useState(false);

  const isRep = user?.role === "rep";
  const page = FIELD_ACCESS_CATALOG.find((p) => p.key === pageKey)!;

  const loadOverrides = useCallback(() => {
    if (!user) return;
    startLoad(async () => {
      const rows = await getUserFieldAccess(user.id, pageKey);
      const overridesMap = new Map<string, boolean>();
      for (const r of rows) overridesMap.set(r.field_key, r.can_edit);
      setSavedOverrides(overridesMap);
      const merged = new Map<string, boolean>();
      for (const f of page.fields) {
        if (overridesMap.has(f.key)) {
          merged.set(f.key, overridesMap.get(f.key)!);
        } else {
          merged.set(f.key, resolveRoleDefault(user.role, pageKey, f.key));
        }
      }
      setEffective(merged);
    });
  }, [user, pageKey, page.fields]);

  const loadPageOverrides = useCallback(() => {
    if (!user) return;
    startPageLoad(async () => {
      const rows = await getUserPageAccess(user.id);
      const overridesMap = new Map<string, boolean>();
      for (const r of rows) overridesMap.set(r.page_key, r.can_access);
      setPageSaved(overridesMap);
      const merged = new Map<string, boolean>();
      for (const p of VISIBLE_PAGE_ACCESS_CATALOG) {
        merged.set(
          p.key,
          overridesMap.has(p.key)
            ? overridesMap.get(p.key)!
            : resolvePageDefault(user.role, p.key),
        );
      }
      setPageEffective(merged);
    });
  }, [user]);

  useEffect(() => {
    if (!open) return;
    if (tab === "fields") loadOverrides();
    else loadPageOverrides();
  }, [open, tab, loadOverrides, loadPageOverrides]);

  // ── Field-tab dirty tracking ────────────────────────────────────────────
  const savedEffective = (() => {
    const m = new Map<string, boolean>();
    if (!user) return m;
    for (const f of page.fields) {
      m.set(
        f.key,
        savedOverrides.has(f.key)
          ? (savedOverrides.get(f.key) as boolean)
          : resolveRoleDefault(user.role, pageKey, f.key),
      );
    }
    return m;
  })();
  const dirtyFields: string[] = [];
  for (const f of page.fields) {
    if (
      (effective.get(f.key) ?? false) !== (savedEffective.get(f.key) ?? false)
    )
      dirtyFields.push(f.key);
  }

  // ── Page-tab dirty tracking ─────────────────────────────────────────────
  const savedPageEffective = (() => {
    const m = new Map<string, boolean>();
    if (!user) return m;
    for (const p of VISIBLE_PAGE_ACCESS_CATALOG) {
      m.set(
        p.key,
        pageSaved.has(p.key)
          ? (pageSaved.get(p.key) as boolean)
          : resolvePageDefault(user.role, p.key),
      );
    }
    return m;
  })();
  const dirtyPages: string[] = [];
  for (const p of VISIBLE_PAGE_ACCESS_CATALOG) {
    if (
      (pageEffective.get(p.key) ?? false) !==
      (savedPageEffective.get(p.key) ?? false)
    )
      dirtyPages.push(p.key);
  }

  const activeDirty = tab === "fields" ? dirtyFields : dirtyPages;
  const isDirty = activeDirty.length > 0;

  if (!open || !user) return null;

  const toggleField = (fieldKey: string) => {
    if (saving || isRep) return;
    setEffective((prev) => {
      const m = new Map(prev);
      m.set(fieldKey, !(prev.get(fieldKey) ?? false));
      return m;
    });
  };

  const togglePage = (key: string) => {
    if (saving) return;
    setPageEffective((prev) => {
      const m = new Map(prev);
      m.set(key, !(prev.get(key) ?? false));
      return m;
    });
  };

  const handleSave = async () => {
    if (!user || !isDirty) return;
    setSaving(true);
    try {
      if (tab === "fields") {
        if (isRep) return;
        for (const fieldKey of dirtyFields) {
          const next = effective.get(fieldKey) ?? false;
          const roleDefault = resolveRoleDefault(user.role, pageKey, fieldKey);
          await setUserFieldAccess(
            user.id,
            pageKey,
            fieldKey,
            next === roleDefault ? null : next,
          );
        }
        loadOverrides();
      } else {
        for (const key of dirtyPages) {
          const next = pageEffective.get(key) ?? false;
          const roleDefault = resolvePageDefault(user.role, key);
          await setUserPageAccess(
            user.id,
            key as PageAccessKey,
            next === roleDefault ? null : next,
          );
        }
        loadPageOverrides();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!isDirty) return;
    if (!confirm("Discard unsaved changes?")) return;
    if (tab === "fields") setEffective(new Map(savedEffective));
    else setPageEffective(new Map(savedPageEffective));
  };

  const handleReset = async () => {
    if (!user) return;
    if (tab === "fields" && isRep) return;
    const scope = tab === "fields" ? `"${page.label}" field` : "page";
    const warning = `Reset all ${scope} overrides for ${user.full_name}? Their access will revert to standard ${user.role} permissions.${isDirty ? "\n\nUnsaved changes will be discarded." : ""}`;
    if (!confirm(warning)) return;
    setSaving(true);
    try {
      if (tab === "fields") {
        await resetUserFieldAccess(user.id, pageKey);
        loadOverrides();
      } else {
        await resetUserPageAccess(user.id);
        loadPageOverrides();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (isDirty && !confirm("Discard unsaved changes and close?")) return;
    onClose();
  };

  const grouped = page.fields.reduce<Record<string, typeof page.fields>>(
    (acc, f) => {
      const g = f.group ?? "Other";
      (acc[g] ||= []).push(f);
      return acc;
    },
    {},
  );

  const busy = loading || pageLoading;
  // Only count overrides on admin-visible pages — hidden-page overrides
  // (mr_reports / import_rfc) aren't shown and aren't cleared by reset.
  const hasPageOverrides = VISIBLE_PAGE_ACCESS_CATALOG.some((p) =>
    pageSaved.has(p.key),
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-sm font-semibold">
                Access Overrides — {user.full_name}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Role: <span className="font-mono">{user.role}</span>
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b px-5 pt-2.5 shrink-0">
          {(["fields", "pages"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 -mb-px transition-colors",
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "pages" ? "Pages" : "Field Access"}
            </button>
          ))}
        </div>

        {/* ── PAGES TAB ── */}
        {tab === "pages" && (
          <>
            <div className="flex items-center justify-between gap-3 border-b px-5 py-2.5 shrink-0">
              <p className="text-[11px] text-muted-foreground">
                Checked = this user can open the page.
              </p>
              <button
                type="button"
                onClick={handleReset}
                disabled={busy || !hasPageOverrides}
                className={cn(
                  "inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium",
                  "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                  "disabled:opacity-40 disabled:cursor-not-allowed transition-colors",
                )}
                title="Delete all page overrides; revert to role defaults"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Apply Role Defaults
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {pageLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {VISIBLE_PAGE_ACCESS_CATALOG.map((p) => {
                    const checked = pageEffective.get(p.key) ?? false;
                    const isOverride = pageSaved.has(p.key);
                    const isDirtyRow = dirtyPages.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-muted/50",
                          isDirtyRow && "bg-blue-50 dark:bg-blue-950/30",
                          saving && "opacity-50 cursor-wait",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePage(p.key)}
                          disabled={saving}
                          className="h-4 w-4 rounded border-border accent-primary cursor-pointer disabled:cursor-not-allowed"
                        />
                        <span className="flex-1 text-xs">
                          {p.label}
                          {p.allowlist && (
                            <span
                              className="ml-1.5 text-[9px] uppercase tracking-wide text-amber-600 dark:text-amber-400"
                              title="Allowlist page — no role grants access by default"
                            >
                              allowlist
                            </span>
                          )}
                        </span>
                        {isDirtyRow && (
                          <span
                            className="text-[9px] font-bold text-blue-600 dark:text-blue-400"
                            title="Unsaved change"
                          >
                            ●
                          </span>
                        )}
                        {!isDirtyRow && isOverride && (
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-amber-500"
                            title="Override active (differs from role default)"
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── FIELD ACCESS TAB ── */}
        {tab === "fields" &&
          (isRep ? (
            <div className="flex-1 flex items-center justify-center p-12 text-center">
              <div className="space-y-2 max-w-sm">
                <Shield className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm font-semibold">
                  REP role uses standard role-based field access.
                </p>
                <p className="text-xs text-muted-foreground">
                  Per-user field overrides do not apply to representatives.
                  (Page access on the Pages tab still applies.)
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b px-5 py-2.5 shrink-0">
                <label className="text-xs font-medium text-muted-foreground">
                  Page:
                </label>
                <select
                  value={pageKey}
                  onChange={(e) =>
                    setPageKey(e.target.value as FieldAccessPageKey)
                  }
                  className="flex-1 h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {FIELD_ACCESS_CATALOG.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={loading || savedOverrides.size === 0}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium",
                    "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                    "disabled:opacity-40 disabled:cursor-not-allowed transition-colors",
                  )}
                  title="Delete all override rows for this page; revert to role defaults"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Apply Role Defaults
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-[11px] text-muted-foreground">
                      Checked = editable for this user. Unchecked = read-only.
                      Differences from the role default are marked with a dot.
                    </p>
                    {Object.entries(grouped).map(([groupName, fields]) => (
                      <div key={groupName} className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          {groupName}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {fields.map((f) => {
                            const checked = effective.get(f.key) ?? false;
                            const isOverride = savedOverrides.has(f.key);
                            const isDirtyField = dirtyFields.includes(f.key);
                            // Nested-gate UX for the dashboard's "Bulk Actions"
                            // group: the 6 per-button keys are inert when the
                            // master `bulk_select` is off (no row checkboxes
                            // → buttons can never reach the user anyway). The
                            // saved checked state is preserved; the row is
                            // visually disabled until the master is re-enabled.
                            const isBulkSubButton =
                              pageKey === "dashboard" &&
                              f.key.startsWith("bulk_") &&
                              f.key !== "bulk_select";
                            const masterBulkOn =
                              effective.get("bulk_select") ?? false;
                            const subDisabled =
                              isBulkSubButton && !masterBulkOn;
                            return (
                              <label
                                key={f.key}
                                className={cn(
                                  "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-muted/50",
                                  isDirtyField &&
                                    "bg-blue-50 dark:bg-blue-950/30",
                                  saving && "opacity-50 cursor-wait",
                                  subDisabled &&
                                    "opacity-40 cursor-not-allowed hover:bg-transparent",
                                )}
                                title={
                                  subDisabled
                                    ? "Enable 'Row Selection Checkboxes (master)' first to grant per-button access"
                                    : undefined
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleField(f.key)}
                                  disabled={saving || subDisabled}
                                  className="h-4 w-4 rounded border-border accent-primary cursor-pointer disabled:cursor-not-allowed"
                                />
                                <span className="flex-1 text-xs">
                                  {f.label}
                                </span>
                                {isDirtyField && (
                                  <span
                                    className="text-[9px] font-bold text-blue-600 dark:text-blue-400"
                                    title="Unsaved change"
                                  >
                                    ●
                                  </span>
                                )}
                                {!isDirtyField && isOverride && (
                                  <span
                                    className="h-1.5 w-1.5 rounded-full bg-amber-500"
                                    title="Override active (differs from role default)"
                                  />
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ))}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t px-5 py-3 shrink-0 bg-muted/30">
          <p
            className={cn(
              "text-[11px] tabular-nums",
              isDirty
                ? "text-blue-700 dark:text-blue-400 font-medium"
                : "text-muted-foreground",
            )}
          >
            {isDirty
              ? `${activeDirty.length} unsaved change${activeDirty.length === 1 ? "" : "s"}`
              : "No unsaved changes"}
          </p>
          <div className="flex items-center gap-2">
            {isDirty && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDiscard}
                disabled={saving}
              >
                Discard
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={saving}
            >
              {isDirty ? "Cancel" : "Close"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!isDirty || saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

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
} from "@/app/(dashboard)/admin/actions";
import {
  FIELD_ACCESS_CATALOG,
  type FieldAccessPageKey,
} from "@/lib/field-access-catalog";
import { canEditField, type UserRole } from "@/lib/roles";

// Per-page role-default resolver — mirrors lib/field-access.ts so the modal
// can show "what would the role default be" for each checkbox without an
// extra round trip.
function resolveRoleDefault(
  role: UserRole,
  pageKey: FieldAccessPageKey,
  fieldKey: string,
): boolean {
  switch (pageKey) {
    case "dashboard":
      return canEditField(role, fieldKey);
    default:
      return false;
  }
}

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
  const [pageKey, setPageKey] = useState<FieldAccessPageKey>(
    FIELD_ACCESS_CATALOG[0].key,
  );
  // Map of field_key → "user's effective edit setting"
  // Initialized from role defaults; mutated as the admin clicks checkboxes.
  // Persisted to user_field_access only when it diverges from the role default.
  const [effective, setEffective] = useState<Map<string, boolean>>(new Map());
  const [savedOverrides, setSavedOverrides] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [loading, startLoad] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const isRep = user?.role === "rep";
  const page = FIELD_ACCESS_CATALOG.find((p) => p.key === pageKey)!;

  const loadOverrides = useCallback(() => {
    if (!user) return;
    startLoad(async () => {
      const rows = await getUserFieldAccess(user.id, pageKey);
      const overridesMap = new Map<string, boolean>();
      for (const r of rows) overridesMap.set(r.field_key, r.can_edit);
      setSavedOverrides(overridesMap);
      // Build effective map: override > role default
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

  useEffect(() => {
    if (open) loadOverrides();
  }, [open, loadOverrides]);

  if (!open || !user) return null;

  const toggle = async (fieldKey: string) => {
    if (savingKey || isRep) return;
    const current = effective.get(fieldKey) ?? false;
    const next = !current;
    const roleDefault = resolveRoleDefault(user.role, pageKey, fieldKey);

    // Optimistic local update
    setEffective((prev) => {
      const m = new Map(prev);
      m.set(fieldKey, next);
      return m;
    });
    setSavingKey(fieldKey);

    try {
      // Persist as override unless the new value matches role default,
      // in which case clear the override row (cleaner DB).
      const persistValue: boolean | null =
        next === roleDefault ? null : next;
      await setUserFieldAccess(user.id, pageKey, fieldKey, persistValue);
      setSavedOverrides((prev) => {
        const m = new Map(prev);
        if (persistValue === null) m.delete(fieldKey);
        else m.set(fieldKey, persistValue);
        return m;
      });
    } catch {
      // Revert optimistic on failure
      setEffective((prev) => {
        const m = new Map(prev);
        m.set(fieldKey, current);
        return m;
      });
    } finally {
      setSavingKey(null);
    }
  };

  const handleResetPage = async () => {
    if (!user || isRep) return;
    if (
      !confirm(
        `Reset all "${page.label}" overrides for ${user.full_name}? Their access will revert to standard ${user.role} permissions for this page.`,
      )
    )
      return;
    await resetUserFieldAccess(user.id, pageKey);
    loadOverrides();
  };

  // Group fields by their `group` for display
  const grouped = page.fields.reduce<Record<string, typeof page.fields>>(
    (acc, f) => {
      const g = f.group ?? "Other";
      (acc[g] ||= []).push(f);
      return acc;
    },
    {},
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
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
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {isRep ? (
          /* REP role bypasses overrides entirely */
          <div className="flex-1 flex items-center justify-center p-12 text-center">
            <div className="space-y-2 max-w-sm">
              <Shield className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm font-semibold">
                REP role uses standard role-based access.
              </p>
              <p className="text-xs text-muted-foreground">
                Per-user overrides do not apply to representatives. Their
                access is managed entirely through their role definition.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Page selector + reset */}
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
                onClick={handleResetPage}
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

            {/* Body */}
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
                          const isBusy = savingKey === f.key;
                          return (
                            <label
                              key={f.key}
                              className={cn(
                                "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                                "hover:bg-muted/50",
                                isBusy && "opacity-50 cursor-wait",
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggle(f.key)}
                                disabled={isBusy}
                                className="h-4 w-4 rounded border-border accent-primary cursor-pointer disabled:cursor-not-allowed"
                              />
                              <span className="flex-1 text-xs">
                                {f.label}
                              </span>
                              {isOverride && (
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
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3 shrink-0 bg-muted/30">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

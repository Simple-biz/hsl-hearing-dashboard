"use client";

import { createContext, useContext } from "react";

// Effective per-page access for the current user, resolved server-side in
// the dashboard layout (role default + per-user overrides). Keyed by the
// same page keys used in PAGE_ACCESS. Consumed by the nav components so
// link visibility reflects admin page-access overrides.

const PageAccessContext = createContext<Record<string, boolean> | null>(null);

export function PageAccessProvider({
  value,
  children,
}: {
  value: Record<string, boolean>;
  children: React.ReactNode;
}) {
  return (
    <PageAccessContext.Provider value={value}>
      {children}
    </PageAccessContext.Provider>
  );
}

/**
 * Returns the resolved page-access map, or null if no provider is present
 * (callers fall back to role-based `canAccessPage` in that case).
 */
export function usePageAccess(): Record<string, boolean> | null {
  return useContext(PageAccessContext);
}

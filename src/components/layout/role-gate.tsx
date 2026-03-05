import { type UserRole } from "@/lib/roles";

interface RoleGateProps {
  children: React.ReactNode;
  allowed: UserRole[];
  userRole: UserRole;
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children if user has an allowed role.
 * Use for UI-level gating only — RLS handles data security at the DB level.
 */
export function RoleGate({
  children,
  allowed,
  userRole,
  fallback,
}: RoleGateProps) {
  if (!allowed.includes(userRole)) {
    return fallback ?? null;
  }
  return <>{children}</>;
}

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

/**
 * Get the current authenticated session.
 * Returns null if not authenticated.
 */
export async function getSession() {
  return getServerSession(authOptions);
}

/**
 * Require authentication — redirects to /login if not authenticated.
 * Use in server components and server actions.
 *
 * Usage:
 *   const session = await requireAuth()
 *   // session.user.id, session.user.role guaranteed to exist
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

/**
 * Require specific role(s) — redirects if user doesn't have permission.
 *
 * Usage:
 *   const session = await requireRole(['admin', 'manager'])
 */
export async function requireRole(allowedRoles: string[]) {
  const session = await requireAuth();
  if (!allowedRoles.includes(session.user.role)) {
    redirect("/");
  }
  return session;
}

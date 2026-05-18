import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { UserRole } from "@/lib/roles";
import { requireAuth } from "@/lib/session";
import { getUserPageAccessMap } from "@/lib/page-access";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  // Force password change redirect
  if (session.user.forcePasswordChange) {
    redirect("/change-password");
  }

  const userRole = (session.user.role || "staff") as UserRole;
  // Effective page access (role default + per-user overrides) — drives nav
  // link visibility. The actual route guards live in each page.tsx.
  const pageAccess = await getUserPageAccessMap(
    Number(session.user.id),
    userRole,
  );

  return (
    <DashboardShell
      userRole={userRole}
      userName={session.user.name || ""}
      userEmail={session.user.email || ""}
      pageAccess={pageAccess}
    >
      {children}
    </DashboardShell>
  );
}

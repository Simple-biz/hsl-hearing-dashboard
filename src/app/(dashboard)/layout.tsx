import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { UserRole } from "@/lib/roles";
import { requireAuth } from "@/lib/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  return (
    <DashboardShell
      userRole={(session.user.role || "staff") as UserRole}
      userName={session.user.name || ""}
      userEmail={session.user.email || ""}
    >
      {children}
    </DashboardShell>
  );
}

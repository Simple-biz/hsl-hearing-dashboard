import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { UserRole } from "@/lib/roles";
import { requireAuth } from "@/lib/session";
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

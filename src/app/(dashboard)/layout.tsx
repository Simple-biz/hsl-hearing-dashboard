import { cookies } from "next/headers";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { UserRole } from "@/lib/roles";
import { requireAuth } from "@/lib/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar:state")?.value === "true";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        userRole={session.user.role as UserRole}
        userName={session.user.name}
        userEmail={session.user.email}
      />
      <SidebarInset className="overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

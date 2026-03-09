"use client";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { UserRole } from "@/lib/roles";

interface Props {
  userRole: UserRole;
  userName: string;
  userEmail: string;
  children: React.ReactNode;
}

export function DashboardShell({
  userRole,
  userName,
  userEmail,
  children,
}: Props) {
  return (
    <SidebarProvider
      defaultOpen={false}
      style={{ "--sidebar-width": "16rem" } as React.CSSProperties}
    >
      <AppSidebar
        userRole={userRole}
        userName={userName}
        userEmail={userEmail}
      />
      <SidebarInset className="overflow-x-hidden min-w-0">
        <div className="flex min-w-0 flex-1 flex-col bg-background">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

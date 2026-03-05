import { fetchDashboardData } from "./actions";
import { requireAuth } from "@/lib/session";
import type { UserRole } from "@/lib/roles";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await requireAuth();
  const data = await fetchDashboardData();

  return (
    <DashboardClient
      hearings={data.hearings}
      representatives={data.representatives}
      mrTeams={data.mrTeams}
      configOptions={data.configOptions}
      repDocsAssignees={data.repDocsAssignees}
      repCounts={data.repCounts}
      nextUnassigned={data.nextUnassigned}
      userRole={session.user.role as UserRole}
    />
  );
}

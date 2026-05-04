import { fetchDashboardData, fetchHearingsPage } from "./actions";
import { requireAuth } from "@/lib/session";
import type { UserRole } from "@/lib/roles";
import { DashboardClient } from "./dashboard-client";
import { getUserFieldOverridesPlain } from "@/lib/field-access";

export default async function DashboardPage() {
  const session = await requireAuth();
  const data = await fetchDashboardData(session.user.role, session.user.email);

  const initialPage = await fetchHearingsPage({
    page: 1,
    pageSize: 100,
    userRole: session.user.role,
    userEmail: session.user.email,
  });

  // Per-user field-edit overrides — passed to the client so cells the
  // user can't edit render as read-only spans (no click target, no
  // optimistic-then-rollback flicker on permission denial).
  const fieldOverrides = await getUserFieldOverridesPlain(
    Number(session.user.id),
    "dashboard",
  );

  return (
    <DashboardClient
      initialHearings={initialPage.hearings}
      initialTotalFiltered={initialPage.totalFiltered}
      totalCount={data.totalCount}
      stats={data.stats}
      representatives={data.representatives}
      mrTeams={data.mrTeams}
      configOptions={data.configOptions}
      repDocsAssignees={data.repDocsAssignees}
      repCounts={data.repCounts}
      nextUnassigned={data.nextUnassigned}
      userRole={(session.user.role || "staff") as UserRole}
      userEmail={session.user.email || ""}
      userName={session.user.name || "Unknown"}
      userId={session.user.id}
      fieldOverrides={fieldOverrides}
    />
  );
}

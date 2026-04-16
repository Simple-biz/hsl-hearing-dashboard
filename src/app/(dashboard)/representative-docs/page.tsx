import { requireAuth } from "@/lib/session";
import { canAccessPage, type UserRole } from "@/lib/roles";
import { redirect } from "next/navigation";
import { RepresentativeDocsClient } from "./representative-docs-client";
import {
  fetchRepDocsPage,
  fetchRepDocsStats,
  fetchRepDocsAssignees,
  fetchOhoAssignees,
} from "./actions";

export default async function RepresentativeDocsPage() {
  const session = await requireAuth();
  const role = session.user.role as UserRole;

  if (!canAccessPage(role, "representative_docs", Number(session.user.id))) {
    redirect("/");
  }

  const [initialPage, stats, assignees, ohoAssignees] = await Promise.all([
    fetchRepDocsPage({ page: 1, pageSize: 100 }),
    fetchRepDocsStats(),
    fetchRepDocsAssignees(),
    fetchOhoAssignees(),
  ]);

  return (
    <RepresentativeDocsClient
      userRole={role}
      initialRecords={initialPage.records}
      initialTotalFiltered={initialPage.totalFiltered}
      initialStats={stats}
      assignees={assignees}
      ohoAssignees={ohoAssignees}
    />
  );
}

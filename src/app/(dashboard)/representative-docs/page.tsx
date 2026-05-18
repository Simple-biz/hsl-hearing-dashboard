import { requireAuth } from "@/lib/session";
import { type UserRole } from "@/lib/roles";
import { canUserAccessPage } from "@/lib/page-access";
import { redirect } from "next/navigation";
import { RepresentativeDocsClient } from "./representative-docs-client";
import {
  fetchRepDocsPage,
  fetchRepDocsStats,
  fetchRepDocsAssignees,
  fetchOhoAssignees,
} from "./actions";
import { getUserFieldOverridesPlain } from "@/lib/field-access";

export default async function RepresentativeDocsPage() {
  const session = await requireAuth();
  const role = session.user.role as UserRole;

  if (
    !(await canUserAccessPage(
      Number(session.user.id),
      role,
      "representative_docs",
    ))
  ) {
    redirect("/");
  }

  const [initialPage, stats, assignees, ohoAssignees, fieldOverrides] =
    await Promise.all([
      fetchRepDocsPage({ page: 1, pageSize: 100 }),
      fetchRepDocsStats(),
      fetchRepDocsAssignees(),
      fetchOhoAssignees(),
      getUserFieldOverridesPlain(
        Number(session.user.id),
        "representative_docs",
      ),
    ]);

  return (
    <RepresentativeDocsClient
      userRole={role}
      userName={session.user.name || "Unknown"}
      initialRecords={initialPage.records}
      initialTotalFiltered={initialPage.totalFiltered}
      initialStats={stats}
      assignees={assignees}
      ohoAssignees={ohoAssignees}
      fieldOverrides={fieldOverrides}
    />
  );
}

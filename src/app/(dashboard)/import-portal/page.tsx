import { requireRole } from "@/lib/session";
import { getPortalStats } from "./actions";
import { ImportPortalClient } from "./import-portal-client";

export default async function ImportPortalPage() {
  const session = await requireRole(["system_admin"]);

  const stats = await getPortalStats();

  return (
    <ImportPortalClient
      initialStats={stats}
      userRole={session.user.role}
      userName={session.user.name}
    />
  );
}

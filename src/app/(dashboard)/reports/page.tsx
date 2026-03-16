import { requireAuth } from "@/lib/session";
import type { UserRole } from "@/lib/roles";
import { getReportsData } from "./action";
import { ReportsClient } from "./reports";

export default async function ReportsPage() {
  const session = await requireAuth();
  const data = await getReportsData();

  return (
    <ReportsClient
      {...data}
      userRole={(session.user.role || "staff") as UserRole}
    />
  );
}

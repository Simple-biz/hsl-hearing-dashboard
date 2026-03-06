import { requireAuth } from "@/lib/session";
import type { UserRole } from "@/lib/roles";
import { getRepDashboardData } from "./action";
import { RepDashboardClient } from "./rep-dashboard-client";

export default async function RepDashboardPage() {
  const session = await requireAuth();
  const reps = await getRepDashboardData();

  return (
    <RepDashboardClient
      reps={reps}
      userRole={(session.user.role || "staff") as UserRole}
    />
  );
}

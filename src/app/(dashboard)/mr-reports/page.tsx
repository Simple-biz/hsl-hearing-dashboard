import { requireAuth } from "@/lib/session";
import type { UserRole } from "@/lib/roles";
import { canUserAccessPage } from "@/lib/page-access";
import { redirect } from "next/navigation";
import { getMrReportsData } from "./action";
import { MrReportsClient } from "./mr-reports-client";

export default async function MrReportsPage() {
  const session = await requireAuth();

  // MR Reports is an allowlist page — access only via an explicit per-user
  // grant (seeded from the old PAGE_USER_IDS), not by role.
  if (
    !(await canUserAccessPage(
      Number(session.user.id),
      (session.user.role || "staff") as UserRole,
      "mr_reports",
    ))
  ) {
    redirect("/");
  }

  const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const data = await getMrReportsData(currentMonth);

  return (
    <MrReportsClient
      {...data}
      initialMonth={currentMonth}
      userRole={(session.user.role || "staff") as UserRole}
    />
  );
}

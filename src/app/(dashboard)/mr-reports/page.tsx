import { requireAuth } from "@/lib/session";
import type { UserRole } from "@/lib/roles";
import { PAGE_USER_IDS } from "@/lib/roles";
import { redirect } from "next/navigation";
import { getMrReportsData } from "./action";
import { MrReportsClient } from "./mr-reports-client";

export default async function MrReportsPage() {
  const session = await requireAuth();

  // Restrict to allowed user IDs
  const allowedIds = PAGE_USER_IDS.mr_reports;
  if (allowedIds && !allowedIds.includes(session.user.id)) {
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

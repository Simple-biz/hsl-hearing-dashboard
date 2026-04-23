import { requireAuth } from "@/lib/session";
import { redirect } from "next/navigation";
import { PAGE_ACCESS } from "@/lib/roles";
import type { UserRole } from "./types";
import { getMrPivotPageData } from "./action";
import { MrPivotClient } from "./medical-records-client";

export default async function MedicalRecordsPage() {
  const session = await requireAuth();
  const userRole = (session.user.role ?? "mr_agent") as UserRole;

  // Server-side route protection — matches PAGE_ACCESS.medical_records in roles.ts
  // Allowed: system_admin | admin | manager | mr_admin | mr_lead | mr_agent
  if (!PAGE_ACCESS.medical_records.includes(userRole)) {
    redirect("/");
  }

  const data = await getMrPivotPageData(userRole);
  return (
    <MrPivotClient
      {...data}
      userRole={userRole}
      userName={session.user.name || "Unknown"}
    />
  );
}

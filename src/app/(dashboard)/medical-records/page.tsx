import { requireAuth } from "@/lib/session";
import { redirect } from "next/navigation";
import type { UserRole as RolesUserRole } from "@/lib/roles";
import { canUserAccessPage } from "@/lib/page-access";
import type { UserRole } from "./types";
import { getMrPivotPageData } from "./action";
import { MrPivotClient } from "./medical-records-client";

export default async function MedicalRecordsPage() {
  const session = await requireAuth();
  const userRole = (session.user.role ?? "mr_agent") as UserRole;

  // Server-side route protection — role default + per-user page overrides.
  if (
    !(await canUserAccessPage(
      Number(session.user.id),
      userRole as RolesUserRole,
      "medical_records",
    ))
  ) {
    redirect("/");
  }

  const data = await getMrPivotPageData(userRole, Number(session.user.id));
  return (
    <MrPivotClient
      {...data}
      userRole={userRole}
      userName={session.user.name || "Unknown"}
    />
  );
}

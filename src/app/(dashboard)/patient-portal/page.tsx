import { requireAuth } from "@/lib/session";
import { redirect } from "next/navigation";
import type { UserRole } from "@/lib/roles";
import { canUserAccessPage } from "@/lib/page-access";
import { getPortalPageData } from "./action";
import { PatientPortalClient } from "./patient-portal-client";

export const metadata = { title: "Patient Portal" };

export default async function PatientPortalPage() {
  const session = await requireAuth();
  const userRole = (session.user.role ?? "mr_agent") as UserRole;

  // Server-side route protection — role default + per-user page overrides.
  // Mirrors /rfc and /medical-records. Without this, the sidebar was the
  // only gate for /patient-portal and roles outside the default could still
  // URL-access the page.
  if (
    !(await canUserAccessPage(
      Number(session.user.id),
      userRole,
      "patient_portal",
    ))
  ) {
    redirect("/");
  }

  const data = await getPortalPageData();
  return <PatientPortalClient {...data} />;
}

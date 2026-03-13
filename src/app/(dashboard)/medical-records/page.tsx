import { requireAuth } from "@/lib/session";
import type { UserRole } from "./types";
import { getMrPivotPageData } from "./action";
import { MrPivotClient } from "./medical-records-client";

export default async function MedicalRecordsPage() {
  const session = await requireAuth();
  const userRole = (session.user.role || "post_hearing_staff") as UserRole;
  const data = await getMrPivotPageData(userRole);
  return <MrPivotClient {...data} userRole={userRole} />;
}

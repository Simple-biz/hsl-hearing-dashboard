import { requireAuth } from "@/lib/auth";
import { getPortalPageData } from "./action";
import { PatientPortalClient } from "./patient-portal-client";

export const metadata = { title: "Patient Portal" };

export default async function PatientPortalPage() {
  await requireAuth();
  const data = await getPortalPageData();
  return <PatientPortalClient {...data} />;
}

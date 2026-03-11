import { requireAuth } from "@/lib/session";
import { getMrPivotPageData } from "./action";
import { MrPivotClient } from "./medical-records-client";

export default async function MedicalRecordsPage() {
  await requireAuth();
  const data = await getMrPivotPageData();
  return <MrPivotClient {...data} />;
}

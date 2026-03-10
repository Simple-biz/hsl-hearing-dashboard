import { requireAuth } from "@/lib/session";
import { getReportsData } from "./action";
import { ReportsClient } from "./reports";

export default async function ReportsPage() {
  await requireAuth();

  const data = await getReportsData();

  return <ReportsClient {...data} />;
}

import { requireAuth } from "@/lib/session";
import { getReportsData } from "./action";
import { ReportsClient } from "./reports";

export default async function ReportsPage() {
  await requireAuth();
    let data;
    try {
      data = await getReportsData();
    } catch (e: unknown) {
      const err = e as Record<string, unknown>;
      console.error("=== REPORTS ERROR ===");
      console.error("message:", err?.message);
      console.error("code:",    err?.code);      // Postgres error code
      console.error("detail:",  err?.detail);    // Postgres detail
      console.error("query:",   err?.query);     // Which query failed
      console.error(e);
      throw e;
  }

  return <ReportsClient {...data} />;
}

import { requireAuth } from "@/lib/session";
import { ImportCompareClient } from "./import-compare-client";

export default async function ImportComparePage() {
  const session = await requireAuth();

  // Import Compare is system_admin only (matching PHP)
  if (session.user.role !== "system_admin" && session.user.role !== "admin") {
    const { redirect } = await import("next/navigation");
    redirect("/");
  }

  return <ImportCompareClient userRole={session.user.role} />;
}

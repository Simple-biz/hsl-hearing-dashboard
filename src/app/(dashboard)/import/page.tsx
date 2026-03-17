import { requireAuth } from "@/lib/session";
import { ImportClient } from "./import-client";

export default async function ImportPage() {
  const session = await requireAuth();

  // Import is system_admin only (matching PHP)
  if (session.user.role !== "system_admin" && session.user.role !== "admin") {
    const { redirect } = await import("next/navigation");
    redirect("/");
  }

  return <ImportClient userRole={session.user.role} />;
}

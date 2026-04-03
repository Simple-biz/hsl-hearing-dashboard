import { requireAuth } from "@/lib/session";
import { redirect } from "next/navigation";
import { canAccessPage } from "@/lib/roles";
import type { UserRole } from "@/lib/roles";
import { ImportRfcClient } from "./import-rfc-client";

export const metadata = { title: "Import RFC Data" };

export default async function ImportRfcPage() {
  const session = await requireAuth();
  const userRole = (session.user.role ?? "staff") as UserRole;
  const userId = session.user.id;

  if (!canAccessPage(userRole, "import_rfc", userId)) {
    redirect("/");
  }

  return <ImportRfcClient userRole={userRole} />;
}

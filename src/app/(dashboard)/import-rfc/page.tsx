import { requireAuth } from "@/lib/session";
import { redirect } from "next/navigation";
import type { UserRole } from "@/lib/roles";
import { canUserAccessPage } from "@/lib/page-access";
import { ImportRfcClient } from "./import-rfc-client";

export const metadata = { title: "Import RFC Data" };

export default async function ImportRfcPage() {
  const session = await requireAuth();
  const userRole = (session.user.role ?? "staff") as UserRole;
  const userId = Number(session.user.id);

  if (!(await canUserAccessPage(userId, userRole, "import_rfc"))) {
    redirect("/");
  }

  return <ImportRfcClient userRole={userRole} />;
}

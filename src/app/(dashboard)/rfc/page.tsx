import { requireAuth } from "@/lib/session";
import { redirect } from "next/navigation";
import type { UserRole } from "@/lib/roles";
import { canUserAccessPage } from "@/lib/page-access";
import type { RfcUserRole } from "./types";
import { getRfcPageData } from "./action";
import { RfcClient } from "./rfc-client";

export const metadata = { title: "RFC Documents" };

export default async function RfcPage() {
  const session = await requireAuth();
  const userRole = (session.user.role ?? "mr_agent") as RfcUserRole;

  // Server-side route protection — role default + per-user page overrides.
  if (
    !(await canUserAccessPage(
      Number(session.user.id),
      userRole as UserRole,
      "rfc",
    ))
  ) {
    redirect("/");
  }

  const data = await getRfcPageData(userRole);
  return <RfcClient {...data} />;
}

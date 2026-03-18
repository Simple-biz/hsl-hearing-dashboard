import { requireAuth } from "@/lib/session";
import { redirect } from "next/navigation";
import { PAGE_ACCESS } from "@/lib/roles";
import type { RfcUserRole } from "./types";
import { getRfcPageData } from "./action";
import { RfcClient } from "./rfc-client";

export const metadata = { title: "RFC Documents" };

export default async function RfcPage() {
  const session = await requireAuth();
  const userRole = (session.user.role ?? "mr_agent") as RfcUserRole;

  // Server-side route protection — matches PAGE_ACCESS.rfc in roles.ts
  // Allowed: system_admin | admin | manager | mr_admin | mr_lead | mr_agent
  if (!PAGE_ACCESS.rfc.includes(userRole)) {
    redirect("/");
  }

  const data = await getRfcPageData(userRole);
  return <RfcClient {...data} />;
}

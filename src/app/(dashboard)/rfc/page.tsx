import { requireAuth } from "@/lib/session";
import { getRfcPageData } from "./action";
import { RfcClient } from "./rfc-client";

export const metadata = { title: "RFC Documents" };

export default async function RfcPage() {
  await requireAuth();
  const data = await getRfcPageData();
  return <RfcClient {...data} />;
}

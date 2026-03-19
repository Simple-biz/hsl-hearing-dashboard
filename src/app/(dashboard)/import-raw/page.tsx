import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getRawHearingsStats } from "./actions";
import { ImportRawClient } from "./import-raw-client";

export default async function ImportRawPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const stats = await getRawHearingsStats();

  return (
    <ImportRawClient
      initialStats={stats}
      userRole={session.user.role}
      userName={session.user.name}
    />
  );
}

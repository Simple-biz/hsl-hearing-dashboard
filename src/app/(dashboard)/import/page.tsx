import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ImportClient } from "./import-client";

export default async function ImportPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role !== "system_admin" && session.user.id !== 1)
    redirect("/");

  return <ImportClient />;
}

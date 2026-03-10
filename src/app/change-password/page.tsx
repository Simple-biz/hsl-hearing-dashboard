import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const session = await getServerSession(authOptions);

  // Not logged in at all → go to login
  if (!session?.user) redirect("/login");

  const isForced = session.user.forcePasswordChange;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <ChangePasswordForm userName={session.user.name} isForced={isForced} />
    </div>
  );
}

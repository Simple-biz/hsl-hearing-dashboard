import { requireRole } from "@/lib/session";
import { getUsers } from "./actions";
import { AdminClient } from "./admin-client";

export default async function AdminPage() {
  const session = await requireRole(["system_admin", "admin", "manager"]);
  const users = await getUsers();
  return <AdminClient users={users} userRole={session.user.role} />;
}

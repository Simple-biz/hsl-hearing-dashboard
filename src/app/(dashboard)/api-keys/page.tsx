// API Keys admin — system_admin only. Server component that gates access
// and loads the initial key list, then hands off to the client UI.

import { requireRole } from "@/lib/session";
import { listApiKeys } from "./actions";
import { ApiKeysClient } from "./api-keys-client";

export default async function ApiKeysPage() {
  // Redirects non-system_admin users away from this page.
  await requireRole(["system_admin"]);
  const initialKeys = await listApiKeys();
  return <ApiKeysClient initialKeys={initialKeys} />;
}

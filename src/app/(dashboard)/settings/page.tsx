import { requireRole } from "@/lib/session";
import {
  getConfigOptions,
  getMrTeams,
  getFederalHolidays,
  getRepDocsAssignees,
  getOhoAssignees,
  getMrSpecialists,
  getUsers,
} from "@/app/(dashboard)/admin/actions";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const session = await requireRole([
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "mr_admin",
    "mr_lead",
  ]);

  const [
    configOptions,
    mrTeams,
    holidays,
    assignees,
    ohoAssignees,
    specialists,
    allUsers,
  ] = await Promise.all([
    getConfigOptions(),
    getMrTeams(),
    getFederalHolidays(),
    getRepDocsAssignees(),
    getOhoAssignees(),
    getMrSpecialists(),
    getUsers(),
  ]);

  // Only surface active users in the assignee-link picker — inactive accounts
  // shouldn't show up as new options, though existing links to them are still
  // resolved by the join in getRepDocsAssignees.
  const activeUsers = allUsers
    .filter((u) => u.is_active)
    .map((u) => ({ id: u.id, full_name: u.full_name, email: u.email }));

  return (
    <SettingsClient
      configOptions={configOptions}
      mrTeams={mrTeams}
      holidays={holidays}
      assignees={assignees}
      ohoAssignees={ohoAssignees}
      specialists={specialists}
      userRole={session.user.role}
      linkableUsers={activeUsers}
    />
  );
}

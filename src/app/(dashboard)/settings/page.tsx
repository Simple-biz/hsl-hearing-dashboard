import { requireRole } from "@/lib/session";
import {
  getConfigOptions,
  getMrTeams,
  getFederalHolidays,
  getRepDocsAssignees,
  getOhoAssignees,
  getMrSpecialists,
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
  ] = await Promise.all([
    getConfigOptions(),
    getMrTeams(),
    getFederalHolidays(),
    getRepDocsAssignees(),
    getOhoAssignees(),
    getMrSpecialists(),
  ]);

  return (
    <SettingsClient
      configOptions={configOptions}
      mrTeams={mrTeams}
      holidays={holidays}
      assignees={assignees}
      ohoAssignees={ohoAssignees}
      specialists={specialists}
      userRole={session.user.role}
    />
  );
}

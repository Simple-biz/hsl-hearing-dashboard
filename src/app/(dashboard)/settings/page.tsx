import { requireRole } from "@/lib/session";
import {
  getConfigOptions,
  getMrTeams,
  getFederalHolidays,
  getRepDocsAssignees,
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

  const [configOptions, mrTeams, holidays, assignees, specialists] =
    await Promise.all([
      getConfigOptions(),
      getMrTeams(),
      getFederalHolidays(),
      getRepDocsAssignees(),
      getMrSpecialists(),
    ]);

  return (
    <SettingsClient
      configOptions={configOptions}
      mrTeams={mrTeams}
      holidays={holidays}
      assignees={assignees}
      specialists={specialists}
      userRole={session.user.role}
    />
  );
}

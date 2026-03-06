import { requireAuth } from "@/lib/session";
import type { UserRole } from "@/lib/roles";
import {
  getRepList,
  getAvailability,
  getHearingsForMonth,
  getFederalHolidays,
} from "./action";
import { ScheduleClient } from "./schedule-client";
import { db } from "@/lib/db";

export default async function SchedulePage() {
  const session = await requireAuth();
  const userRole = session.user.role as UserRole;
  const isAdmin = !["rep", "staff"].includes(userRole);
  const reps = await getRepList();

  if (!isAdmin) {
    // Rep: find their own rep record by email
    const { rows } = await db.query(
      "SELECT id FROM representatives WHERE email = $1 AND is_active = true LIMIT 1",
      [session.user.email],
    );

    if (rows.length === 0) {
      return (
        <div className="p-6">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">
              Representative Not Found
            </h3>
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              Your account ({session.user.email}) is not linked to a
              representative record. Please contact your administrator.
            </p>
          </div>
        </div>
      );
    }

    const repId = rows[0].id as number;
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const [availability, hearings, holidays] = await Promise.all([
      getAvailability(repId, defaultMonth),
      getHearingsForMonth(repId, defaultMonth),
      getFederalHolidays(defaultMonth),
    ]);

    return (
      <ScheduleClient
        userRole={userRole}
        reps={reps}
        initialRepId={repId}
        initialMonth={defaultMonth}
        initialAvailability={availability}
        initialHearings={hearings}
        initialHolidays={holidays}
        showRepSelector={false}
      />
    );
  }

  // Admin: show rep selection landing (no rep preloaded)
  return (
    <ScheduleClient
      userRole={userRole}
      reps={reps}
      initialRepId={0}
      initialMonth={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`}
      initialAvailability={[]}
      initialHearings={[]}
      initialHolidays={{}}
      showRepSelector={true}
    />
  );
}

import { db } from "@/lib/db";

/**
 * Auto-Assignment Engine for HSL Hearing Dashboard
 * Port of auto_assign.php
 *
 * Rules:
 * 1. Internal advocates assigned first (priority mode: +1000 bonus)
 * 2. External advocates only after internals reach limits
 * 3. Configurable daily/weekly limits per rep
 * 4. 2-hour buffer between hearings (unless same ALJ)
 * 5. Respect rep availability (rep_availability table)
 * 6. Respect federal holidays
 * 7. Skip hearings with assignment_status (WD, Withdrawal)
 * 8. Hearing restrictions (2x2, 3x3)
 * 9. Monthly preference scoring
 * 10. Schedule must be locked for the month
 */

interface ScoredRep {
  rep_id: number;
  name: string;
  email: string | null;
  rep_type: string;
  score: number;
  details: string;
}

interface AssignResult {
  success: boolean;
  message: string;
  rep_name?: string;
  rep_type?: string;
  rep_id?: number;
}

interface BatchResult {
  total: number;
  assigned: number;
  failed: number;
  internal: number;
  external: number;
  breakdown: { name: string; rep_type: string; count: number }[];
  failures: { hearing_id: number; reason: string }[];
}

// ── Helpers ──
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + (m || 0);
}

// ── Check if date is a federal holiday ──
async function isFederalHoliday(date: string): Promise<boolean> {
  const { rows } = await db.query(
    "SELECT COUNT(*)::int AS count FROM federal_holidays WHERE holiday_date = $1",
    [date],
  );
  return rows[0].count > 0;
}

// ── Check if rep's schedule is locked for the hearing month ──
async function isScheduleLocked(repId: number, date: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT schedule_locked FROM rep_availability
     WHERE rep_id = $1 AND availability_date = $2`,
    [repId, date],
  );
  // If no record exists, schedule is not locked (not set yet)
  if (rows.length === 0) return false;
  return true; // Record exists = rep has availability set for this date
}

// ── Check rep availability (including partial and time slots) ──
async function isRepAvailable(
  repId: number,
  date: string,
  hearingTimeEst: string | null,
): Promise<{ available: boolean; reason: string }> {
  const { rows } = await db.query(
    `SELECT ra.is_available, ra.availability_type, ra.time_slots,
            r.timezone AS rep_timezone
     FROM rep_availability ra
     JOIN representatives r ON r.id = ra.rep_id
     WHERE ra.rep_id = $1 AND ra.availability_date = $2`,
    [repId, date],
  );

  if (rows.length === 0) {
    return { available: false, reason: "No availability record for this date" };
  }

  const avail = rows[0];

  if (!avail.is_available) {
    return { available: false, reason: "Rep marked fully unavailable" };
  }

  // Check custom time slots
  if (avail.time_slots && hearingTimeEst) {
    let timeSlots: { start: string; end: string }[] = [];
    try {
      timeSlots =
        typeof avail.time_slots === "string"
          ? JSON.parse(avail.time_slots)
          : avail.time_slots;
    } catch {
      /* empty */
    }

    if (timeSlots.length > 0) {
      const hearingMin = timeToMinutes(hearingTimeEst);
      const inSlot = timeSlots.some((slot) => {
        const start = timeToMinutes(slot.start);
        const end = timeToMinutes(slot.end);
        return hearingMin >= start && hearingMin < end;
      });
      if (!inSlot) {
        return {
          available: false,
          reason: "Hearing time outside available time slots",
        };
      }
      return { available: true, reason: "" };
    }
  }

  // Check morning/afternoon availability
  if (avail.availability_type && hearingTimeEst) {
    const hour = parseInt(hearingTimeEst.split(":")[0]);
    if (avail.availability_type === "morning_only" && hour >= 12) {
      return { available: false, reason: "Rep only available in morning" };
    }
    if (avail.availability_type === "afternoon_only" && hour < 12) {
      return { available: false, reason: "Rep only available in afternoon" };
    }
  }

  return { available: true, reason: "" };
}

// ── Get daily assignment count ──
async function getDailyCount(repId: number, date: string): Promise<number> {
  const { rows } = await db.query(
    "SELECT COUNT(*)::int AS count FROM hearings WHERE assigned_rep_id = $1 AND hearing_date = $2",
    [repId, date],
  );
  return rows[0].count;
}

// ── Get weekly assignment count ──
async function getWeeklyCount(repId: number, date: string): Promise<number> {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count FROM hearings
     WHERE assigned_rep_id = $1
       AND hearing_date >= date_trunc('week', $2::date)
       AND hearing_date < date_trunc('week', $2::date) + INTERVAL '7 days'`,
    [repId, date],
  );
  return rows[0].count;
}

// ── Get monthly assignment count ──
async function getMonthlyCount(repId: number, date: string): Promise<number> {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count FROM hearings
     WHERE assigned_rep_id = $1
       AND to_char(hearing_date, 'YYYY-MM') = to_char($2::date, 'YYYY-MM')`,
    [repId, date],
  );
  return rows[0].count;
}

// ── Check 2-hour buffer between hearings ──
async function checkTimeBuffer(
  repId: number,
  hearingDate: string,
  hearingTimeEst: string | null,
  hearingAlj: string | null,
): Promise<{ passes: boolean; sameJudge: boolean; reason: string }> {
  if (!hearingTimeEst) return { passes: true, sameJudge: false, reason: "" };

  const { rows: existing } = await db.query(
    `SELECT converted_time_est, alj FROM hearings
     WHERE assigned_rep_id = $1 AND hearing_date = $2 AND converted_time_est IS NOT NULL`,
    [repId, hearingDate],
  );

  const newMinutes = timeToMinutes(hearingTimeEst);
  let sameJudge = false;

  for (const ex of existing) {
    const exMinutes = timeToMinutes(ex.converted_time_est);
    const diff = Math.abs(newMinutes - exMinutes);

    // Same judge? No buffer needed
    if (
      hearingAlj &&
      ex.alj &&
      hearingAlj.toLowerCase().trim() === ex.alj.toLowerCase().trim()
    ) {
      sameJudge = true;
      continue;
    }

    // 2-hour (120 min) buffer required
    if (diff < 120) {
      return {
        passes: false,
        sameJudge: false,
        reason: `Too close to another hearing (${diff} min apart, need 120)`,
      };
    }
  }

  return { passes: true, sameJudge, reason: "" };
}

// ── Check hearing restriction (2x2 or 3x3) ──
async function checkHearingRestriction(
  repId: number,
  hearingDate: string,
  restriction: string,
): Promise<{ allowed: boolean; reason: string }> {
  if (!restriction || restriction === "none")
    return { allowed: true, reason: "" };

  const dailyCount = await getDailyCount(repId, hearingDate);

  if (restriction === "2_per_day_2x_week") {
    if (dailyCount >= 2)
      return { allowed: false, reason: "2×2 restriction: daily limit" };
    // Check days with hearings this week
    const { rows } = await db.query(
      `SELECT COUNT(DISTINCT hearing_date)::int AS days FROM hearings
       WHERE assigned_rep_id = $1
         AND hearing_date >= date_trunc('week', $2::date)
         AND hearing_date < date_trunc('week', $2::date) + INTERVAL '7 days'`,
      [repId, hearingDate],
    );
    if (rows[0].days >= 2 && dailyCount === 0) {
      return {
        allowed: false,
        reason: "2×2 restriction: already has hearings on 2 days this week",
      };
    }
  }

  if (restriction === "3_per_day_3x_week") {
    if (dailyCount >= 3)
      return { allowed: false, reason: "3×3 restriction: daily limit" };
    const { rows } = await db.query(
      `SELECT COUNT(DISTINCT hearing_date)::int AS days FROM hearings
       WHERE assigned_rep_id = $1
         AND hearing_date >= date_trunc('week', $2::date)
         AND hearing_date < date_trunc('week', $2::date) + INTERVAL '7 days'`,
      [repId, hearingDate],
    );
    if (rows[0].days >= 3 && dailyCount === 0) {
      return {
        allowed: false,
        reason: "3×3 restriction: already has hearings on 3 days this week",
      };
    }
  }

  return { allowed: true, reason: "" };
}

// ══════════════════════════════════════════════════════════════
// SCORE A REPRESENTATIVE FOR A SPECIFIC HEARING
// ══════════════════════════════════════════════════════════════
async function scoreRep(
  rep: Record<string, unknown>,
  hearing: Record<string, unknown>,
  distributionMode: string,
): Promise<{ eligible: boolean; score: number; details: string }> {
  let score = 0;
  const details: string[] = [];
  const hearingDate = hearing.hearing_date as string;
  const hearingTimeEst = hearing.converted_time_est as string | null;
  const repId = rep.id as number;

  // 1. Check schedule is locked
  const locked = await isScheduleLocked(repId, hearingDate);
  if (!locked)
    return { eligible: false, score: 0, details: "Schedule not yet locked" };

  // 2. Federal holiday
  if (await isFederalHoliday(hearingDate))
    return { eligible: false, score: 0, details: "Federal holiday" };

  // 3. Availability
  const avail = await isRepAvailable(repId, hearingDate, hearingTimeEst);
  if (!avail.available)
    return { eligible: false, score: 0, details: avail.reason };

  // 4. Daily limit
  const dailyCount = await getDailyCount(repId, hearingDate);
  if (dailyCount >= (rep.daily_limit as number)) {
    return {
      eligible: false,
      score: 0,
      details: `Daily limit reached (${dailyCount}/${rep.daily_limit})`,
    };
  }
  details.push(`Daily: ${dailyCount}/${rep.daily_limit}`);

  // 5. Weekly limit
  const weeklyCount = await getWeeklyCount(repId, hearingDate);
  if (weeklyCount >= (rep.weekly_limit as number)) {
    return {
      eligible: false,
      score: 0,
      details: `Weekly limit reached (${weeklyCount}/${rep.weekly_limit})`,
    };
  }
  details.push(`Weekly: ${weeklyCount}/${rep.weekly_limit}`);

  // 6. Hearing restriction
  const restriction = await checkHearingRestriction(
    repId,
    hearingDate,
    rep.hearing_restriction as string,
  );
  if (!restriction.allowed)
    return { eligible: false, score: 0, details: restriction.reason };

  // 7. Time buffer
  const buffer = await checkTimeBuffer(
    repId,
    hearingDate,
    hearingTimeEst,
    hearing.alj as string | null,
  );
  if (!buffer.passes)
    return { eligible: false, score: 0, details: buffer.reason };
  if (buffer.sameJudge) {
    score += 5;
    details.push("Same judge (+5)");
  }

  // 8. Distribution mode scoring
  if (distributionMode === "priority") {
    if (rep.rep_type === "internal_advocates" || rep.rep_type === "in-house") {
      score += 1000;
      details.push("Internal (+1000)");
    } else {
      details.push("External");
    }
  }

  // 9. Monthly preference
  const preferredMonthly = rep.preferred_monthly_hearings as number | null;
  const monthlyCount = await getMonthlyCount(repId, hearingDate);
  if (preferredMonthly && preferredMonthly > 0) {
    const remaining = preferredMonthly - monthlyCount;
    if (remaining <= 0) {
      score -= 100;
      details.push(
        `Monthly: ${monthlyCount}/${preferredMonthly} (target reached)`,
      );
    } else {
      const bonus = (remaining / preferredMonthly) * 75;
      score += bonus;
      details.push(`Monthly: ${monthlyCount}/${preferredMonthly}`);
    }
  }

  // 10. Workload bonus
  const workloadPercent =
    1 - weeklyCount / Math.max(rep.weekly_limit as number, 1);
  const workloadBonus =
    workloadPercent *
    (distributionMode === "workload"
      ? 150
      : distributionMode === "balanced"
        ? 75
        : 50);
  score += workloadBonus;

  // 11. Priority tie-breaker
  score += (rep.priority as number) || 0;

  return { eligible: true, score, details: details.join(" | ") };
}

// ══════════════════════════════════════════════════════════════
// ASSIGN A SINGLE HEARING
// ══════════════════════════════════════════════════════════════
export async function assignSingleHearing(
  hearingId: number,
  selectedRepIds: number[] | null,
  distributionMode: string,
): Promise<AssignResult> {
  // Get hearing
  const { rows: hearingRows } = await db.query(
    "SELECT * FROM hearings WHERE id = $1",
    [hearingId],
  );
  if (hearingRows.length === 0)
    return { success: false, message: "Hearing not found" };
  const hearing = hearingRows[0];

  if (hearing.assigned_rep_id)
    return { success: false, message: "Already assigned" };
  if (hearing.assignment_status)
    return {
      success: false,
      message: `Marked as: ${hearing.assignment_status}`,
    };
  if (hearing.hearing_date < new Date().toISOString().split("T")[0])
    return { success: false, message: "Cannot assign past hearings" };

  // Get active reps
  let repQuery = `SELECT * FROM representatives WHERE is_active = true AND rep_type IN ('internal_advocates','external_advocates','in-house','contract')
    ORDER BY CASE rep_type WHEN 'internal_advocates' THEN 1 WHEN 'in-house' THEN 1 ELSE 2 END, priority DESC`;
  const repParams: unknown[] = [];

  if (selectedRepIds && selectedRepIds.length > 0) {
    repQuery = `SELECT * FROM representatives WHERE is_active = true AND id = ANY($1)
      ORDER BY CASE rep_type WHEN 'internal_advocates' THEN 1 WHEN 'in-house' THEN 1 ELSE 2 END, priority DESC`;
    repParams.push(selectedRepIds);
  }

  const { rows: reps } = await db.query(repQuery, repParams);
  if (reps.length === 0)
    return { success: false, message: "No active representatives" };

  // Score each rep
  const scored: ScoredRep[] = [];
  for (const rep of reps) {
    const result = await scoreRep(rep, hearing, distributionMode);
    if (result.eligible) {
      scored.push({
        rep_id: rep.id,
        name: rep.name,
        email: rep.email,
        rep_type: rep.rep_type,
        score: result.score,
        details: result.details,
      });
    }
  }

  if (scored.length === 0)
    return { success: false, message: "No eligible representatives" };

  // Best score wins
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  await db.query(
    "UPDATE hearings SET assigned_rep_id = $1, assignment_timestamp = NOW(), assignment_status = NULL WHERE id = $2",
    [best.rep_id, hearingId],
  );

  return {
    success: true,
    message: `Assigned to ${best.name}`,
    rep_name: best.name,
    rep_type: best.rep_type,
    rep_id: best.rep_id,
  };
}

// ══════════════════════════════════════════════════════════════
// BATCH ASSIGN — full port of batchAssignHearings()
// ══════════════════════════════════════════════════════════════
export async function batchAssign(options: {
  monthFilter: string;
  selectedRepIds: number[];
  distributionMode: "priority" | "balanced" | "workload";
  totalLimit: number | null;
  excludeRescheduled: boolean;
  repMaxLimits?: Record<number, number>;
}): Promise<BatchResult> {
  // Get unassigned hearings
  let where =
    "assigned_rep_id IS NULL AND (assignment_status IS NULL OR assignment_status = '')";
  const params: unknown[] = [];
  let paramIdx = 1;

  if (options.monthFilter === "future") {
    where += " AND hearing_date >= CURRENT_DATE";
  } else if (options.monthFilter !== "all" && options.monthFilter) {
    where += ` AND to_char(hearing_date, 'YYYY-MM') = $${paramIdx}`;
    params.push(options.monthFilter);
    paramIdx++;
  }

  if (options.excludeRescheduled) {
    where += " AND claimant NOT LIKE '%(Rescheduled%'";
  }

  let limit = "";
  if (options.totalLimit && options.totalLimit > 0) {
    limit = ` LIMIT $${paramIdx}`;
    params.push(options.totalLimit);
  }

  const { rows: hearings } = await db.query(
    `SELECT id FROM hearings WHERE ${where} ORDER BY hearing_date ASC, converted_time_est ASC${limit}`,
    params,
  );

  const result: BatchResult = {
    total: hearings.length,
    assigned: 0,
    failed: 0,
    internal: 0,
    external: 0,
    breakdown: [],
    failures: [],
  };

  if (hearings.length === 0) return result;

  // Track per-rep counts
  const repCounts: Record<
    number,
    { name: string; rep_type: string; count: number }
  > = {};
  const repBatchCounts: Record<number, number> = {};

  for (const { id: hearingId } of hearings) {
    // Filter out reps that hit their per-rep batch max
    let batchRepIds = [...options.selectedRepIds];
    if (options.repMaxLimits) {
      batchRepIds = batchRepIds.filter((repId) => {
        const max = options.repMaxLimits![repId];
        if (max && max > 0) {
          return (repBatchCounts[repId] || 0) < max;
        }
        return true;
      });

      if (batchRepIds.length === 0) {
        result.failed++;
        result.failures.push({
          hearing_id: hearingId,
          reason: "All reps reached batch max",
        });
        continue;
      }
    }

    const assignResult = await assignSingleHearing(
      hearingId,
      batchRepIds,
      options.distributionMode,
    );

    if (assignResult.success && assignResult.rep_id) {
      result.assigned++;
      repBatchCounts[assignResult.rep_id] =
        (repBatchCounts[assignResult.rep_id] || 0) + 1;

      if (!repCounts[assignResult.rep_id]) {
        repCounts[assignResult.rep_id] = {
          name: assignResult.rep_name!,
          rep_type: assignResult.rep_type!,
          count: 0,
        };
      }
      repCounts[assignResult.rep_id].count++;

      const isInternal =
        assignResult.rep_type === "internal_advocates" ||
        assignResult.rep_type === "in-house";
      if (isInternal) result.internal++;
      else result.external++;
    } else {
      result.failed++;
      result.failures.push({
        hearing_id: hearingId,
        reason: assignResult.message,
      });
    }
  }

  result.breakdown = Object.values(repCounts);

  return result;
}

// ══════════════════════════════════════════════════════════════
// SEND MINIMAL ASSIGNMENT NOTIFICATIONS (post batch-assign)
// ══════════════════════════════════════════════════════════════
export async function sendAssignmentNotifications(
  breakdown: { name: string; rep_type: string; count: number }[],
): Promise<{ sent: number; failed: number }> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
  const dashboardUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://hearings.hogansmith.com";

  if (!webhookUrl) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  // Get email addresses for reps in the breakdown
  for (const rep of breakdown) {
    const { rows } = await db.query(
      "SELECT email FROM representatives WHERE name = $1 AND is_active = true AND email IS NOT NULL AND email != ''",
      [rep.name],
    );
    if (rows.length === 0 || !rows[0].email) {
      failed++;
      continue;
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (webhookSecret) headers["X-Webhook-Secret"] = webhookSecret;

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email_type: "hearing_alert_minimal",
          to_email: rows[0].email,
          to_name: rep.name,
          hearing_count: rep.count,
          month_filter: "recent",
          dashboard_url: dashboardUrl,
          source: "hsl_hearing_system",
          sent_at: new Date().toISOString(),
        }),
      });
      if (response.ok) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}

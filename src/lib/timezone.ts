// Timezone conversion — replaces PHP convertToEST() from config.php

const TIMEZONE_MAP: Record<string, string> = {
  ET: "America/New_York",
  CT: "America/Chicago",
  MT: "America/Denver",
  PT: "America/Los_Angeles",
  HA: "Pacific/Honolulu",
  MSTA: "America/Denver", // Mountain Standard Time Arizona
};

/**
 * Convert a time string from its source timezone to Eastern Time
 * Replaces the PHP convertToEST() function
 */
export function convertToEST(time: string, timezone: string): string {
  const tz = TIMEZONE_MAP[timezone];
  if (!tz) return time;

  try {
    // Create a date with the time in the source timezone
    const today = new Date().toISOString().split("T")[0];
    const sourceDate = new Date(`${today}T${time}`);

    // Use Intl.DateTimeFormat to convert
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    // Adjust for source timezone offset
    const sourceFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const sourceTime = sourceFormatter.format(sourceDate);
    const estTime = formatter.format(sourceDate);

    // Calculate offset
    const [sH, sM] = sourceTime.split(":").map(Number);
    const [eH, eM] = estTime.split(":").map(Number);
    const [tH, tM] = time.split(":").map(Number);

    const offsetMinutes = eH * 60 + eM - (sH * 60 + sM);
    const totalMinutes = tH * 60 + tM + offsetMinutes;

    const resultH = Math.floor((((totalMinutes % 1440) + 1440) % 1440) / 60);
    const resultM = ((totalMinutes % 60) + 60) % 60;

    return `${String(resultH).padStart(2, "0")}:${String(resultM).padStart(2, "0")}:00`;
  } catch {
    return time;
  }
}

/**
 * Convert a stored Eastern-Time wall-clock time (`converted_time_est`) into
 * the rep's selected timezone for display. Pure formatter — does not mutate
 * any DB column.
 *
 * The system stores hearings as `converted_time_est` (EST/EDT wall clock) for
 * historical reasons. The schedule view lets reps in other zones see the
 * same hearings translated into their local time, e.g. a 10:00 ET hearing
 * shown as 07:00 PT. Uses the hearing's actual date so DST transitions
 * resolve correctly.
 *
 * Returns "HH:MM" (24-hour). Returns the input untouched if anything fails.
 */
export function convertTimeFromEST(
  estTime: string | null | undefined,
  hearingDate: string | null | undefined,
  targetTz: string,
): string {
  if (!estTime) return "";
  const fallback = estTime.slice(0, 5);
  if (!hearingDate || !targetTz || targetTz === "America/New_York") {
    return fallback;
  }

  const [hStr, mStr] = estTime.split(":");
  const hh = Number(hStr);
  const mm = Number(mStr);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return fallback;

  try {
    // Anchor the wall-clock time as if it were UTC, then walk it back to find
    // the actual UTC instant that Eastern would call hh:mm on hearingDate.
    const anchor = new Date(
      `${hearingDate}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`,
    );
    if (Number.isNaN(anchor.getTime())) return fallback;

    const easternParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(anchor);
    const [eH, eM] = easternParts.split(":").map(Number);
    if (Number.isNaN(eH) || Number.isNaN(eM)) return fallback;

    const offsetMin = (hh * 60 + mm) - (eH * 60 + eM);
    const realUtc = new Date(anchor.getTime() + offsetMin * 60_000);

    return new Intl.DateTimeFormat("en-US", {
      timeZone: targetTz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(realUtc);
  } catch {
    return fallback;
  }
}

/**
 * Format SSN — store only last 4 digits
 * Replaces PHP formatSSN() from config.php
 */
export function formatSSN(ssn: string): string {
  const digits = ssn.replace(/\D/g, "");
  if (digits.length >= 4) {
    return digits.slice(-4);
  }
  return digits;
}

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

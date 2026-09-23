/**
 * The 20th of the month, two months before the target scheduling month --
 * e.g. September 20 for a November schedule.
 *
 * Single source of truth for the rep schedule submission deadline. Adopted
 * 2026-09 after the rep-facing pages (which used "45 days before the 1st
 * of the month") and the auto-lock/schedule-reminder crons (which used
 * this 20th-of-M-2 rule) drifted apart -- both were consistent at the
 * original build (2026-03-05), until a later commit changed only the cron
 * side, and the two started disagreeing by a few days depending on the
 * month. This rule was kept as the standard since it lands on the same
 * day of the month every time, unlike the 45-day count which shifts with
 * month lengths.
 *
 * No DB import here on purpose -- this needs to be safely importable from
 * both server code and client components without pulling server-only
 * dependencies into the client bundle.
 */
export function getScheduleDeadline(yearMonth: string): Date {
  const [year, month] = yearMonth.split("-").map(Number);
  const deadlineMonth = month - 2;
  const deadlineYear = deadlineMonth <= 0 ? year - 1 : year;
  const adjustedMonth = deadlineMonth <= 0 ? deadlineMonth + 12 : deadlineMonth;
  return new Date(deadlineYear, adjustedMonth - 1, 20);
}

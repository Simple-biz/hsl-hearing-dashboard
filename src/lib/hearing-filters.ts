// Shared SQL fragment for excluding withdrawn hearings from rep-facing
// queries (rep schedule calendar, hearing reminders, etc.).
//
// "Withdrawn" is represented two ways on the `hearings` table:
//   - assignment_status (enum): 'withdrawal' | 'wd_never_assigned'
//   - hearing_decision_status (text): starts with 'Withdrawal'
//       e.g. "Withdrawal - Claimant", "Withdrawal - Claimant Deceased"
//
// This mirrors the canonical rep-view exclusion inlined in the dashboard
// `repFilter` ((dashboard)/actions.tsx). Centralizing it here keeps the two
// scheduling/reminder call sites consistent with that rule.
//
// Edge cases handled:
//   - NULL status        → treated as NOT withdrawn (kept)
//   - empty-string status → treated as NOT withdrawn (kept)
//   - the two withdrawal assignment_status values → excluded
//   - any "Withdrawal%" decision status → excluded
//
// Note: the decision-status match is case-sensitive ('Withdrawal%'), matching
// the existing canonical filter and the stored data's capitalization.
//
// `alias` is the table alias used in the calling query (e.g. "h"). Pass an
// empty string when the query has no alias. It is developer-supplied (never
// user input), so there is no injection surface.
export function excludeWithdrawnSql(alias = "h"): string {
  const p = alias ? `${alias}.` : "";
  return (
    `(${p}assignment_status IS NULL OR ${p}assignment_status NOT IN ('withdrawal', 'wd_never_assigned'))` +
    ` AND (${p}hearing_decision_status IS NULL OR ${p}hearing_decision_status = '' OR ${p}hearing_decision_status NOT LIKE 'Withdrawal%')`
  );
}

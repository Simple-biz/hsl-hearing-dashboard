// ─── Field Access Catalog ─────────────────────────────────────────────────────
//
// Per-page enumeration of editable fields shown in the per-user "Access"
// modal in admin. Each entry = one row of checkboxes the admin sees when
// they pick a page from the dropdown.
//
// Phase 1 ships with the dashboard only. Add more pages in subsequent
// phases by appending to FIELD_ACCESS_CATALOG.
//
// The role defaults for each field are NOT defined here — they live in
// `src/lib/roles.ts` (EDITABLE_FIELDS for dashboard, MR_PIVOT_EDITABLE for
// the MR pivot, etc.). The override layer reads role defaults from those
// canonical sources.

export type FieldAccessPageKey =
  | "dashboard"
  // | "medical_records"   // phase 2
  // | "post_hrg"          // phase 2
  // | "rfc"               // phase 2
  // | "patient_portal"    // phase 2
  // | "representative_docs" // phase 2
  ;

export interface FieldAccessField {
  /** DB-level field key — must match what server-side gate uses. */
  key: string;
  /** User-facing label shown in the admin Access modal. */
  label: string;
  /** Optional grouping label, future-proofing for grouped checkboxes. */
  group?: string;
}

export interface FieldAccessPage {
  key: FieldAccessPageKey;
  label: string;
  fields: FieldAccessField[];
}

export const FIELD_ACCESS_CATALOG: FieldAccessPage[] = [
  {
    key: "dashboard",
    label: "Dashboard (Hearings)",
    fields: [
      // — Hearings team —
      {
        key: "assigned_rep_id",
        label: "Representative Assignment",
        group: "Hearings",
      },
      { key: "assignment_status", label: "Assignment Status", group: "Hearings" },
      { key: "phi_sheet_complete", label: "PHI Sheet", group: "Hearings" },
      { key: "manner_of_appearance", label: "MOA", group: "Hearings" },
      { key: "hearing_decision_status", label: "Decision Status", group: "Hearings" },
      { key: "claimant_link", label: "Claimant Link", group: "Hearings" },
      { key: "chronicle_link", label: "Chronicle Link", group: "Hearings" },
      { key: "ovh_link", label: "OVH Link", group: "Hearings" },
      // — Rep Docs / Brief —
      { key: "rep_docs_complete", label: "Rep Docs Complete", group: "Rep Docs" },
      {
        key: "rep_docs_assigned_to",
        label: "Rep Docs Assigned To",
        group: "Rep Docs",
      },
      {
        key: "fee_agreement_complete",
        label: "Fee Agreement Complete",
        group: "Rep Docs",
      },
      { key: "brief_assigned_to", label: "Brief Assigned To", group: "Rep Docs" },
      // — MR team —
      { key: "mr_team_id", label: "MR Team", group: "MR" },
      { key: "medical_record_status", label: "MR Status", group: "MR" },
      { key: "medical_record_link", label: "MR Worksheet Link", group: "MR" },
      { key: "rfc_status", label: "RFC Status", group: "MR" },
      { key: "five_day_notice", label: "5-Day Notice", group: "MR" },
      { key: "task_assigned", label: "Task Assigned", group: "MR" },
      // — Post HRG —
      { key: "post_hrg_review", label: "Post HRG Review", group: "Post HRG" },
      { key: "post_hrg_deadline", label: "Post HRG Deadline", group: "Post HRG" },
      { key: "post_hrg_notes", label: "Post HRG Notes", group: "Post HRG" },
      {
        key: "post_hrg_dev_status",
        label: "Post HRG Dev Status",
        group: "Post HRG",
      },
    ],
  },
];

export function getCatalogPage(
  pageKey: FieldAccessPageKey,
): FieldAccessPage | undefined {
  return FIELD_ACCESS_CATALOG.find((p) => p.key === pageKey);
}

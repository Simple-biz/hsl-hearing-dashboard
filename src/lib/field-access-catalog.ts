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
  | "medical_records"
  | "post_hrg_development"
  | "representative_docs";
  // | "rfc"               // future
  // | "patient_portal"    // future

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
  // ── Medical Records (MR Pivot) ────────────────────────────────────────
  // Per-field whitelists already exist in MR_PIVOT_EDITABLE — see roles.ts.
  {
    key: "medical_records",
    label: "Medical Records (MR Pivot)",
    fields: [
      { key: "mr_team_id", label: "MR Team Assignment" },
      { key: "medical_record_status", label: "MR Status" },
      { key: "medical_record_link", label: "MR Worksheet Link" },
      { key: "hearing_decision_status", label: "Decision Status" },
      { key: "manner_of_appearance", label: "MOA" },
      { key: "five_day_notice", label: "5-Day Notice" },
      { key: "claimant_link", label: "Claimant Link" },
      { key: "task_assigned", label: "Task Assigned" },
      { key: "credited", label: "Credited" },
    ],
  },
  // ── Post HRG Development ───────────────────────────────────────────────
  // Today: page-level access only — anyone on the page can edit anything.
  // The override layer adds per-user, per-field control.
  {
    key: "post_hrg_development",
    label: "Post HRG Development",
    fields: [
      { key: "indicator", label: "Indicator", group: "Status" },
      { key: "type_of_docs_needed", label: "Docs Needed", group: "Status" },
      { key: "person_responsible", label: "Responsible", group: "Status" },
      {
        key: "em_sent_task_created",
        label: "EM / Task Created",
        group: "Status",
      },
      { key: "ext_letter_sent", label: "EXT Letter Sent", group: "Status" },
      { key: "status", label: "Status", group: "Status" },
      { key: "deadline", label: "Deadline", group: "Dates" },
      { key: "new_due_date", label: "New Due Date", group: "Dates" },
      { key: "requirements", label: "Requirements", group: "Notes" },
      { key: "remarks", label: "Remarks", group: "Notes" },
      { key: "details", label: "Details", group: "Notes" },
    ],
  },
  // ── Representative Docs ────────────────────────────────────────────────
  // Today: page-level access only.
  {
    key: "representative_docs",
    label: "Representative Docs",
    fields: [
      { key: "assigned_to", label: "Assigned To", group: "Assignment" },
      { key: "oho_assigned_to", label: "OHO Assigned To", group: "Assignment" },
      { key: "overall_status", label: "Overall Status", group: "Assignment" },
      { key: "uploaded_noh", label: "Uploaded NOH", group: "Workflow" },
      {
        key: "sent_repdocs_to_cl",
        label: "Sent RepDocs to CL",
        group: "Workflow",
      },
      { key: "repdocs_signed", label: "RepDocs Signed", group: "Workflow" },
      { key: "contact_ltr", label: "Contact Letter", group: "Workflow" },
      { key: "repdocs_split", label: "RepDocs Split", group: "Workflow" },
      {
        key: "repdocs_uploaded_chronicle",
        label: "Uploaded to Chronicle",
        group: "Workflow",
      },
      {
        key: "oho_confirmation",
        label: "OHO Confirmation",
        group: "Workflow",
      },
      { key: "checker_calendar", label: "Checker — Calendar", group: "Checker" },
      {
        key: "checker_chronicle_claim",
        label: "Checker — Chronicle / Claim",
        group: "Checker",
      },
      { key: "checker_noh", label: "Checker — NOH", group: "Checker" },
      {
        key: "checker_contact_ltr",
        label: "Checker — Contact Letter",
        group: "Checker",
      },
    ],
  },
];

export function getCatalogPage(
  pageKey: FieldAccessPageKey,
): FieldAccessPage | undefined {
  return FIELD_ACCESS_CATALOG.find((p) => p.key === pageKey);
}

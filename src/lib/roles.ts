// HSL Hearing Dashboard - Role Permission Matrix
// Maps all 13 roles to their allowed actions and visible columns

export type UserRole =
  | "admin"
  | "manager"
  | "staff"
  | "rep"
  | "pre_hearing_staff"
  | "brief_agent"
  | "mr_admin"
  | "mr_agent"
  | "mr_lead"
  | "hearings_admin"
  | "hearings_agent"
  | "post_hearing_admin"
  | "post_hearing_staff";

// Pages each role can access
export const PAGE_ACCESS: Record<string, UserRole[]> = {
  dashboard: [
    "admin",
    "manager",
    "staff",
    "rep",
    "hearings_admin",
    "hearings_agent",
    "pre_hearing_staff",
    "brief_agent",
    "mr_admin",
    "mr_agent",
    "mr_lead",
    "post_hearing_admin",
    "post_hearing_staff",
  ],
  rep_dashboard: ["admin", "manager", "hearings_admin", "rep"],
  import: ["admin", "manager", "hearings_admin"],
  medical_records: ["admin", "manager", "mr_admin", "mr_agent", "mr_lead"],
  patient_portal: ["admin", "manager", "mr_admin", "mr_agent", "mr_lead"],
  rfc: ["admin", "manager", "mr_admin", "mr_agent", "mr_lead"],
  reports: ["admin", "manager", "hearings_admin"],
  representatives: ["admin", "manager", "hearings_admin"],
  schedule: ["admin", "manager", "hearings_admin", "hearings_agent", "rep"],
  admin: ["admin"],
  api_keys: ["admin"],
  settings: ["admin", "manager"],
};

// Hearing fields each role can edit (inline editing)
export const EDITABLE_FIELDS: Record<string, UserRole[]> = {
  assigned_rep_id: ["admin", "manager", "hearings_admin", "hearings_agent"],
  assignment_status: ["admin", "manager", "hearings_admin", "hearings_agent"],
  task_assigned: [
    "admin",
    "manager",
    "hearings_admin",
    "hearings_agent",
    "pre_hearing_staff",
  ],
  rep_docs_complete: [
    "admin",
    "manager",
    "hearings_admin",
    "hearings_agent",
    "pre_hearing_staff",
  ],
  rep_docs_assigned_to: [
    "admin",
    "manager",
    "hearings_admin",
    "hearings_agent",
    "pre_hearing_staff",
  ],
  fee_agreement_complete: [
    "admin",
    "manager",
    "hearings_admin",
    "hearings_agent",
    "pre_hearing_staff",
  ],
  phi_sheet_complete: [
    "admin",
    "manager",
    "hearings_admin",
    "hearings_agent",
    "pre_hearing_staff",
  ],
  five_day_notice: [
    "admin",
    "manager",
    "hearings_admin",
    "hearings_agent",
    "pre_hearing_staff",
  ],
  brief_assigned_to: ["admin", "manager", "hearings_admin", "brief_agent"],
  manner_of_appearance: ["admin", "manager", "hearings_admin"],
  hearing_decision_status: [
    "admin",
    "manager",
    "hearings_admin",
    "post_hearing_admin",
  ],
  medical_record_status: [
    "admin",
    "manager",
    "mr_admin",
    "mr_agent",
    "mr_lead",
  ],
  mr_hearing_status: ["admin", "manager", "mr_admin", "mr_agent", "mr_lead"],
  mr_team_id: ["admin", "manager", "mr_admin", "mr_lead"],
  medical_record_link: ["admin", "manager", "mr_admin", "mr_agent", "mr_lead"],
  rfc_status: ["admin", "manager", "mr_admin", "mr_agent", "mr_lead"],
  post_hrg_deadline: [
    "admin",
    "manager",
    "post_hearing_admin",
    "post_hearing_staff",
  ],
  post_hrg_notes: [
    "admin",
    "manager",
    "post_hearing_admin",
    "post_hearing_staff",
  ],
  post_hrg_review: [
    "admin",
    "manager",
    "post_hearing_admin",
    "post_hearing_staff",
  ],
  moa: ["admin", "manager", "post_hearing_admin", "post_hearing_staff"],
  five_day: ["admin", "manager", "post_hearing_admin", "post_hearing_staff"],
  credited: ["admin", "manager", "post_hearing_admin"],
};

// Columns visible per role on the main dashboard
export const VISIBLE_COLUMNS: Record<UserRole, string[]> = {
  admin: ["ALL"],
  manager: ["ALL"],
  hearings_admin: ["ALL"],
  hearings_agent: [
    "claimant",
    "ssn_last_4",
    "hearing_date",
    "hearing_time",
    "converted_time_est",
    "time_zone",
    "city",
    "state",
    "alj",
    "assigned_rep_id",
    "assignment_status",
    "task_assigned",
    "rep_docs_complete",
    "rep_docs_assigned_to",
    "fee_agreement_complete",
    "phi_sheet_complete",
    "five_day_notice",
    "manner_of_appearance",
    "brief_assigned_to",
  ],
  pre_hearing_staff: [
    "claimant",
    "ssn_last_4",
    "hearing_date",
    "hearing_time",
    "converted_time_est",
    "assigned_rep_id",
    "task_assigned",
    "rep_docs_complete",
    "rep_docs_assigned_to",
    "fee_agreement_complete",
    "phi_sheet_complete",
    "five_day_notice",
  ],
  brief_agent: [
    "claimant",
    "hearing_date",
    "hearing_time",
    "assigned_rep_id",
    "brief_assigned_to",
  ],
  mr_admin: [
    "claimant",
    "ssn_last_4",
    "hearing_date",
    "assigned_rep_id",
    "medical_record_status",
    "mr_hearing_status",
    "mr_team_id",
    "medical_record_link",
    "rfc_status",
  ],
  mr_agent: [
    "claimant",
    "ssn_last_4",
    "hearing_date",
    "assigned_rep_id",
    "medical_record_status",
    "mr_hearing_status",
    "mr_team_id",
    "medical_record_link",
    "rfc_status",
  ],
  mr_lead: [
    "claimant",
    "ssn_last_4",
    "hearing_date",
    "assigned_rep_id",
    "medical_record_status",
    "mr_hearing_status",
    "mr_team_id",
    "medical_record_link",
    "rfc_status",
  ],
  post_hearing_admin: [
    "claimant",
    "hearing_date",
    "hearing_time",
    "assigned_rep_id",
    "hearing_decision_status",
    "post_hrg_deadline",
    "post_hrg_notes",
    "post_hrg_review",
    "moa",
    "five_day",
    "credited",
  ],
  post_hearing_staff: [
    "claimant",
    "hearing_date",
    "hearing_time",
    "assigned_rep_id",
    "hearing_decision_status",
    "post_hrg_deadline",
    "post_hrg_notes",
    "post_hrg_review",
    "moa",
    "five_day",
  ],
  staff: [
    "claimant",
    "hearing_date",
    "hearing_time",
    "converted_time_est",
    "city",
    "state",
    "alj",
    "assigned_rep_id",
  ],
  rep: [
    "claimant",
    "hearing_date",
    "hearing_time",
    "converted_time_est",
    "city",
    "state",
    "alj",
    "manner_of_appearance",
  ],
};

// Helper functions
export function canAccessPage(role: UserRole, page: string): boolean {
  const allowed = PAGE_ACCESS[page];
  return allowed ? allowed.includes(role) : false;
}

export function canEditField(role: UserRole, field: string): boolean {
  const allowed = EDITABLE_FIELDS[field];
  return allowed ? allowed.includes(role) : false;
}

export function getVisibleColumns(role: UserRole): string[] {
  return VISIBLE_COLUMNS[role] || [];
}

export function isAdmin(role: UserRole): boolean {
  return role === "admin";
}

export function isAdminOrManager(role: UserRole): boolean {
  return role === "admin" || role === "manager";
}

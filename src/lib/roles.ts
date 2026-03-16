// HSL Hearing Dashboard - Role Permission Matrix
// Maps all 13 roles to their allowed actions and visible columns

export type UserRole =
  | "system_admin"
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
    "system_admin",
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
  rep_dashboard: ["system_admin", "admin", "manager", "hearings_admin", "rep"],
  import: ["system_admin"],
  medical_records: [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_agent",
    "mr_lead",
  ],
  patient_portal: [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_agent",
    "mr_lead",
  ],
  rfc: ["system_admin", "admin", "manager", "mr_admin", "mr_agent", "mr_lead"],
  reports: ["system_admin", "admin", "manager", "hearings_admin"],
  representatives: ["system_admin", "admin", "manager", "hearings_admin"],
  schedule: [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "hearings_agent",
    "rep",
  ],
  admin: ["system_admin", "admin"],
  api_keys: ["system_admin", "admin"],
  settings: [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "mr_admin",
    "mr_lead",
  ],
};

// Hearing fields each role can edit (inline editing)
export const EDITABLE_FIELDS: Record<string, UserRole[]> = {
  assigned_rep_id: [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "hearings_agent",
  ],
  assignment_status: [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "hearings_agent",
  ],
  task_assigned: [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "hearings_agent",
    "pre_hearing_staff",
  ],
  rep_docs_complete: [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "hearings_agent",
    "pre_hearing_staff",
  ],
  rep_docs_assigned_to: [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "hearings_agent",
    "pre_hearing_staff",
  ],
  fee_agreement_complete: [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "hearings_agent",
    "pre_hearing_staff",
  ],
  phi_sheet_complete: [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "hearings_agent",
    "pre_hearing_staff",
  ],
  five_day_notice: [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "hearings_agent",
    "pre_hearing_staff",
  ],
  brief_assigned_to: [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "brief_agent",
  ],
  manner_of_appearance: ["system_admin", "admin", "manager", "hearings_admin"],
  hearing_decision_status: [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "post_hearing_admin",
  ],
  medical_record_status: [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_agent",
    "mr_lead",
  ],
  mr_hearing_status: [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_agent",
    "mr_lead",
  ],
  mr_team_id: ["system_admin", "admin", "manager", "mr_admin", "mr_lead"],
  medical_record_link: [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_agent",
    "mr_lead",
  ],
  rfc_status: [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_agent",
    "mr_lead",
  ],
  post_hrg_deadline: [
    "system_admin",
    "admin",
    "manager",
    "post_hearing_admin",
    "post_hearing_staff",
  ],
  post_hrg_notes: [
    "system_admin",
    "admin",
    "manager",
    "post_hearing_admin",
    "post_hearing_staff",
  ],
  post_hrg_review: [
    "system_admin",
    "admin",
    "manager",
    "post_hearing_admin",
    "post_hearing_staff",
  ],
  moa: [
    "system_admin",
    "admin",
    "manager",
    "post_hearing_admin",
    "post_hearing_staff",
  ],
  five_day: [
    "system_admin",
    "admin",
    "manager",
    "post_hearing_admin",
    "post_hearing_staff",
  ],
  credited: ["system_admin", "admin", "manager", "post_hearing_admin"],
};

// Columns visible per role on the main dashboard
// PHP: $canViewAllColumns = !$isRep — everyone except rep sees ALL columns
// Only rep gets a restricted view. Edit permissions are separate (EDITABLE_FIELDS).
export const VISIBLE_COLUMNS: Record<UserRole, string[]> = {
  system_admin: ["ALL"],
  admin: ["ALL"],
  manager: ["ALL"],
  hearings_admin: ["ALL"],
  hearings_agent: ["ALL"],
  pre_hearing_staff: ["ALL"],
  brief_agent: ["ALL"],
  mr_admin: ["ALL"],
  mr_agent: ["ALL"],
  mr_lead: ["ALL"],
  post_hearing_admin: ["ALL"],
  post_hearing_staff: ["ALL"],
  staff: ["ALL"],
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
  return role === "system_admin" || role === "admin";
}

export function isAdminOrManager(role: UserRole): boolean {
  return role === "system_admin" || role === "admin" || role === "manager";
}

// ── Action-level permissions (matches PHP $canXxx variables) ──

// Full management: assign/unassign/edit/delete hearings, action menu
// PHP: $canManage = in_array($userRole, ['admin', 'manager', 'hearings_admin'])
export function canManage(role: UserRole): boolean {
  return ["system_admin", "admin", "manager", "hearings_admin"].includes(role);
}

// Checkbox column for bulk selection
// PHP: $canSeeCheckbox = in_array($userRole, ['admin', 'manager', 'hearings_admin'])
export function canSeeCheckbox(role: UserRole): boolean {
  return ["system_admin", "admin", "manager", "hearings_admin"].includes(role);
}

// Email All, Auto-Assign All, Unassign All, Add Hearing buttons
// PHP: $canSeeAdminButtons = in_array($userRole, ['admin', 'manager', 'hearings_admin'])
export function canSeeAdminButtons(role: UserRole): boolean {
  return ["system_admin", "admin", "manager", "hearings_admin"].includes(role);
}

// Activity Log button
// PHP: $canSeeActivityLog = in_array($userRole, ['admin', 'manager', 'mr_admin', 'mr_lead', 'mr_agent', 'hearings_admin'])
export function canSeeActivityLog(role: UserRole): boolean {
  return [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_lead",
    "mr_agent",
    "hearings_admin",
  ].includes(role);
}

// Rep Stats button (same as Activity Log in PHP)
export function canSeeRepStats(role: UserRole): boolean {
  return ["system_admin", "admin", "manager", "hearings_admin"].includes(role);
}

// CSV Compare button
// PHP: $canSeeCsvCompare = (id==1 || admin || manager)
export function canSeeCsvCompare(role: UserRole, userId?: number): boolean {
  if (userId === 1) return true;
  return ["system_admin", "admin", "manager"].includes(role);
}

// Rep filter dropdown
// PHP: $canSeeAdminButtons covers this (admin, manager, hearings_admin)
export function canSeeRepFilter(role: UserRole): boolean {
  return ["system_admin", "admin", "manager", "hearings_admin"].includes(role);
}

// Next Unassigned indicator
// PHP: $canManage || $isMrAdmin || $isHearingsAdmin || $isPostHearingAdmin
export function canSeeNextUnassigned(role: UserRole): boolean {
  return [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "mr_admin",
    "post_hearing_admin",
  ].includes(role);
}

// Export button
export function canExport(role: UserRole): boolean {
  return ["system_admin", "admin", "manager", "hearings_admin"].includes(role);
}

// ══════════════════════════════════════════════════════════════
// FUTURE PAGE ACTIONS — Phase 4+ (MR Pivot, RFC, Patient Portal)
// Based on PHP mr_pivot.php permissions
// ══════════════════════════════════════════════════════════════

// ── MR Pivot Page (/medical-records) ──

// Page access (already in PAGE_ACCESS above)
// PHP: requireAnyRole(['admin','manager','mr_admin','mr_lead','mr_agent','hearings_admin','hearings_agent','post_hearing_admin','post_hearing_staff'])
export const MR_PIVOT_ACCESS: UserRole[] = [
  "system_admin",
  "admin",
  "manager",
  "mr_admin",
  "mr_lead",
  "mr_agent",
  "hearings_admin",
  "hearings_agent",
  "post_hearing_admin",
  "post_hearing_staff",
];

// Full management on MR Pivot (assign teams, bulk actions, manage records)
// PHP: $canManage = in_array($userRole, ['admin', 'manager', 'mr_admin', 'mr_lead'])
export function canManageMrPivot(role: UserRole): boolean {
  return ["system_admin", "admin", "manager", "mr_admin", "mr_lead"].includes(
    role,
  );
}

// MR Pivot field-level edit permissions (differ from dashboard inline editing)
export const MR_PIVOT_EDITABLE: Record<string, UserRole[]> = {
  // MR Team assignment — mr_lead is VIEW ONLY on pivot (unlike dashboard)
  // PHP: $canEditMrTeam = in_array($userRole, ['admin', 'manager', 'mr_admin'])
  mr_team_id: ["system_admin", "admin", "manager", "mr_admin"],

  // MR Status
  // PHP: same as dashboard — all MR roles can edit
  medical_record_status: [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_lead",
    "mr_agent",
  ],

  // MR Worksheet Link
  medical_record_link: [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_lead",
    "mr_agent",
  ],

  // Decision Status (on pivot)
  hearing_decision_status: [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_lead",
  ],

  // MOA — restricted on pivot page
  // PHP: $canEditMoa = in_array($userRole, ['admin', 'manager'])
  manner_of_appearance: ["system_admin", "admin", "manager"],

  // Five Day Notice
  five_day_notice: [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_lead",
    "mr_agent",
  ],

  // Claimant Link
  claimant_link: ["system_admin", "admin", "manager", "hearings_admin"],

  // Task Assigned — restricted on pivot page
  // PHP: $canEditTask = in_array($userRole, ['admin', 'mr_admin'])
  task_assigned: ["system_admin", "admin", "mr_admin"],

  // Credited — most restricted
  // PHP: $canEditCredited = in_array($userRole, ['admin'])
  credited: ["system_admin", "admin"],
};

// MR Pivot bulk actions
// PHP: canEditMrTeam gates bulk_assign_team, canManage gates bulk_update_status
export function canBulkAssignMrTeam(role: UserRole): boolean {
  return ["system_admin", "admin", "manager", "mr_admin"].includes(role);
}

export function canBulkUpdateMrStatus(role: UserRole): boolean {
  return ["system_admin", "admin", "manager", "mr_admin", "mr_lead"].includes(
    role,
  );
}

// MR Pivot export
export function canExportMrPivot(role: UserRole): boolean {
  return ["system_admin", "admin", "manager", "mr_admin", "mr_lead"].includes(
    role,
  );
}

// MR Pivot activity log visibility
export function canSeeMrPivotActivityLog(role: UserRole): boolean {
  return [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_lead",
    "mr_agent",
  ].includes(role);
}

// Helper: check if role can edit a specific field on MR Pivot
export function canEditMrPivotField(role: UserRole, field: string): boolean {
  const allowed = MR_PIVOT_EDITABLE[field];
  return allowed ? allowed.includes(role) : false;
}

// ── RFC Tracker Page (/rfc) ──

export const RFC_PAGE_ACTIONS: Record<string, UserRole[]> = {
  // View RFC records
  view: ["system_admin", "admin", "manager", "mr_admin", "mr_agent", "mr_lead"],

  // Create/edit RFC entries
  create: ["system_admin", "admin", "manager", "mr_admin", "mr_lead"],
  edit: ["system_admin", "admin", "manager", "mr_admin", "mr_lead", "mr_agent"],

  // Update RFC status
  update_status: [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_lead",
    "mr_agent",
  ],

  // Manage RFC document types (settings-level)
  manage_doc_types: ["system_admin", "admin", "manager", "mr_admin"],

  // Manage RFC methods (settings-level)
  manage_methods: ["system_admin", "admin", "manager", "mr_admin"],

  // Assign RFC to specialist
  assign_specialist: [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_lead",
  ],

  // Delete RFC entry
  delete: ["system_admin", "admin", "manager"],

  // Export RFC data
  export: ["system_admin", "admin", "manager", "mr_admin", "mr_lead"],
};

export function canRfcAction(role: UserRole, action: string): boolean {
  const allowed = RFC_PAGE_ACTIONS[action];
  return allowed ? allowed.includes(role) : false;
}

// ── Patient Portal Page (/patient-portal) ──

export const PATIENT_PORTAL_ACTIONS: Record<string, UserRole[]> = {
  // View provider list and portal credentials
  view: ["system_admin", "admin", "manager", "mr_admin", "mr_agent", "mr_lead"],

  // Add new provider/portal
  create_provider: ["system_admin", "admin", "manager", "mr_admin"],

  // Edit provider details/credentials
  edit_provider: ["system_admin", "admin", "manager", "mr_admin", "mr_lead"],

  // Delete provider
  delete_provider: ["system_admin", "admin", "manager"],

  // Manage MR retrieval status
  update_retrieval_status: [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_lead",
    "mr_agent",
  ],

  // Assign specialist to portal
  assign_specialist: [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_lead",
  ],

  // View/edit portal credentials (sensitive)
  view_credentials: ["system_admin", "admin", "mr_admin"],

  // Export portal data
  export: ["system_admin", "admin", "manager", "mr_admin"],
};

export function canPatientPortalAction(
  role: UserRole,
  action: string,
): boolean {
  const allowed = PATIENT_PORTAL_ACTIONS[action];
  return allowed ? allowed.includes(role) : false;
}

// ── Rep Schedule Page (/schedule) ──

export const SCHEDULE_ACTIONS: Record<string, UserRole[]> = {
  // View schedule
  view: [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "hearings_agent",
    "rep",
  ],

  // Lock/unlock schedule periods
  lock_schedule: ["system_admin", "admin", "manager", "hearings_admin"],

  // Edit rep availability
  edit_availability: [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "rep",
  ],

  // Override locked schedule
  override_lock: ["system_admin", "admin", "manager"],

  // View all reps (vs own schedule only for rep role)
  view_all_reps: [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "hearings_agent",
  ],

  // Manage daily/weekly limits
  manage_limits: ["system_admin", "admin", "manager", "hearings_admin"],

  // Export schedule
  export: ["system_admin", "admin", "manager", "hearings_admin"],
};

export function canScheduleAction(role: UserRole, action: string): boolean {
  const allowed = SCHEDULE_ACTIONS[action];
  return allowed ? allowed.includes(role) : false;
}

// ── Rep Dashboard Page (/representatives) ──

export const REP_DASHBOARD_ACTIONS: Record<string, UserRole[]> = {
  // View rep list and stats
  view: ["system_admin", "admin", "manager", "hearings_admin", "rep"],

  // Add new representative
  create: ["system_admin", "admin", "manager"],

  // Edit rep details
  edit: ["system_admin", "admin", "manager", "hearings_admin"],

  // Deactivate/activate rep
  toggle_active: ["system_admin", "admin", "manager"],

  // Delete rep
  delete: ["system_admin", "admin"],

  // Manage rep schedule tokens
  manage_tokens: ["system_admin", "admin", "manager", "hearings_admin"],

  // View rep hearing assignments
  view_assignments: [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
    "rep",
  ],

  // Export rep data
  export: ["system_admin", "admin", "manager", "hearings_admin"],
};

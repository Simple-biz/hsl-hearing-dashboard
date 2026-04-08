// Auto-generated types placeholder
// Replace with: npx supabase gen types typescript --local > lib/database.types.ts
// once Supabase project is provisioned

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

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
  | "hearings_status_moa"
  | "hearings_docs_fee"
  | "hearings_docs"
  | "hearings_mc"
  | "hearings_brief"
  | "post_hearing_admin"
  | "post_hearing_staff";

export type RepType =
  | "in-house"
  | "contract"
  | "internal_advocates"
  | "external_advocates";
export type AssignmentStatus = "wd_never_assigned" | "withdrawal";
export type AvailabilityType = "full_day" | "morning_only" | "afternoon_only";
export type ReminderType = "15_days" | "10_days" | "1_day";
export type MrTeamType =
  | "color_team"
  | "leadership"
  | "leadership_lead"
  | "leadership_asst"
  | "shared"
  | "mr_specialist";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  force_password_change: boolean;
  last_login: string | null;
  legacy_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Hearing {
  id: number;
  claimant: string | null;
  ssn_last_4: string | null;
  claim_type: string | null;
  hearing_date: string;
  hearing_time: string;
  time_zone: string;
  converted_time_est: string | null;
  claimant_location: string | null;
  representative_location: string | null;
  city: string | null;
  state: string | null;
  alj: string | null;
  medical_expert: string | null;
  vocational_expert: string | null;
  status_date: string | null;
  entered_hearing_level_date: string | null;
  download_type: string | null;
  manner_of_appearance: string | null;
  hearing_decision_status: string | null;
  assigned_rep_id: number | null;
  medical_records_team: string | null;
  mr_team_id: number | null;
  mr_team_assigned_at: string | null;
  brief_assigned_to: string | null;
  date_added: string;
  created_at: string;
  updated_at: string;
  task_assigned: boolean;
  rep_docs_complete: boolean;
  rep_docs_assigned_to: string | null;
  fee_agreement_complete: boolean;
  five_day_notice: boolean;
  rfc_status: string | null;
  phi_sheet_complete: boolean;
  medical_record_status: string | null;
  mr_hearing_status: string | null;
  medical_record_link: string | null;
  claimant_link: string | null;
  assignment_status: AssignmentStatus | null;
  post_hrg_deadline: string | null;
  post_hrg_notes: string | null;
  moa: boolean;
  five_day: boolean;
  post_hrg_review: boolean;
  assignment_timestamp: string | null;
  credited: boolean;
  // Joined fields
  representative?: Representative;
  mr_team?: MrTeam;
}

export interface Representative {
  id: number;
  name: string;
  email: string | null;
  rep_type: RepType;
  priority: number;
  daily_limit: number;
  weekly_limit: number;
  is_active: boolean;
  hearing_restriction: string;
  preferred_monthly_hearings: number | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface MrTeam {
  id: number;
  team_name: string;
  team_color: string | null;
  team_type: MrTeamType;
  is_assignable: boolean;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConfigOption {
  id: number;
  option_type: string;
  option_value: string;
  option_color: string | null;
  display_order: number;
  is_active: boolean;
}

export interface RepDocsAssignee {
  id: number;
  name: string;
  is_active: boolean;
  display_order: number;
}

export interface ActivityLog {
  id: number;
  user_id: string | null;
  action: string;
  description: string | null;
  ip_address: string | null;
  created_at: string;
  profile?: Profile;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile };
      hearings: { Row: Hearing };
      representatives: { Row: Representative };
      mr_teams: { Row: MrTeam };
      config_options: { Row: ConfigOption };
      rep_docs_assignees: { Row: RepDocsAssignee };
      activity_log: { Row: ActivityLog };
    };
  };
}

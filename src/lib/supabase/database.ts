export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRoleRow = "club" | "admin" | "super-admin";
export type ApplicationStatusRow =
  | "new"
  | "under-review"
  | "accepted"
  | "waiting-list"
  | "rejected"
  | "cancelled";
export type PaymentStatusRow =
  | "pending"
  | "paid"
  | "not_required"
  | "waived";
export type TournamentStatusRow = "coming-soon" | "active" | "full" | "completed";
export type InternalCategoryRow = "S" | "A" | "B" | "C";
export type ClubStatusRow = "active" | "inactive";
export type EmailTemplateTypeRow =
  | "application-received"
  | "application-accepted"
  | "application-under-review"
  | "waiting-list"
  | "application-rejected"
  | "cancellation-request-received"
  | "cancellation-request-submitted"
  | "cancellation-confirmed"
  | "cancellation-rejected"
  | "participation-access-recovery"
  | "follow-up"
  | "general";

export type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  avatar_url: string | null;
  role: UserRoleRow;
  club_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ClubRow = {
  id: string;
  name: string;
  city: string | null;
  website: string | null;
  logo_url: string | null;
  contact_phone: string | null;
  created_by: string | null;
  status: ClubStatusRow;
  created_at: string;
  updated_at: string;
};

export type TeamRow = {
  id: string;
  club_id: string;
  name: string;
  age_group: string | null;
  birth_year: number | null;
  league: string | null;
  division: string | null;
  self_rated_strength: number | null;
  trainer_name: string | null;
  created_at: string;
  updated_at: string;
};

export type TeamDirectorySourceRow = "application" | "manual";

export type TeamDirectoryEntryRow = {
  id: string;
  club_name: string;
  team_name: string;
  age_group: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_role: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  league: string | null;
  birth_year: number | null;
  division: string | null;
  self_rated_strength: number | null;
  internal_category: string | null;
  internal_strength: number | null;
  internal_notes: string | null;
  source: TeamDirectorySourceRow;
  source_application_id: string | null;
  club_id: string | null;
  team_id: string | null;
  norm_club_name: string;
  norm_team_name: string;
  norm_age_group: string;
  norm_contact_email: string | null;
  archived_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TournamentRow = {
  id: string;
  slug: string;
  name: string;
  age_group: string;
  date: string;
  location: string | null;
  image_url: string | null;
  max_teams: number | null;
  status: TournamentStatusRow;
  application_start: string | null;
  application_deadline: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  address: string | null;
  short_description: string | null;
  birth_year: number | null;
  waitlist_enabled: boolean;
  applications_open: boolean;
  archived_at: string | null;
  match_duration_minutes?: number | null;
  break_minutes?: number | null;
  minimum_rest_minutes?: number | null;
  lunch_break_start?: string | null;
  lunch_break_end?: string | null;
  play_format?: string | null;
  playing_time?: string | null;
  pitch_format?: string | null;
  entry_fee?: string | null;
  travel_info?: string | null;
  changing_rooms?: string | null;
  catering?: string | null;
  team_info?: string | null;
  mein_turnierplan_url?: string | null;
  mein_turnierplan_enabled?: boolean;
  mein_turnierplan_label?: string | null;
  mein_turnierplan_embed_url?: string | null;
  live_data_source?: string | null;
  mein_turnierplan_tournament_id?: string | null;
  mein_turnierplan_matches_widget_url?: string | null;
  mein_turnierplan_table_widget_url?: string | null;
  public_schedule_note?: string | null;
  public_live_note?: string | null;
  mein_turnierplan_last_synced_at?: string | null;
  mein_turnierplan_sync_meta?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type MatchStatusRow = "scheduled" | "live" | "completed" | "cancelled";
export type MatchPhaseRow = "group" | "knockout";
export type KnockoutRoundRow =
  | "quarterfinal"
  | "semifinal"
  | "third-place"
  | "final"
  | "placement-5"
  | "placement-7";
export type KnockoutSlotRow = "home" | "away";
export type DecidedByRow = "regular" | "penalties";

export type TournamentGroupRow = {
  id: string;
  tournament_id: string;
  name: string;
  sort_order: number;
  external_source?: string | null;
  external_id?: string | null;
  manual_override?: boolean;
  external_active?: boolean;
  last_synced_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type TournamentExternalTeamRow = {
  id: string;
  tournament_id: string;
  external_source: string;
  external_id: string;
  name: string;
  club_name?: string | null;
  team_name?: string | null;
  age_group?: string | null;
  birth_year?: number | null;
  logo_url?: string | null;
  club_id?: string | null;
  logo_manual_override?: boolean;
  application_id: string | null;
  manual_override: boolean;
  participation_status?: "detected" | "confirmed" | "rejected";
  external_active?: boolean;
  external_updated_at?: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TournamentGroupMemberRow = {
  id: string;
  group_id: string;
  application_id: string | null;
  external_team_id?: string | null;
  created_at: string;
};

export type TournamentFieldRow = {
  id: string;
  tournament_id: string;
  name: string;
  sort_order: number;
  external_source?: string | null;
  external_id?: string | null;
  manual_override?: boolean;
  external_active?: boolean;
  last_synced_at?: string | null;
  created_at: string;
};

export type TournamentMatchRow = {
  id: string;
  tournament_id: string;
  group_id: string | null;
  field_id: string | null;
  home_application_id: string | null;
  away_application_id: string | null;
  home_external_team_id?: string | null;
  away_external_team_id?: string | null;
  scheduled_at: string | null;
  duration_minutes: number;
  home_score: number | null;
  away_score: number | null;
  status: MatchStatusRow;
  phase: MatchPhaseRow;
  sort_order: number;
  round: KnockoutRoundRow | null;
  next_match_id: string | null;
  next_match_slot: KnockoutSlotRow | null;
  loser_next_match_id: string | null;
  loser_next_match_slot: KnockoutSlotRow | null;
  decided_by: DecidedByRow;
  home_penalties: number | null;
  away_penalties: number | null;
  external_source?: string | null;
  external_id?: string | null;
  manual_override?: boolean;
  external_active?: boolean;
  last_synced_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type ActiveEmailTemplateRow = {
  id: string;
  subject: string;
  body: string;
};

export type TournamentPublicRosterRow = {
  application_id: string;
  club_name: string | null;
  team_name: string | null;
  age_group: string | null;
  birth_year: number | null;
  group_id: string | null;
  group_name: string | null;
  group_sort_order: number | null;
  club_id?: string | null;
  logo_url?: string | null;
};

export type ApplicationRow = {
  id: string;
  tournament_id: string;
  club_id: string | null;
  team_id: string | null;
  submitted_by: string | null;
  club_name: string | null;
  club_city: string | null;
  team_name: string | null;
  age_group: string | null;
  birth_year: number | null;
  league: string | null;
  division: string | null;
  self_rated_strength: number | null;
  team_description: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_role: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  alternative_phone: string | null;
  website: string | null;
  club_type: string | null;
  staff_count: number | null;
  notes: string | null;
  status: ApplicationStatusRow;
  payment_status: PaymentStatusRow;
  participation_fee: number | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationPaymentAdminNoteRow = {
  application_id: string;
  payment_note: string | null;
  updated_at: string;
};

export type ApplicationReviewRow = {
  id: string;
  application_id: string;
  internal_category: InternalCategoryRow | null;
  internal_strength: number | null;
  internal_note: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailTemplateRow = {
  id: string;
  name: string;
  subject: string;
  body: string;
  type: EmailTemplateTypeRow;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type NewsPostRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  image_url: string | null;
  published_at: string | null;
  featured: boolean;
  tournament_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type AppSettingRow = {
  id: string;
  key: string;
  value: Json;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type EmailLogStatusRow = "sent" | "failed" | "skipped";

export type EmailLogRow = {
  id: string;
  application_id: string | null;
  template_id: string | null;
  template_type: EmailTemplateTypeRow | null;
  to_email: string;
  subject: string | null;
  body: string | null;
  status: EmailLogStatusRow;
  error: string | null;
  provider: string | null;
  provider_message_id: string | null;
  communication_recipient_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type TournamentCommunicationRow = {
  id: string;
  tournament_id: string;
  recipient_source: string;
  type: string;
  subject: string;
  body: string;
  important: boolean;
  require_confirmation: boolean;
  recipient_filter: string;
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  archived_at: string | null;
};

export type CommunicationRecipientRow = {
  id: string;
  communication_id: string;
  application_id: string | null;
  team_directory_entry_id: string | null;
  recipient_email: string;
  recipient_team_name: string;
  recipient_club_name: string | null;
  recipient_contact_first_name: string | null;
  send_status: string;
  sent_at: string | null;
  confirmed_at: string | null;
  email_log_id: string | null;
  error_message: string | null;
  created_at: string;
};

export type CommunicationConfirmationTokenRow = {
  id: string;
  communication_recipient_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

export type SecureAccessTokenRow = {
  id: string;
  application_id: string;
  purpose: "cancellation" | "communication_confirm";
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type CancellationRequestRow = {
  id: string;
  application_id: string;
  requested_by_type: "club" | "external";
  reason: string | null;
  is_late_request: boolean;
  status: "pending" | "confirmed" | "rejected";
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

export type CancellationEmailSendKeyRow = {
  cancellation_request_id: string;
  template_type: EmailTemplateTypeRow;
  created_at: string;
};

export type TournamentOccupancyRow = {
  slug: string;
  max_teams: number | null;
  confirmed_teams: number;
  waiting_list_count: number;
  under_review_count: number;
  new_count: number;
};

export type RbacRoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_platform_role: boolean;
  is_system: boolean;
  created_at: string;
};

export type RbacPermissionRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  created_at: string;
};

export type RbacUserRoleRow = {
  id: string;
  user_id: string;
  role_id: string;
  club_id: string | null;
  assigned_by: string | null;
  assigned_at: string;
};

export type RbacUserTeamAssignmentRow = {
  id: string;
  user_id: string;
  team_id: string;
  assigned_by: string | null;
  assigned_at: string;
};

export type RbacUserPermissionOverrideRow = {
  user_id: string;
  permission_id: string;
  granted: boolean;
  assigned_by: string | null;
  assigned_at: string;
};

export type UserInvitationRow = {
  id: string;
  email: string;
  invited_by: string | null;
  invited_at: string;
  accepted_at: string | null;
  expires_at: string;
  status: "pending" | "accepted" | "expired" | "cancelled";
  auth_user_id: string | null;
  profile_id: string | null;
  last_sent_at: string;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type AdminAuditLogRow = {
  id: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  action: string;
  metadata: Json;
  created_at: string;
};

type ForeignKey = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type Table<Row, Insert, Update, Relations extends ForeignKey[] = []> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Relations;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        Partial<ProfileRow> & { id: string },
        Partial<ProfileRow>,
        [
          {
            foreignKeyName: "profiles_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
        ]
      >;
      clubs: Table<ClubRow, Partial<ClubRow> & { name: string }, Partial<ClubRow>>;
      teams: Table<
        TeamRow,
        Partial<TeamRow> & { club_id: string; name: string },
        Partial<TeamRow>,
        [
          {
            foreignKeyName: "teams_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
        ]
      >;
      tournaments: Table<
        TournamentRow,
        Partial<TournamentRow> & {
          slug: string;
          name: string;
          age_group: string;
          date: string;
        },
        Partial<TournamentRow>
      >;
      applications: Table<
        ApplicationRow,
        Partial<ApplicationRow> & {
          tournament_id: string;
        },
        Partial<ApplicationRow>,
        [
          {
            foreignKeyName: "applications_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "applications_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "applications_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ]
      >;
      application_payment_admin_notes: Table<
        ApplicationPaymentAdminNoteRow,
        Partial<ApplicationPaymentAdminNoteRow> & {
          application_id: string;
        },
        Partial<ApplicationPaymentAdminNoteRow>,
        [
          {
            foreignKeyName: "application_payment_admin_notes_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: true;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ]
      >;
      rbac_roles: Table<RbacRoleRow, Partial<RbacRoleRow> & { key: string; name: string }, Partial<RbacRoleRow>>;
      rbac_permissions: Table<
        RbacPermissionRow,
        Partial<RbacPermissionRow> & { key: string; name: string; category: string },
        Partial<RbacPermissionRow>
      >;
      rbac_role_permissions: Table<
        { role_id: string; permission_id: string },
        { role_id: string; permission_id: string },
        { role_id?: string; permission_id?: string }
      >;
      rbac_user_roles: Table<
        RbacUserRoleRow,
        Partial<RbacUserRoleRow> & { user_id: string; role_id: string },
        Partial<RbacUserRoleRow>
      >;
      rbac_user_team_assignments: Table<
        RbacUserTeamAssignmentRow,
        Partial<RbacUserTeamAssignmentRow> & { user_id: string; team_id: string },
        Partial<RbacUserTeamAssignmentRow>
      >;
      rbac_user_permission_overrides: Table<
        RbacUserPermissionOverrideRow,
        Partial<RbacUserPermissionOverrideRow> & {
          user_id: string;
          permission_id: string;
          granted: boolean;
        },
        Partial<RbacUserPermissionOverrideRow>
      >;
      user_invitations: Table<
        UserInvitationRow,
        Partial<UserInvitationRow> & { email: string; status: UserInvitationRow["status"] },
        Partial<UserInvitationRow>
      >;
      admin_audit_log: Table<
        AdminAuditLogRow,
        Partial<AdminAuditLogRow> & { action: string },
        Partial<AdminAuditLogRow>
      >;
      application_reviews: Table<
        ApplicationReviewRow,
        Partial<ApplicationReviewRow> & { application_id: string },
        Partial<ApplicationReviewRow>,
        [
          {
            foreignKeyName: "application_reviews_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: true;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ]
      >;
      email_templates: Table<
        EmailTemplateRow,
        Partial<EmailTemplateRow> & {
          name: string;
          subject: string;
          body: string;
          type: EmailTemplateTypeRow;
        },
        Partial<EmailTemplateRow>
      >;
      news_posts: Table<
        NewsPostRow,
        Partial<NewsPostRow> & {
          title: string;
          slug: string;
          excerpt: string;
          content: string;
        },
        Partial<NewsPostRow>,
        [
          {
            foreignKeyName: "news_posts_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ]
      >;
      team_directory_entries: Table<
        TeamDirectoryEntryRow,
        Partial<TeamDirectoryEntryRow> & {
          club_name: string;
          team_name: string;
          norm_club_name: string;
          norm_team_name: string;
          norm_age_group: string;
        },
        Partial<TeamDirectoryEntryRow>,
        [
          {
            foreignKeyName: "team_directory_entries_source_application_id_fkey";
            columns: ["source_application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_directory_entries_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_directory_entries_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ]
      >;
      app_settings: Table<
        AppSettingRow,
        Partial<AppSettingRow> & { key: string },
        Partial<AppSettingRow>
      >;
      email_logs: Table<
        EmailLogRow,
        Partial<EmailLogRow> & { to_email: string; status: EmailLogStatusRow },
        Partial<EmailLogRow>,
        [
          {
            foreignKeyName: "email_logs_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_logs_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "email_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_logs_communication_recipient_id_fkey";
            columns: ["communication_recipient_id"];
            isOneToOne: false;
            referencedRelation: "communication_recipients";
            referencedColumns: ["id"];
          },
        ]
      >;
      tournament_communications: Table<
        TournamentCommunicationRow,
        Partial<TournamentCommunicationRow> & {
          tournament_id: string;
          type: string;
          subject: string;
          body: string;
          recipient_filter: string;
        },
        Partial<TournamentCommunicationRow>,
        [
          {
            foreignKeyName: "tournament_communications_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ]
      >;
      communication_recipients: Table<
        CommunicationRecipientRow,
        Partial<CommunicationRecipientRow> & {
          communication_id: string;
          recipient_email: string;
          recipient_team_name: string;
        },
        Partial<CommunicationRecipientRow>,
        [
          {
            foreignKeyName: "communication_recipients_communication_id_fkey";
            columns: ["communication_id"];
            isOneToOne: false;
            referencedRelation: "tournament_communications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "communication_recipients_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "communication_recipients_team_directory_entry_id_fkey";
            columns: ["team_directory_entry_id"];
            isOneToOne: false;
            referencedRelation: "team_directory_entries";
            referencedColumns: ["id"];
          },
        ]
      >;
      communication_confirmation_tokens: Table<
        CommunicationConfirmationTokenRow,
        Partial<CommunicationConfirmationTokenRow> & {
          communication_recipient_id: string;
          token_hash: string;
          expires_at: string;
        },
        Partial<CommunicationConfirmationTokenRow>,
        [
          {
            foreignKeyName: "communication_confirmation_tokens_communication_recipient_id_fkey";
            columns: ["communication_recipient_id"];
            isOneToOne: true;
            referencedRelation: "communication_recipients";
            referencedColumns: ["id"];
          },
        ]
      >;
      secure_access_tokens: Table<
        SecureAccessTokenRow,
        Partial<SecureAccessTokenRow> & {
          application_id: string;
          purpose: SecureAccessTokenRow["purpose"];
          token_hash: string;
          expires_at: string;
        },
        Partial<SecureAccessTokenRow>,
        [
          {
            foreignKeyName: "secure_access_tokens_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ]
      >;
      cancellation_requests: Table<
        CancellationRequestRow,
        Partial<CancellationRequestRow> & {
          application_id: string;
          requested_by_type: CancellationRequestRow["requested_by_type"];
        },
        Partial<CancellationRequestRow>,
        [
          {
            foreignKeyName: "cancellation_requests_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ]
      >;
      cancellation_email_send_keys: Table<
        CancellationEmailSendKeyRow,
        Partial<CancellationEmailSendKeyRow> & {
          cancellation_request_id: string;
          template_type: EmailTemplateTypeRow;
        },
        Partial<CancellationEmailSendKeyRow>,
        [
          {
            foreignKeyName: "cancellation_email_send_keys_cancellation_request_id_fkey";
            columns: ["cancellation_request_id"];
            isOneToOne: false;
            referencedRelation: "cancellation_requests";
            referencedColumns: ["id"];
          },
        ]
      >;
      tournament_groups: Table<
        TournamentGroupRow,
        Partial<TournamentGroupRow> & { tournament_id: string; name: string },
        Partial<TournamentGroupRow>,
        [
          {
            foreignKeyName: "tournament_groups_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ]
      >;
      tournament_group_members: Table<
        TournamentGroupMemberRow,
        Partial<TournamentGroupMemberRow> & {
          group_id: string;
          application_id?: string | null;
          external_team_id?: string | null;
        },
        Partial<TournamentGroupMemberRow>,
        [
          {
            foreignKeyName: "tournament_group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "tournament_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_group_members_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: true;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_group_members_external_team_id_fkey";
            columns: ["external_team_id"];
            isOneToOne: true;
            referencedRelation: "tournament_external_teams";
            referencedColumns: ["id"];
          },
        ]
      >;
      tournament_external_teams: Table<
        TournamentExternalTeamRow,
        Partial<TournamentExternalTeamRow> & {
          tournament_id: string;
          external_id: string;
          name: string;
        },
        Partial<TournamentExternalTeamRow>,
        [
          {
            foreignKeyName: "tournament_external_teams_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_external_teams_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ]
      >;
      tournament_fields: Table<
        TournamentFieldRow,
        Partial<TournamentFieldRow> & { tournament_id: string; name: string },
        Partial<TournamentFieldRow>,
        [
          {
            foreignKeyName: "tournament_fields_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ]
      >;
      tournament_matches: Table<
        TournamentMatchRow,
        Partial<TournamentMatchRow> & {
          tournament_id: string;
          home_application_id?: string | null;
          away_application_id?: string | null;
        },
        Partial<TournamentMatchRow>,
        [
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_matches_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "tournament_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_matches_field_id_fkey";
            columns: ["field_id"];
            isOneToOne: false;
            referencedRelation: "tournament_fields";
            referencedColumns: ["id"];
          },
        ]
      >;
    };
    Views: Record<string, never>;
    Functions: {
      current_club_id: { Args: Record<string, never>; Returns: string | null };
      current_profile_role: { Args: Record<string, never>; Returns: UserRoleRow };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_super_admin: { Args: Record<string, never>; Returns: boolean };
      is_profile_active: { Args: Record<string, never>; Returns: boolean };
      has_rbac_permission: {
        Args: { p_permission: string; p_club_id?: string | null; p_team_id?: string | null };
        Returns: boolean;
      };
      count_active_super_admins: {
        Args: { p_exclude_user_id?: string | null };
        Returns: number;
      };
      rbac_set_user_active: {
        Args: { p_user_id: string; p_is_active: boolean };
        Returns: undefined;
      };
      rbac_assign_user_role: {
        Args: { p_user_id: string; p_role_key: string; p_club_id?: string | null };
        Returns: undefined;
      };
      rbac_accept_pending_invitation: {
        Args: Record<string, never>;
        Returns: Array<{ invitation_id: string | null; outcome: string }>;
      };
      rbac_revoke_user_role: {
        Args: { p_user_id: string; p_role_key: string; p_club_id?: string | null };
        Returns: undefined;
      };
      rbac_assign_team: {
        Args: { p_user_id: string; p_team_id: string };
        Returns: undefined;
      };
      rbac_revoke_team: {
        Args: { p_user_id: string; p_team_id: string };
        Returns: undefined;
      };
      ensure_own_club: {
        Args: { p_name: string; p_city?: string | null; p_website?: string | null };
        Returns: string;
      };
      tournament_occupancy: {
        Args: Record<string, never>;
        Returns: TournamentOccupancyRow[];
      };
      tournament_public_roster: {
        Args: { p_slug: string };
        Returns: TournamentPublicRosterRow[];
      };
      club_logo_urls: {
        Args: { p_club_ids: string[] };
        Returns: Array<{ id: string; logo_url: string | null }>;
      };
      guest_application_allowed: {
        Args: { p_tournament_id: string };
        Returns: boolean;
      };
      create_guest_application: {
        Args: { p_payload: Json };
        Returns: string;
      };
      active_email_template: {
        Args: { p_type: EmailTemplateTypeRow };
        Returns: ActiveEmailTemplateRow[];
      };
      log_application_received_email: {
        Args: {
          p_application_id: string;
          p_to_email: string;
          p_template_id: string | null;
          p_subject: string | null;
          p_body: string | null;
          p_status: string;
          p_error: string | null;
          p_provider: string | null;
          p_provider_message_id: string | null;
        };
        Returns: undefined;
      };
      reserve_application_status_email_send: {
        Args: {
          p_application_id: string;
          p_template_type: EmailTemplateTypeRow;
        };
        Returns: string;
      };
      reserve_application_status_email_send_v2: {
        Args: {
          p_application_id: string;
          p_template_type: EmailTemplateTypeRow;
        };
        Returns: {
          decision: string;
          reservation_id: string | null;
        }[];
      };
      release_application_status_email_send: {
        Args: {
          p_application_id: string;
          p_template_type: EmailTemplateTypeRow;
        };
        Returns: undefined;
      };
      release_application_status_email_send_v2: {
        Args: {
          p_application_id: string;
          p_template_type: EmailTemplateTypeRow;
          p_reservation_id: string;
        };
        Returns: undefined;
      };
      claim_application_status_email_send_v2: {
        Args: {
          p_application_id: string;
          p_template_type: EmailTemplateTypeRow;
          p_reservation_id: string;
          p_provider_message_id: string;
        };
        Returns: boolean;
      };
      store_secure_access_token: {
        Args: {
          p_application_id: string;
          p_purpose: "cancellation" | "communication_confirm";
          p_token_hash: string;
          p_expires_at: string;
        };
        Returns: string;
      };
      validate_secure_access_token: {
        Args: {
          p_token_hash: string;
          p_purpose: "cancellation" | "communication_confirm";
        };
        Returns: Array<{
          token_id: string;
          application_id: string;
          tournament_name: string;
          team_name: string;
          tournament_date: string;
        }>;
      };
      get_external_participation_payment_by_token: {
        Args: {
          p_token_hash: string;
          p_purpose: "cancellation" | "communication_confirm";
        };
        Returns: Array<{
          payment_status: PaymentStatusRow;
          participation_fee: number | null;
          paid_at: string | null;
        }>;
      };
      submit_cancellation_request_external: {
        Args: {
          p_token_hash: string;
          p_reason: string;
        };
        Returns: string;
      };
      issue_participation_access_recovery_token: {
        Args: {
          p_tournament_id: string;
          p_contact_email: string;
          p_email_identifier_hash: string;
          p_ip_identifier_hash: string;
          p_token_hash: string;
        };
        Returns: Array<{
          application_id: string;
          contact_email: string;
          contact_first_name: string;
          tournament_name: string;
        }>;
      };
      decide_cancellation_request: {
        Args: {
          p_request_id: string;
          p_decision: string;
          p_admin_note?: string | null;
        };
        Returns: undefined;
      };
      reserve_cancellation_email_send: {
        Args: {
          p_cancellation_request_id: string;
          p_template_type: EmailTemplateTypeRow;
        };
        Returns: string;
      };
      reserve_external_cancellation_email_send: {
        Args: {
          p_token_hash: string;
          p_cancellation_request_id: string;
          p_template_type: EmailTemplateTypeRow;
        };
        Returns: string;
      };
      preview_communication_recipients: {
        Args: {
          p_tournament_id: string;
          p_communication_type: string;
          p_recipient_filter: string;
          p_application_ids?: string[] | null;
          p_recipient_source?: string;
          p_team_directory_entry_ids?: string[] | null;
        };
        Returns: Array<{
          application_id: string | null;
          team_directory_entry_id: string | null;
          recipient_email: string;
          recipient_team_name: string;
          recipient_club_name: string | null;
          recipient_contact_first_name: string | null;
        }>;
      };
      initiate_communication_send: {
        Args: {
          p_tournament_id: string;
          p_type: string;
          p_subject: string;
          p_body: string;
          p_important: boolean;
          p_recipient_filter: string;
          p_application_ids?: string[] | null;
          p_idempotency_key?: string | null;
          p_require_confirmation?: boolean;
          p_recipient_source?: string;
          p_team_directory_entry_ids?: string[] | null;
        };
        Returns: string;
      };
      issue_communication_confirmation_token: {
        Args: {
          p_communication_recipient_id: string;
          p_token_hash: string;
          p_expires_at: string;
        };
        Returns: string;
      };
      get_communication_receipt_context: {
        Args: {
          p_token_hash: string;
        };
        Returns: Array<{
          subject: string;
          body: string;
          tournament_name: string;
          team_name: string;
          confirmation_required: boolean;
          confirmed_at: string | null;
        }>;
      };
      confirm_communication_receipt: {
        Args: {
          p_token_hash: string;
        };
        Returns: Array<{
          confirmed_at: string;
          already_confirmed: boolean;
        }>;
      };
      reserve_communication_email_send: {
        Args: {
          p_communication_recipient_id: string;
        };
        Returns: string;
      };
      complete_communication_recipient: {
        Args: {
          p_recipient_id: string;
          p_send_status: string;
          p_email_log_id?: string | null;
          p_error_message?: string | null;
        };
        Returns: undefined;
      };
      finalize_communication: {
        Args: {
          p_communication_id: string;
        };
        Returns: undefined;
      };
      list_pending_communication_recipients: {
        Args: {
          p_communication_id: string;
        };
        Returns: Array<{
          id: string;
          application_id: string | null;
          team_directory_entry_id: string | null;
          recipient_email: string;
          recipient_team_name: string;
          recipient_club_name: string | null;
          recipient_contact_first_name: string | null;
        }>;
      };
      sync_mein_turnierplan_tournament: {
        Args: {
          p_tournament_id: string;
          p_payload: Json;
          p_overwrite_manual?: boolean;
        };
        Returns: Json;
      };
    };
    Enums: {
      user_role: UserRoleRow;
      application_status: ApplicationStatusRow;
      payment_status: PaymentStatusRow;
      tournament_status: TournamentStatusRow;
      internal_category: InternalCategoryRow;
      club_status: ClubStatusRow;
      email_template_type: EmailTemplateTypeRow;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type ApplicationWithRelations = ApplicationRow & {
  clubs?: Pick<ClubRow, "id" | "name" | "city" | "website" | "contact_phone"> | null;
  teams?: Pick<
    TeamRow,
    | "id"
    | "name"
    | "age_group"
    | "birth_year"
    | "league"
    | "division"
    | "self_rated_strength"
    | "trainer_name"
  > | null;
  tournaments?: Pick<
    TournamentRow,
    "id" | "slug" | "name" | "age_group" | "date" | "location" | "status" | "max_teams"
  > | null;
  application_reviews?:
    | Pick<
        ApplicationReviewRow,
        "internal_category" | "internal_strength" | "internal_note" | "reviewed_by"
      >
    | Pick<
        ApplicationReviewRow,
        "internal_category" | "internal_strength" | "internal_note" | "reviewed_by"
      >[]
    | null;
};

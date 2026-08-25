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
  | "rejected";
export type TournamentStatusRow = "coming-soon" | "active" | "full" | "completed";
export type InternalCategoryRow = "S" | "A" | "B" | "C";
export type ClubStatusRow = "active" | "inactive";
export type EmailTemplateTypeRow =
  | "application-received"
  | "application-accepted"
  | "application-under-review"
  | "waiting-list"
  | "application-rejected"
  | "follow-up"
  | "general";

export type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: UserRoleRow;
  club_id: string | null;
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
  staff_count: number | null;
  notes: string | null;
  status: ApplicationStatusRow;
  created_at: string;
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
  created_by: string | null;
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

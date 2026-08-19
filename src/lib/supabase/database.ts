export type UserRoleRow = "club" | "admin" | "super-admin";
export type ApplicationStatusRow =
  | "new"
  | "under-review"
  | "accepted"
  | "waiting-list"
  | "rejected";
export type TournamentStatusRow = "coming-soon" | "active" | "full" | "completed";
export type InternalCategoryRow = "S" | "A" | "B" | "C";

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
  created_at: string;
  updated_at: string;
};

export type ApplicationRow = {
  id: string;
  tournament_id: string;
  club_id: string;
  team_id: string;
  submitted_by: string | null;
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
          club_id: string;
          team_id: string;
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
    };
    Enums: {
      user_role: UserRoleRow;
      application_status: ApplicationStatusRow;
      tournament_status: TournamentStatusRow;
      internal_category: InternalCategoryRow;
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

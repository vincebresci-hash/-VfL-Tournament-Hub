import type { TeamDirectoryEntry, TeamDirectoryListItem } from "@/types/team-directory";
import type { TeamDirectorySource } from "@/types/team-directory";

type TeamDirectoryRow = {
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
  source: TeamDirectorySource;
  source_application_id: string | null;
  club_id: string | null;
  team_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export function toTeamDirectoryEntry(row: TeamDirectoryRow): TeamDirectoryEntry {
  return {
    id: row.id,
    clubName: row.club_name,
    teamName: row.team_name,
    ageGroup: row.age_group,
    contactFirstName: row.contact_first_name,
    contactLastName: row.contact_last_name,
    contactRole: row.contact_role,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    website: row.website,
    league: row.league,
    birthYear: row.birth_year,
    division: row.division,
    selfRatedStrength: row.self_rated_strength,
    internalCategory: row.internal_category,
    internalStrength: row.internal_strength,
    internalNotes: row.internal_notes,
    source: row.source,
    sourceApplicationId: row.source_application_id,
    clubId: row.club_id,
    teamId: row.team_id,
    isHubLinked: row.team_id !== null && row.club_id !== null,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toTeamDirectoryListItem(
  row: TeamDirectoryRow & {
    last_participation_at?: string | null;
    last_tournament_name?: string | null;
    application_history_count?: number | null;
  },
): TeamDirectoryListItem {
  return {
    ...toTeamDirectoryEntry(row),
    lastParticipationAt: row.last_participation_at ?? null,
    lastTournamentName: row.last_tournament_name ?? null,
    applicationHistoryCount: row.application_history_count ?? 0,
  };
}

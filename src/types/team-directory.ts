export const TEAM_DIRECTORY_SOURCES = ["application", "manual"] as const;

export type TeamDirectorySource = (typeof TEAM_DIRECTORY_SOURCES)[number];

export type TeamDirectoryEntry = {
  id: string;
  clubName: string;
  teamName: string;
  ageGroup: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactRole: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  league: string | null;
  birthYear: number | null;
  division: string | null;
  selfRatedStrength: number | null;
  internalCategory: string | null;
  internalStrength: number | null;
  internalNotes: string | null;
  source: TeamDirectorySource;
  sourceApplicationId: string | null;
  clubId: string | null;
  teamId: string | null;
  isHubLinked: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TeamDirectoryListItem = TeamDirectoryEntry & {
  lastParticipationAt: string | null;
  lastTournamentName: string | null;
  applicationHistoryCount: number;
};

export type TeamDirectoryApplicationHistory = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  tournamentSlug: string;
  tournamentDate: string | null;
  status: string;
  paymentStatus: string | null;
  ageGroup: string | null;
  createdAt: string;
};

export type TeamDirectoryDuplicateMatch = {
  id: string;
  clubName: string;
  teamName: string;
  ageGroup: string | null;
  contactEmail: string | null;
  matchReason: "team_id" | "club_team_age" | "normalized_identity";
  archivedAt: string | null;
};

export type TeamDirectorySaveInput = {
  clubName: string;
  teamName: string;
  ageGroup?: string | null;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  contactRole?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  website?: string | null;
  league?: string | null;
  birthYear?: number | null;
  division?: string | null;
  selfRatedStrength?: number | null;
  internalCategory?: string | null;
  internalStrength?: number | null;
  internalNotes?: string | null;
  sourceApplicationId?: string | null;
  clubId?: string | null;
  teamId?: string | null;
  source?: TeamDirectorySource;
  forceCreate?: boolean;
};

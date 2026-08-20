export const MATCH_STATUSES = [
  "scheduled",
  "live",
  "completed",
  "cancelled",
] as const;

export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MATCH_PHASES = ["group", "knockout"] as const;

export type MatchPhase = (typeof MATCH_PHASES)[number];

export const TOURNAMENT_STAGE_STATUSES = [
  "preparation",
  "groups-created",
  "schedule-created",
  "live",
  "completed",
] as const;

export type TournamentStageStatus = (typeof TOURNAMENT_STAGE_STATUSES)[number];

export const tournamentStageStatusLabel: Record<TournamentStageStatus, string> = {
  preparation: "Turnier Vorbereitung",
  "groups-created": "Gruppen erstellt",
  "schedule-created": "Spielplan erstellt",
  live: "Turnier läuft",
  completed: "Abgeschlossen",
};

export type TournamentGroupRecord = {
  id: string;
  tournamentId: string;
  name: string;
  sortOrder: number;
};

export type TournamentFieldRecord = {
  id: string;
  tournamentId: string;
  name: string;
  sortOrder: number;
};

export type TournamentMatchRecord = {
  id: string;
  tournamentId: string;
  groupId: string | null;
  fieldId: string | null;
  homeApplicationId: string;
  awayApplicationId: string;
  scheduledAt: string | null;
  durationMinutes: number;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  phase: MatchPhase;
  sortOrder: number;
};

export type TournamentScheduleSettings = {
  matchDurationMinutes: number;
  breakMinutes: number;
  minimumRestMinutes: number;
  lunchBreakStart: string | null;
  lunchBreakEnd: string | null;
};

export type PublicRosterEntry = {
  applicationId: string;
  clubName: string;
  teamName: string;
  ageGroup: string | null;
  birthYear: number | null;
  groupId: string | null;
  groupName: string | null;
  groupSortOrder: number | null;
};

export type StandingRow = {
  applicationId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  rank: number;
};

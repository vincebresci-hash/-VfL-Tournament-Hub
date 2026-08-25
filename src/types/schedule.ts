export const MATCH_STATUSES = [
  "scheduled",
  "live",
  "completed",
  "cancelled",
] as const;

export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MATCH_PHASES = ["group", "knockout"] as const;

export type MatchPhase = (typeof MATCH_PHASES)[number];

export const KNOCKOUT_ROUNDS = [
  "quarterfinal",
  "semifinal",
  "third-place",
  "final",
  "placement-5",
  "placement-7",
] as const;

export type KnockoutRound = (typeof KNOCKOUT_ROUNDS)[number];

export const KNOCKOUT_SLOTS = ["home", "away"] as const;

export type KnockoutSlot = (typeof KNOCKOUT_SLOTS)[number];

export const DECIDED_BY = ["regular", "penalties"] as const;

export type DecidedBy = (typeof DECIDED_BY)[number];

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
  externalSource?: string | null;
  externalId?: string | null;
  manualOverride?: boolean;
};

export type TournamentFieldRecord = {
  id: string;
  tournamentId: string;
  name: string;
  sortOrder: number;
  externalSource?: string | null;
  externalId?: string | null;
  manualOverride?: boolean;
};

export type TournamentMatchRecord = {
  id: string;
  tournamentId: string;
  groupId: string | null;
  fieldId: string | null;
  homeApplicationId: string | null;
  awayApplicationId: string | null;
  homeExternalTeamId?: string | null;
  awayExternalTeamId?: string | null;
  scheduledAt: string | null;
  durationMinutes: number;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  phase: MatchPhase;
  sortOrder: number;
  round: KnockoutRound | null;
  nextMatchId: string | null;
  nextMatchSlot: KnockoutSlot | null;
  loserNextMatchId: string | null;
  loserNextMatchSlot: KnockoutSlot | null;
  decidedBy: DecidedBy;
  homePenalties: number | null;
  awayPenalties: number | null;
  externalSource?: string | null;
  externalId?: string | null;
  manualOverride?: boolean;
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
  source?: "hub" | "mein-turnierplan";
  externalTeamId?: string | null;
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

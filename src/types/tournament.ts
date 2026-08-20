export const AGE_GROUPS = ["U8", "U9", "U10", "U11", "U12", "U13", "U14"] as const;

export type AgeGroup = (typeof AGE_GROUPS)[number];

export const TOURNAMENT_STATUSES = [
  "coming-soon",
  "active",
  "full",
  "completed",
] as const;

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export type Tournament = {
  id: string;
  slug: string;
  name: string;
  ageGroup: AgeGroup;
  date: string;
  location: string;
  image: string;
  description: string;
  status: TournamentStatus;
  maxTeams: number;
  confirmedTeams: number;
  applicationsCount: number;
  waitlistCount: number;
  applicationStart: string | null;
  applicationDeadline: string | null;
  startTime: string | null;
  endTime: string | null;
  address: string | null;
  shortDescription: string | null;
  birthYear: number | null;
  waitlistEnabled: boolean;
  applicationsOpen: boolean;
  archivedAt: string | null;
  availableSlots: number;
  isFull: boolean;
};

export type PublicTournament = Omit<
  Tournament,
  "confirmedTeams" | "applicationsCount" | "waitlistCount"
>;

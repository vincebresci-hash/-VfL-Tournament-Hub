export const AGE_GROUPS = ["U8", "U9", "U10", "U11", "U12", "U13", "U14"] as const;

export type AgeGroup = (typeof AGE_GROUPS)[number];

export const TOURNAMENT_STATUSES = [
  "coming-soon",
  "active",
  "full",
  "completed",
] as const;

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export const TOURNAMENT_PUBLIC_INFO_FIELDS = [
  { key: "playFormat", column: "play_format", label: "Spielmodus" },
  { key: "playingTime", column: "playing_time", label: "Spielzeit" },
  { key: "pitchFormat", column: "pitch_format", label: "Feld- / Spielform" },
  { key: "entryFee", column: "entry_fee", label: "Startgebühr" },
  { key: "travelInfo", column: "travel_info", label: "Anreise / Parken" },
  { key: "changingRooms", column: "changing_rooms", label: "Umkleiden" },
  { key: "catering", column: "catering", label: "Verpflegung" },
  { key: "teamInfo", column: "team_info", label: "Hinweise für Mannschaften" },
] as const;

export type TournamentPublicInfoKey = (typeof TOURNAMENT_PUBLIC_INFO_FIELDS)[number]["key"];

export type TournamentPublicInfo = Record<TournamentPublicInfoKey, string | null>;

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
  maxTeams: number | null;
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
  meinTurnierplanUrl: string | null;
  meinTurnierplanEnabled: boolean;
  meinTurnierplanLabel: string | null;
  meinTurnierplanEmbedUrl: string | null;
} & TournamentPublicInfo;

export type PublicTournament = Omit<Tournament, "applicationsCount">;

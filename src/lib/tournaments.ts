import { ageGroupImageSrc } from "@/data/tournaments";
import { getAvailableSlots, isTournamentFull } from "@/lib/tournament-capacity";
import { optimizePublicImageSrc } from "@/lib/public-images";
import { nonempty } from "@/lib/text";
import { tournamentStatusOrder } from "@/lib/tournament-status";
import { asLiveDataSource } from "@/lib/mein-turnierplan";
import { AGE_GROUPS, TOURNAMENT_PUBLIC_INFO_FIELDS, TOURNAMENT_STATUSES } from "@/types/tournament";
import type {
  AgeGroup,
  PublicTournament,
  Tournament,
  TournamentPublicInfo,
  TournamentStatus,
} from "@/types/tournament";
import type { TournamentRow } from "@/lib/supabase/database";
import type { AdminTournamentRecord } from "@/types/admin";

export { ageGroupImageSrc } from "@/data/tournaments";

export const FEATURED_TOURNAMENT_LIMIT = 4;

const featuredStatuses: TournamentStatus[] = ["active", "coming-soon", "full"];

export const TOURNAMENT_SELECT_TIERS = ["info", "full", "basic"] as const;

export type TournamentSelectTier = (typeof TOURNAMENT_SELECT_TIERS)[number];

const TOURNAMENT_SELECT = [
  "id",
  "slug",
  "name",
  "age_group",
  "date",
  "location",
  "image_url",
  "max_teams",
  "status",
  "application_start",
  "application_deadline",
  "description",
  "start_time",
  "end_time",
  "address",
  "short_description",
  "birth_year",
  "waitlist_enabled",
  "applications_open",
  "archived_at",
  "match_duration_minutes",
  "break_minutes",
  "minimum_rest_minutes",
  "lunch_break_start",
  "lunch_break_end",
  "mein_turnierplan_url",
  "mein_turnierplan_enabled",
  "mein_turnierplan_label",
  "mein_turnierplan_embed_url",
  "live_data_source",
  "mein_turnierplan_tournament_id",
  "mein_turnierplan_matches_widget_url",
  "mein_turnierplan_table_widget_url",
  "public_schedule_note",
  "public_live_note",
].join(", ");

const TOURNAMENT_SELECT_BASIC = [
  "id",
  "slug",
  "name",
  "age_group",
  "date",
  "location",
  "image_url",
  "max_teams",
  "status",
  "application_start",
  "application_deadline",
  "description",
].join(", ");

const TOURNAMENT_SELECT_INFO = [
  TOURNAMENT_SELECT,
  ...TOURNAMENT_PUBLIC_INFO_FIELDS.map((field) => field.column),
].join(", ");

export function getTournamentSelect(tier: TournamentSelectTier | boolean = "info") {
  if (tier === true || tier === "info") {
    return TOURNAMENT_SELECT_INFO;
  }

  if (tier === "full") {
    return TOURNAMENT_SELECT;
  }

  return TOURNAMENT_SELECT_BASIC;
}

export function asAgeGroup(value: string | null | undefined, fallback: AgeGroup = "U10"): AgeGroup {
  if (value && AGE_GROUPS.includes(value as AgeGroup)) {
    return value as AgeGroup;
  }

  return fallback;
}

export function asTournamentStatus(value: string | null | undefined): TournamentStatus {
  if (value && TOURNAMENT_STATUSES.includes(value as TournamentStatus)) {
    return value as TournamentStatus;
  }

  return "coming-soon";
}

export function fallbackTournamentImage(ageGroup: AgeGroup, imageUrl?: string | null) {
  const trimmed = imageUrl?.trim();
  if (trimmed) {
    return optimizePublicImageSrc(trimmed);
  }

  return ageGroupImageSrc[ageGroup];
}

export function slugifyTournamentName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeTimeValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

function asBoolean(value: boolean | null | undefined, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asPositiveInt(
  value: number | null | undefined,
  fallback: number,
  allowZero = false,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  if (allowZero ? value < 0 : value <= 0) {
    return fallback;
  }

  return value;
}

function meinTurnierplanFieldsFromRow(row: TournamentRow) {
  return {
    meinTurnierplanUrl: nonempty(row.mein_turnierplan_url),
    meinTurnierplanEnabled: asBoolean(row.mein_turnierplan_enabled, false),
    meinTurnierplanLabel: nonempty(row.mein_turnierplan_label),
    meinTurnierplanEmbedUrl: nonempty(row.mein_turnierplan_embed_url),
    liveDataSource: asLiveDataSource(row.live_data_source),
    meinTurnierplanTournamentId: nonempty(row.mein_turnierplan_tournament_id),
    meinTurnierplanMatchesWidgetUrl: nonempty(row.mein_turnierplan_matches_widget_url),
    meinTurnierplanTableWidgetUrl: nonempty(row.mein_turnierplan_table_widget_url),
    publicScheduleNote: nonempty(row.public_schedule_note),
    publicLiveNote: nonempty(row.public_live_note),
  };
}

export function applicationBelongsToTournament(
  application: { tournamentId: string },
  tournament: { id: string; slug: string },
) {
  return (
    application.tournamentId === tournament.slug ||
    application.tournamentId === tournament.id
  );
}

export function emptyTournamentPublicInfo(): TournamentPublicInfo {
  return {
    playFormat: null,
    playingTime: null,
    pitchFormat: null,
    entryFee: null,
    travelInfo: null,
    changingRooms: null,
    catering: null,
    teamInfo: null,
  };
}

function publicInfoFromRow(row: TournamentRow): TournamentPublicInfo {
  return {
    playFormat: nonempty(row.play_format),
    playingTime: nonempty(row.playing_time),
    pitchFormat: nonempty(row.pitch_format),
    entryFee: nonempty(row.entry_fee),
    travelInfo: nonempty(row.travel_info),
    changingRooms: nonempty(row.changing_rooms),
    catering: nonempty(row.catering),
    teamInfo: nonempty(row.team_info),
  };
}

export function toPublicTournament(tournament: Tournament): PublicTournament {
  const { applicationsCount, ...publicTournament } = tournament;
  void applicationsCount;
  return publicTournament;
}

export function toTournamentFromRow(
  row: TournamentRow,
  occupancy?: {
    confirmedTeams?: number;
    applicationsCount?: number;
    waitlistCount?: number;
  },
): Tournament {
  const ageGroup = asAgeGroup(row.age_group);
  const confirmedTeams = occupancy?.confirmedTeams ?? 0;
  const maxTeams = row.max_teams;
  const availableSlots = getAvailableSlots(row.max_teams, confirmedTeams);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    ageGroup,
    date: row.date,
    location: row.location ?? "",
    image: fallbackTournamentImage(ageGroup, row.image_url),
    description: row.description ?? row.short_description ?? "",
    status: asTournamentStatus(row.status),
    maxTeams,
    confirmedTeams,
    applicationsCount: occupancy?.applicationsCount ?? 0,
    waitlistCount: occupancy?.waitlistCount ?? 0,
    applicationStart: row.application_start,
    applicationDeadline: row.application_deadline,
    startTime: normalizeTimeValue(row.start_time),
    endTime: normalizeTimeValue(row.end_time),
    address: row.address ?? null,
    shortDescription: row.short_description ?? null,
    birthYear: row.birth_year ?? null,
    waitlistEnabled: asBoolean(row.waitlist_enabled, true),
    applicationsOpen: asBoolean(row.applications_open, true),
    archivedAt: row.archived_at ?? null,
    availableSlots: Number.isFinite(availableSlots) ? availableSlots : 0,
    isFull: isTournamentFull(row.max_teams, confirmedTeams),
    ...meinTurnierplanFieldsFromRow(row),
    ...publicInfoFromRow(row),
  };
}

export function toAdminTournamentRecord(row: TournamentRow): AdminTournamentRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    ageGroup: row.age_group,
    date: row.date,
    location: row.location,
    status: asTournamentStatus(row.status),
    maxTeams: row.max_teams,
    description: row.description,
    imageUrl: row.image_url,
    startTime: normalizeTimeValue(row.start_time),
    endTime: normalizeTimeValue(row.end_time),
    address: row.address ?? null,
    shortDescription: row.short_description ?? null,
    birthYear: row.birth_year ?? null,
    waitlistEnabled: asBoolean(row.waitlist_enabled, true),
    applicationsOpen: asBoolean(row.applications_open, true),
    applicationStart: row.application_start,
    applicationDeadline: row.application_deadline,
    archivedAt: row.archived_at ?? null,
    matchDurationMinutes: asPositiveInt(row.match_duration_minutes, 12),
    breakMinutes: asPositiveInt(row.break_minutes, 3, true),
    minimumRestMinutes: asPositiveInt(row.minimum_rest_minutes, 15, true),
    lunchBreakStart: normalizeTimeValue(row.lunch_break_start),
    lunchBreakEnd: normalizeTimeValue(row.lunch_break_end),
    playFormat: nonempty(row.play_format),
    playingTime: nonempty(row.playing_time),
    pitchFormat: nonempty(row.pitch_format),
    entryFee: nonempty(row.entry_fee),
    travelInfo: nonempty(row.travel_info),
    changingRooms: nonempty(row.changing_rooms),
    catering: nonempty(row.catering),
    teamInfo: nonempty(row.team_info),
    ...meinTurnierplanFieldsFromRow(row),
  };
}

export function toBoardTournament(record: AdminTournamentRecord): Tournament {
  const ageGroup = asAgeGroup(record.ageGroup);

  return {
    id: record.slug,
    slug: record.slug,
    name: record.name,
    ageGroup,
    date: record.date,
    location: record.location ?? "",
    image: fallbackTournamentImage(ageGroup, record.imageUrl),
    description: record.description ?? "",
    status: record.status,
    maxTeams: record.maxTeams,
    confirmedTeams: 0,
    applicationsCount: 0,
    waitlistCount: 0,
    applicationStart: record.applicationStart,
    applicationDeadline: record.applicationDeadline,
    startTime: record.startTime,
    endTime: record.endTime,
    address: record.address,
    shortDescription: record.shortDescription,
    birthYear: record.birthYear,
    waitlistEnabled: record.waitlistEnabled,
    applicationsOpen: record.applicationsOpen,
    archivedAt: record.archivedAt,
    availableSlots: 0,
    isFull: false,
    ...emptyTournamentPublicInfo(),
    playFormat: record.playFormat,
    playingTime: record.playingTime,
    pitchFormat: record.pitchFormat,
    entryFee: record.entryFee,
    travelInfo: record.travelInfo,
    changingRooms: record.changingRooms,
    catering: record.catering,
    teamInfo: record.teamInfo,
    meinTurnierplanUrl: record.meinTurnierplanUrl,
    meinTurnierplanEnabled: record.meinTurnierplanEnabled,
    meinTurnierplanLabel: record.meinTurnierplanLabel,
    meinTurnierplanEmbedUrl: record.meinTurnierplanEmbedUrl,
    liveDataSource: record.liveDataSource,
    meinTurnierplanTournamentId: record.meinTurnierplanTournamentId,
    meinTurnierplanMatchesWidgetUrl: record.meinTurnierplanMatchesWidgetUrl,
    meinTurnierplanTableWidgetUrl: record.meinTurnierplanTableWidgetUrl,
    publicScheduleNote: record.publicScheduleNote,
    publicLiveNote: record.publicLiveNote,
  };
}

export function sortTournaments<T extends Pick<Tournament, "date" | "status">>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => {
    const statusDiff =
      tournamentStatusOrder[a.status] - tournamentStatusOrder[b.status];

    if (statusDiff !== 0) {
      return statusDiff;
    }

    if (a.status === "completed") {
      return b.date.localeCompare(a.date);
    }

    return a.date.localeCompare(b.date);
  });
}

export function getFeaturedFromList(
  tournaments: PublicTournament[],
  limit = FEATURED_TOURNAMENT_LIMIT,
): PublicTournament[] {
  return sortTournaments(
    tournaments.filter((tournament) => featuredStatuses.includes(tournament.status)),
  ).slice(0, limit);
}

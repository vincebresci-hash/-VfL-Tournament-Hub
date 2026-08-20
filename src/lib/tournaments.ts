import { ageGroupImageSrc } from "@/data/tournaments";
import { getAvailableSlots, isTournamentFull } from "@/lib/tournament-capacity";
import { tournamentStatusOrder } from "@/lib/tournament-status";
import { AGE_GROUPS, TOURNAMENT_STATUSES } from "@/types/tournament";
import type {
  AgeGroup,
  PublicTournament,
  Tournament,
  TournamentStatus,
} from "@/types/tournament";
import type { TournamentRow } from "@/lib/supabase/database";
import type { AdminTournamentRecord } from "@/types/admin";

export { ageGroupImageSrc } from "@/data/tournaments";

export const FEATURED_TOURNAMENT_LIMIT = 4;

const featuredStatuses: TournamentStatus[] = ["active", "coming-soon", "full"];

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

export function getTournamentSelect(full = true) {
  return full ? TOURNAMENT_SELECT : TOURNAMENT_SELECT_BASIC;
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
    return trimmed;
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

export function toPublicTournament(tournament: Tournament): PublicTournament {
  return {
    id: tournament.id,
    slug: tournament.slug,
    name: tournament.name,
    ageGroup: tournament.ageGroup,
    date: tournament.date,
    location: tournament.location,
    image: tournament.image,
    description: tournament.description,
    status: tournament.status,
    maxTeams: tournament.maxTeams,
    applicationStart: tournament.applicationStart,
    applicationDeadline: tournament.applicationDeadline,
    startTime: tournament.startTime,
    endTime: tournament.endTime,
    address: tournament.address,
    shortDescription: tournament.shortDescription,
    birthYear: tournament.birthYear,
    waitlistEnabled: tournament.waitlistEnabled,
    applicationsOpen: tournament.applicationsOpen,
    archivedAt: tournament.archivedAt,
    availableSlots: tournament.availableSlots,
    isFull: tournament.isFull,
  };
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
  const maxTeams = row.max_teams ?? 0;
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
    maxTeams: record.maxTeams ?? 0,
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

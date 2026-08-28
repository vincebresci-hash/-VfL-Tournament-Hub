import { AGE_GROUPS } from "@/types/tournament";
import { APPLICATION_STATUSES, INTERNAL_CATEGORIES, TEAM_STRENGTHS, CLUB_TYPES } from "@/types/application";
import type {
  AdminApplication,
  ApplicationStatus,
  ClubType,
  InternalCategory,
  TeamStrength,
} from "@/types/application";
import type { ClubApplicationView } from "@/types/club";
import type { ClubProfile, Team } from "@/types/auth";
import type { AgeGroup } from "@/types/tournament";
import type { ApplicationWithRelations, ClubRow, TeamRow } from "@/lib/supabase/database";

function asAgeGroup(value: string | null | undefined, fallback: AgeGroup = "U10"): AgeGroup {
  if (value && AGE_GROUPS.includes(value as AgeGroup)) {
    return value as AgeGroup;
  }

  return fallback;
}

function asStrength(value: number | null | undefined): TeamStrength {
  if (value && TEAM_STRENGTHS.includes(value as TeamStrength)) {
    return value as TeamStrength;
  }

  return 3;
}

function asStatus(value: string | null | undefined): ApplicationStatus {
  if (value && APPLICATION_STATUSES.includes(value as ApplicationStatus)) {
    return value as ApplicationStatus;
  }

  return "new";
}

function asInternalCategory(value: string | null | undefined): InternalCategory | null {
  if (value && INTERNAL_CATEGORIES.includes(value as InternalCategory)) {
    return value as InternalCategory;
  }

  return null;
}

function firstReview(row: ApplicationWithRelations) {
  const review = row.application_reviews;
  if (Array.isArray(review)) {
    return review[0] ?? null;
  }

  return review;
}

export function toClubProfile(row: ClubRow): ClubProfile {
  return {
    id: row.id,
    name: row.name,
    city: row.city ?? "",
    website: row.website,
    logo: row.logo_url,
    contactPhone: row.contact_phone,
    createdAt: row.created_at,
  };
}

export function toClubTeam(row: TeamRow): Team {
  return {
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    ageGroup: asAgeGroup(row.age_group),
    birthYear: row.birth_year ?? new Date().getFullYear() - 10,
    league: row.league ?? "",
    division: row.division,
    strength: asStrength(row.self_rated_strength),
    coach: row.trainer_name ?? "",
  };
}

function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return "";
}

function asClubType(value: string | null | undefined): ClubType | null {
  if (value && CLUB_TYPES.includes(value as ClubType)) {
    return value as ClubType;
  }

  return null;
}

function applicationBase(row: ApplicationWithRelations) {
  const club = row.clubs;
  const team = row.teams;
  const tournament = row.tournaments;

  return {
    id: row.id,
    clubId: row.club_id,
    tournamentId: tournament?.slug ?? row.tournament_id,
    tournamentName: tournament?.name ?? "Turnier",
    tournamentSlug: tournament?.slug ?? "",
    tournamentDate: tournament?.date ?? row.created_at.slice(0, 10),
    tournamentLocation: tournament?.location ?? "",
    clubName: firstText(row.club_name, club?.name) || "Verein",
    clubCity: firstText(row.club_city, club?.city),
    website: row.website ?? club?.website ?? null,
    teamName: firstText(row.team_name, team?.name) || "Mannschaft",
    ageGroup: asAgeGroup(
      firstText(row.age_group, team?.age_group, tournament?.age_group) || undefined,
    ),
    birthYear: row.birth_year ?? team?.birth_year ?? new Date().getFullYear() - 10,
    league: firstText(row.league, team?.league),
    division: firstText(row.division, team?.division) || null,
    selfRatedStrength: asStrength(row.self_rated_strength ?? team?.self_rated_strength),
    teamDescription: row.team_description,
    clubType: asClubType(row.club_type),
    contactFirstName: row.contact_first_name ?? "",
    contactLastName: row.contact_last_name ?? "",
    contactRole: row.contact_role ?? "",
    contactEmail: row.contact_email ?? "",
    contactPhone: row.contact_phone ?? "",
    alternativePhone: row.alternative_phone ?? null,
    staffCount: row.staff_count,
    notes: row.notes,
    applicationStatus: asStatus(row.status),
    createdAt: row.created_at,
  };
}

export function toClubApplicationView(row: ApplicationWithRelations): ClubApplicationView {
  const base = applicationBase(row);
  return {
    ...base,
    clubId: base.clubId ?? "",
  };
}

export function toAdminApplication(row: ApplicationWithRelations): AdminApplication {
  const review = firstReview(row);
  const base = applicationBase(row);

  return {
    ...base,
    internalCategory: asInternalCategory(review?.internal_category),
    internalStrength: review?.internal_strength
      ? asStrength(review.internal_strength)
      : null,
    internalNotes: review?.internal_note ?? null,
  };
}

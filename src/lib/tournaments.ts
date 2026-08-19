import { tournaments } from "@/data/tournaments";
import { tournamentStatusOrder } from "@/lib/tournament-status";
import type {
  PublicTournament,
  Tournament,
  TournamentStatus,
} from "@/types/tournament";

export { ageGroupImageSrc, tournaments } from "@/data/tournaments";

export const FEATURED_TOURNAMENT_LIMIT = 4;

const featuredStatuses: TournamentStatus[] = ["active", "coming-soon", "full"];

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
  };
}

export function getTournaments(): Tournament[] {
  return tournaments;
}

export function getPublicTournaments(): PublicTournament[] {
  return tournaments.map(toPublicTournament);
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

export function getFeaturedTournaments(
  limit = FEATURED_TOURNAMENT_LIMIT,
): PublicTournament[] {
  return sortTournaments(
    getPublicTournaments().filter((tournament) =>
      featuredStatuses.includes(tournament.status),
    ),
  ).slice(0, limit);
}

export function getTournamentById(id: string): Tournament | undefined {
  return tournaments.find((tournament) => tournament.id === id);
}

export function getTournamentBySlug(slug: string): Tournament | undefined {
  return tournaments.find((tournament) => tournament.slug === slug);
}

export function getPublicTournamentBySlug(
  slug: string,
): PublicTournament | undefined {
  const tournament = getTournamentBySlug(slug);
  return tournament ? toPublicTournament(tournament) : undefined;
}

import { wallTimeOnDate, TOURNAMENT_TIME_ZONE } from "@/lib/schedule/datetime";
import { localDateString } from "@/lib/mein-turnierplan";
import type { PublicTournament } from "@/types/tournament";

export type LiveTournamentCandidate = Pick<
  PublicTournament,
  "id" | "slug" | "name" | "date" | "status" | "startTime" | "endTime" | "archivedAt"
>;

export type LiveTournamentSelection = {
  todayBerlin: string;
  primary: LiveTournamentCandidate | null;
  todayAlso: LiveTournamentCandidate[];
  upcoming: LiveTournamentCandidate[];
  past: LiveTournamentCandidate[];
  hasLiveToday: boolean;
};

function compareByStartThenName(a: LiveTournamentCandidate, b: LiveTournamentCandidate) {
  const startA = a.startTime?.trim() || "99:99";
  const startB = b.startTime?.trim() || "99:99";
  if (startA !== startB) {
    return startA.localeCompare(startB);
  }

  const nameCmp = a.name.localeCompare(b.name, "de");
  if (nameCmp !== 0) {
    return nameCmp;
  }

  return a.id.localeCompare(b.id);
}

function startMs(tournament: LiveTournamentCandidate) {
  if (!tournament.startTime) {
    return null;
  }

  return wallTimeOnDate(tournament.date, tournament.startTime)?.getTime() ?? null;
}

function endMs(tournament: LiveTournamentCandidate) {
  if (!tournament.endTime) {
    return null;
  }

  return wallTimeOnDate(tournament.date, tournament.endTime)?.getTime() ?? null;
}

/**
 * Pick the primary live tournament among today's active tournaments.
 * Prefer current time window, then next starting, then most recently started.
 */
export function pickPrimaryLiveTournament(
  todayActive: LiveTournamentCandidate[],
  now: Date,
): LiveTournamentCandidate | null {
  if (todayActive.length === 0) {
    return null;
  }

  if (todayActive.length === 1) {
    return todayActive[0] ?? null;
  }

  const nowMs = now.getTime();

  const inWindow = todayActive
    .filter((tournament) => {
      const start = startMs(tournament);
      const end = endMs(tournament);
      if (start == null || end == null) {
        return false;
      }
      return start <= nowMs && nowMs <= end;
    })
    .sort(compareByStartThenName);

  if (inWindow[0]) {
    return inWindow[0];
  }

  const upcomingToday = todayActive
    .filter((tournament) => {
      const start = startMs(tournament);
      return start != null && start > nowMs;
    })
    .sort(compareByStartThenName);

  if (upcomingToday[0]) {
    return upcomingToday[0];
  }

  const alreadyStarted = todayActive
    .filter((tournament) => {
      const start = startMs(tournament);
      return start != null && start <= nowMs;
    })
    .sort((a, b) => {
      const startA = startMs(a) ?? 0;
      const startB = startMs(b) ?? 0;
      if (startA !== startB) {
        return startB - startA;
      }
      return compareByStartThenName(a, b);
    });

  if (alreadyStarted[0]) {
    return alreadyStarted[0];
  }

  return [...todayActive].sort(compareByStartThenName)[0] ?? null;
}

export function selectLivePageTournaments(
  tournaments: LiveTournamentCandidate[],
  options?: { now?: Date; upcomingLimit?: number; pastLimit?: number },
): LiveTournamentSelection {
  const now = options?.now ?? new Date();
  const upcomingLimit = options?.upcomingLimit ?? 5;
  const pastLimit = options?.pastLimit ?? 5;
  const todayBerlin = localDateString(now, TOURNAMENT_TIME_ZONE);

  const visible = tournaments.filter((tournament) => !tournament.archivedAt);

  const todayActive = visible
    .filter(
      (tournament) =>
        tournament.status === "active" && tournament.date.slice(0, 10) === todayBerlin,
    )
    .sort(compareByStartThenName);

  const primary = pickPrimaryLiveTournament(todayActive, now);
  const todayAlso = todayActive.filter((tournament) => tournament.id !== primary?.id);

  const upcoming = visible
    .filter((tournament) => {
      const date = tournament.date.slice(0, 10);
      if (primary && tournament.id === primary.id) {
        return false;
      }
      if (todayAlso.some((entry) => entry.id === tournament.id)) {
        return false;
      }
      return date > todayBerlin || tournament.status === "coming-soon";
    })
    .sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) {
        return dateCmp;
      }
      return compareByStartThenName(a, b);
    })
    .slice(0, upcomingLimit);

  const past = visible
    .filter((tournament) => {
      const date = tournament.date.slice(0, 10);
      if (primary && tournament.id === primary.id) {
        return false;
      }
      return tournament.status === "completed" || date < todayBerlin;
    })
    .sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) {
        return dateCmp;
      }
      return compareByStartThenName(a, b);
    })
    .slice(0, pastLimit);

  return {
    todayBerlin,
    primary,
    todayAlso,
    upcoming,
    past,
    hasLiveToday: Boolean(primary),
  };
}

export function hasActiveLiveTournamentToday(
  tournaments: LiveTournamentCandidate[],
  now = new Date(),
) {
  return selectLivePageTournaments(tournaments, { now }).hasLiveToday;
}

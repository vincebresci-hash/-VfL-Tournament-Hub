import {
  isHybridLiveDataSource,
  localDateString,
  showsMeinTurnierplanLiveTab,
  usesMeinTurnierplanAsPrimaryLive,
} from "@/lib/mein-turnierplan";
import {
  selectPrimaryMatchMoment,
  type PrimaryMatchMoment,
} from "@/lib/live/match-center";
import type { LiveTournamentSelection } from "@/lib/live/select-live-tournament";
import { getDisplayCapacity } from "@/lib/public-tournament";
import { TOURNAMENT_TIME_ZONE } from "@/lib/schedule/datetime";
import type { PublicTournament } from "@/types/tournament";
import type { TournamentMatchRecord } from "@/types/schedule";

export type HomepageHeroKind = "live" | "next" | "hub";

/** Titles at/above this length get a smaller mobile display size. */
export const HOMEPAGE_LONG_TITLE_CHARS = 26;

export type HomepageHeroMoment = {
  kind: HomepageHeroKind;
  tournament: PublicTournament | null;
  /** Only set for live hero when a live/next match is reliably available. */
  matchMoment: PrimaryMatchMoment | null;
  recentTournament: PublicTournament | null;
  upcoming: PublicTournament[];
};

/** Match-day finished: no live/scheduled matches left, but completed results exist. */
export function isTournamentDayFinished(matches: TournamentMatchRecord[]) {
  const eligible = matches.filter((match) => match.status !== "cancelled");
  if (eligible.length === 0) {
    return false;
  }
  const hasLive = eligible.some((match) => match.status === "live");
  const hasScheduled = eligible.some((match) => match.status === "scheduled");
  const hasCompleted = eligible.some((match) => match.status === "completed");
  return !hasLive && !hasScheduled && hasCompleted;
}

/**
 * Responsive hero title classes: short names stay large, long names shrink on mobile.
 * Desktop (lg+) stays bold/large either way.
 */
export function homepageHeroTitleClassName(
  name: string,
  kind: Exclude<HomepageHeroKind, "hub">,
): string {
  const long = name.trim().length >= HOMEPAGE_LONG_TITLE_CHARS;
  if (kind === "live") {
    return long
      ? "text-[1.7rem] leading-[1.12] sm:text-3xl lg:text-5xl xl:text-6xl break-words"
      : "text-3xl leading-[1.1] sm:text-5xl lg:text-6xl break-words";
  }
  return long
    ? "text-2xl leading-[1.12] sm:text-3xl lg:text-4xl xl:text-5xl break-words"
    : "text-3xl leading-[1.1] sm:text-4xl lg:text-5xl break-words";
}

/**
 * Capacity line for homepage surfaces using existing getDisplayCapacity occupancy.
 * Hides misleading `0 / X` when MTP/hybrid may hold external participants that are
 * not yet reflected in application occupancy — without inventing a second counter.
 */
export function formatHomepageCapacityLabel(
  tournament: Pick<
    PublicTournament,
    | "confirmedTeams"
    | "maxTeams"
    | "liveDataSource"
    | "meinTurnierplanEnabled"
    | "meinTurnierplanUrl"
  >,
): string | null {
  const capacity = getDisplayCapacity(tournament);

  if (capacity) {
    if (capacity.confirmedTeams > 0) {
      return `${capacity.confirmedTeams} / ${capacity.maxTeams} Teams`;
    }

    const externalLiveLikely =
      showsMeinTurnierplanLiveTab(tournament) ||
      usesMeinTurnierplanAsPrimaryLive(tournament) ||
      isHybridLiveDataSource(tournament);

    if (externalLiveLikely) {
      return null;
    }

    return `${capacity.confirmedTeams} / ${capacity.maxTeams} Teams`;
  }

  if (tournament.confirmedTeams > 0) {
    return `${tournament.confirmedTeams} Teams`;
  }

  return null;
}

/**
 * Calendar days from Berlin "today" until tournament date.
 * Returns null when date is today/past or inputs are invalid — no fake countdown.
 */
export function daysUntilTournamentDate(
  tournamentDate: string | null | undefined,
  now = new Date(),
): number | null {
  const date = tournamentDate?.slice(0, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  const today = localDateString(now, TOURNAMENT_TIME_ZONE);
  if (date <= today) {
    return null;
  }

  const [y1, m1, d1] = today.split("-").map(Number);
  const [y2, m2, d2] = date.split("-").map(Number);
  const start = Date.UTC(y1, m1 - 1, d1);
  const end = Date.UTC(y2, m2 - 1, d2);
  const days = Math.round((end - start) / 86_400_000);
  return days > 0 ? days : null;
}

export function resolveHomepageHeroMoment(input: {
  selection: LiveTournamentSelection;
  primary: PublicTournament | null;
  upcoming: PublicTournament[];
  past: PublicTournament[];
  matches: TournamentMatchRecord[];
  upcomingLimit?: number;
}): HomepageHeroMoment {
  const upcomingLimit = input.upcomingLimit ?? 3;
  const upcoming = input.upcoming.slice(0, upcomingLimit);
  const dayFinished = isTournamentDayFinished(input.matches);
  const primaryEligible =
    Boolean(input.primary) &&
    input.primary!.status === "active" &&
    input.selection.hasLiveToday &&
    !dayFinished;

  if (primaryEligible && input.primary) {
    const matchMoment = selectPrimaryMatchMoment(input.matches);
    return {
      kind: "live",
      tournament: input.primary,
      matchMoment:
        matchMoment.kind === "live" || matchMoment.kind === "next" ? matchMoment : null,
      recentTournament: input.past[0] ?? null,
      upcoming,
    };
  }

  if (upcoming[0]) {
    return {
      kind: "next",
      tournament: upcoming[0],
      matchMoment: null,
      recentTournament:
        dayFinished && input.primary ? input.primary : (input.past[0] ?? null),
      upcoming,
    };
  }

  return {
    kind: "hub",
    tournament: null,
    matchMoment: null,
    recentTournament:
      dayFinished && input.primary ? input.primary : (input.past[0] ?? null),
    upcoming: [],
  };
}

import type { MatchStatus, StandingRow, TournamentMatchRecord } from "@/types/schedule";

export type StandingsMatch = Pick<
  TournamentMatchRecord,
  "homeApplicationId" | "awayApplicationId" | "homeScore" | "awayScore" | "status"
>;

export type TieBreakerContext = {
  matches: StandingsMatch[];
};

export type TieBreaker = (
  a: StandingRow,
  b: StandingRow,
  context: TieBreakerContext,
) => number;

function emptyStanding(applicationId: string): StandingRow {
  return {
    applicationId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0,
    rank: 0,
  };
}

function isCompleted(status: MatchStatus, homeScore: number | null, awayScore: number | null) {
  return status === "completed" && homeScore != null && awayScore != null;
}

export const defaultTieBreakers: TieBreaker[] = [
  (a, b) => b.points - a.points,
  (a, b) => b.goalDiff - a.goalDiff,
  (a, b) => b.goalsFor - a.goalsFor,
  (a, b) => a.applicationId.localeCompare(b.applicationId),
];

export function compareStandings(
  a: StandingRow,
  b: StandingRow,
  context: TieBreakerContext,
  breakers: TieBreaker[] = defaultTieBreakers,
) {
  for (const breaker of breakers) {
    const diff = breaker(a, b, context);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

export function computeGroupStandings(
  memberIds: string[],
  matches: StandingsMatch[],
  breakers: TieBreaker[] = defaultTieBreakers,
): StandingRow[] {
  const table = new Map(memberIds.map((id) => [id, emptyStanding(id)]));

  for (const match of matches) {
    if (!isCompleted(match.status, match.homeScore, match.awayScore)) {
      continue;
    }

    const home = table.get(match.homeApplicationId);
    const away = table.get(match.awayApplicationId);
    if (!home || !away || match.homeScore == null || match.awayScore == null) {
      continue;
    }

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;

    if (match.homeScore > match.awayScore) {
      home.won += 1;
      away.lost += 1;
      home.points += 3;
    } else if (match.homeScore < match.awayScore) {
      away.won += 1;
      home.lost += 1;
      away.points += 3;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  for (const row of table.values()) {
    row.goalDiff = row.goalsFor - row.goalsAgainst;
  }

  const context: TieBreakerContext = { matches };
  const sorted = [...table.values()].sort((a, b) => compareStandings(a, b, context, breakers));

  return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function formatGoals(goalsFor: number, goalsAgainst: number) {
  return `${goalsFor}:${goalsAgainst}`;
}

export type ChampionsLeagueQualificationBand = "knockout" | "outside";

export type LeagueProgressRow = {
  played: number;
};

export type LeagueProgressMatch = {
  status: string;
  homeScore: number | null;
  awayScore: number | null;
};

export type ChampionsLeagueStanding = LeagueProgressRow & {
  applicationId: string;
  rank: number;
};

export type ChampionsLeagueKnockoutMatch = {
  phase: string;
  round: string | null;
  homeApplicationId: string | null;
  awayApplicationId: string | null;
  homeExternalTeamId?: string | null;
  awayExternalTeamId?: string | null;
};

export function championsLeagueQualificationBand(
  rank: number,
  knockoutCutoff: 4 | 8 | 16,
): ChampionsLeagueQualificationBand {
  return rank <= knockoutCutoff ? "knockout" : "outside";
}

export function isChampionsLeaguePhaseComplete(input: {
  standings: readonly LeagueProgressRow[];
  matches: readonly LeagueProgressMatch[];
  matchesPerTeam: number | null;
}) {
  if (
    input.matchesPerTeam == null ||
    input.matchesPerTeam < 1 ||
    input.standings.length === 0 ||
    input.matches.length === 0
  ) {
    return false;
  }

  const expectedMatchCount = (input.standings.length * input.matchesPerTeam) / 2;
  if (!Number.isInteger(expectedMatchCount) || input.matches.length !== expectedMatchCount) {
    return false;
  }

  return (
    input.standings.every((row) => row.played === input.matchesPerTeam) &&
    input.matches.every(
      (match) =>
        match.status === "completed" &&
        match.homeScore != null &&
        match.awayScore != null,
    )
  );
}

export function championsLeagueFinalQualifierIds(input: {
  complete: boolean;
  standings: readonly ChampionsLeagueStanding[];
  knockoutCutoff: 4 | 8 | 16;
}) {
  if (!input.complete || input.standings.length < input.knockoutCutoff) {
    return [];
  }

  const qualifiers = input.standings
    .filter((row) => row.rank >= 1 && row.rank <= input.knockoutCutoff)
    .sort((left, right) => left.rank - right.rank);
  const uniqueIds = new Set(qualifiers.map((row) => row.applicationId));
  if (qualifiers.length !== input.knockoutCutoff || uniqueIds.size !== input.knockoutCutoff) {
    return [];
  }

  return qualifiers.map((row) => row.applicationId);
}

function knockoutParticipantId(
  applicationId: string | null,
  externalTeamId?: string | null,
) {
  return applicationId ?? externalTeamId ?? null;
}

/**
 * Public fail-closed guard: stored first-round teams are only revealed when
 * they are exactly the qualifiers from the final league table.
 */
export function isChampionsLeagueKnockoutQualificationConsistent(input: {
  complete: boolean;
  standings: readonly ChampionsLeagueStanding[];
  knockoutCutoff: 4 | 8 | 16;
  matches: readonly ChampionsLeagueKnockoutMatch[];
}) {
  const qualifiers = championsLeagueFinalQualifierIds(input);
  if (qualifiers.length !== input.knockoutCutoff) {
    return false;
  }

  const firstRound =
    input.knockoutCutoff === 4
      ? "semifinal"
      : input.knockoutCutoff === 8
        ? "quarterfinal"
        : "round-of-16";
  const firstRoundMatches = input.matches.filter(
    (match) => match.phase === "knockout" && match.round === firstRound,
  );
  if (firstRoundMatches.length !== input.knockoutCutoff / 2) {
    return false;
  }

  const storedParticipants = firstRoundMatches.flatMap((match) => [
    knockoutParticipantId(match.homeApplicationId, match.homeExternalTeamId),
    knockoutParticipantId(match.awayApplicationId, match.awayExternalTeamId),
  ]);
  if (storedParticipants.some((participantId) => participantId == null)) {
    return false;
  }

  const stored = new Set(storedParticipants as string[]);
  return (
    stored.size === input.knockoutCutoff &&
    qualifiers.every((participantId) => stored.has(participantId))
  );
}

export function standingRowIsConsistent(row: {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}) {
  return (
    row.played === row.won + row.drawn + row.lost &&
    row.goalDiff === row.goalsFor - row.goalsAgainst &&
    row.points === 3 * row.won + row.drawn
  );
}

export function championsLeagueQualificationLabel(input: {
  complete: boolean;
  knockoutCutoff: 4 | 8 | 16;
}) {
  return input.complete
    ? `Platz 1–${input.knockoutCutoff}: für die K.-o.-Runde qualifiziert`
    : `Platz 1–${input.knockoutCutoff}: aktueller K.-o.-Qualifikationsplatz`;
}

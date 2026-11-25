export type ChampionsLeagueQualificationBand = "knockout" | "outside";

export type LeagueProgressRow = {
  played: number;
};

export type LeagueProgressMatch = {
  status: string;
  homeScore: number | null;
  awayScore: number | null;
};

export function championsLeagueQualificationBand(
  rank: number,
  knockoutCutoff: 4 | 8,
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

export function championsLeagueQualificationLabel(input: {
  complete: boolean;
  knockoutCutoff: 4 | 8;
}) {
  return input.complete
    ? `Platz 1–${input.knockoutCutoff}: für die K.-o.-Runde qualifiziert`
    : `Platz 1–${input.knockoutCutoff}: aktueller K.-o.-Qualifikationsplatz`;
}

import {
  computeKnockoutPlacements,
  knockoutRoundLabel,
  resolveKnockoutOutcome,
} from "@/lib/schedule/knockout";
import { formatBerlinClock } from "@/lib/schedule/datetime";
import type {
  KnockoutMatchView,
  KnockoutPlacementView,
  KnockoutRoundView,
} from "@/components/tournaments/TournamentKnockoutRounds";
import type { LiveTeamRef } from "@/lib/db/live-queries";
import type { KnockoutRound, TournamentMatchRecord } from "@/types/schedule";

function matchTeamId(
  applicationId: string | null | undefined,
  externalTeamId?: string | null,
) {
  return applicationId ?? externalTeamId ?? null;
}

function knockoutResultText(match: TournamentMatchRecord) {
  if (
    match.status === "completed" &&
    match.homeScore != null &&
    match.awayScore != null
  ) {
    return `${match.homeScore}:${match.awayScore}${
      match.decidedBy === "penalties"
        ? ` n.E. ${match.homePenalties ?? 0}:${match.awayPenalties ?? 0}`
        : ""
    }`;
  }

  return "Ergebnis folgt";
}

function teamSide(
  teamMap: Map<string, LiveTeamRef>,
  applicationId: string | null | undefined,
  externalTeamId: string | null | undefined,
) {
  const id = matchTeamId(applicationId, externalTeamId);
  const team = id ? teamMap.get(id) : undefined;
  return {
    label: team?.label ?? "steht noch nicht fest",
    logoUrl: team?.logoUrl ?? null,
    clubName: team?.clubName ?? null,
  };
}

/**
 * Build presentational KO views from Hub matches for /live.
 * Mirrors TournamentPublicStage public round order; no new data model.
 */
export function buildLiveKnockoutViews(input: {
  matches: TournamentMatchRecord[];
  teamMap: Map<string, LiveTeamRef>;
  fieldNameById: Map<string, string>;
}): {
  rounds: KnockoutRoundView[];
  placements: KnockoutPlacementView[];
} {
  const knockoutMatches = input.matches.filter((match) => match.phase === "knockout");
  if (knockoutMatches.length === 0) {
    return { rounds: [], placements: [] };
  }

  const publicRounds: KnockoutRound[][] = [
    ["quarterfinal"],
    ["semifinal"],
    ["final", "third-place"],
  ];
  const publicPlacementRounds: KnockoutRound[] = ["placement-5", "placement-7"];
  const placements = computeKnockoutPlacements(knockoutMatches);

  const rounds: KnockoutRoundView[] = [...publicRounds.flat(), ...publicPlacementRounds].flatMap(
    (round) => {
      const roundMatches = knockoutMatches.filter((match) => match.round === round);
      if (roundMatches.length === 0) {
        return [];
      }

      return [
        {
          id: round,
          title: knockoutRoundLabel[round],
          matches: roundMatches.map((match): KnockoutMatchView => {
            const outcome = resolveKnockoutOutcome(match);
            const field =
              match.fieldId != null
                ? (input.fieldNameById.get(match.fieldId) ?? "Feld")
                : "Feld";
            const winnerId = outcome.winnerId;
            const winnerTeam = winnerId ? input.teamMap.get(winnerId) : undefined;
            return {
              id: match.id,
              meta: `${field} · ${formatBerlinClock(match.scheduledAt)}`,
              home: teamSide(
                input.teamMap,
                match.homeApplicationId,
                match.homeExternalTeamId,
              ),
              away: teamSide(
                input.teamMap,
                match.awayApplicationId,
                match.awayExternalTeamId,
              ),
              resultText: knockoutResultText(match),
              winnerLabel: winnerId
                ? `Gewinner ${winnerTeam?.label ?? "steht noch nicht fest"}`
                : null,
            };
          }),
        },
      ];
    },
  );

  const placementViews: KnockoutPlacementView[] = placements.map((row) => ({
    id: `${row.place}-${row.applicationId}`,
    place: row.place,
    label: input.teamMap.get(row.applicationId)?.label ?? "steht noch nicht fest",
  }));

  return { rounds, placements: placementViews };
}

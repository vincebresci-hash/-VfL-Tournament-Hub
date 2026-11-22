/**
 * Champions League qualification preview.
 * One league table, existing standings sort, existing knockout skeleton.
 * Incomplete tables stay provisional and are not a final qualification.
 */

import {
  buildLeagueKnockoutPlan,
  expectedLeagueMatchCount,
  type LeagueKnockoutCutoff,
} from "@/lib/schedule/league-phase";
import type { KnockoutOptions, KnockoutPlanMatch } from "@/lib/schedule/knockout";
import type { KnockoutQualificationPreview } from "@/lib/schedule/knockout-preview";
import {
  computeGroupStandings,
  type StandingsMatch,
} from "@/lib/schedule/standings";
import type { MatchStatus } from "@/types/schedule";

export type LeagueQualificationMatch = StandingsMatch & {
  groupId: string | null;
  phase?: string;
  status: MatchStatus;
};

export type LeagueQualificationPreview = KnockoutQualificationPreview & {
  provisional: boolean;
};

function completedLeagueMatch(match: LeagueQualificationMatch) {
  return (
    match.phase !== "knockout" &&
    match.status === "completed" &&
    match.homeScore != null &&
    match.awayScore != null
  );
}

export function buildLeagueQualificationPreview(input: {
  groupId: string | null;
  memberIds: readonly string[];
  matches: readonly LeagueQualificationMatch[];
  matchesPerTeam: number;
  knockoutCutoff: LeagueKnockoutCutoff;
  options: KnockoutOptions;
}): LeagueQualificationPreview {
  const groupId = input.groupId;
  const memberIds = [...input.memberIds];
  const leagueMatches = groupId
    ? input.matches.filter((match) => match.groupId === groupId && match.phase !== "knockout")
    : [];
  const expected = expectedLeagueMatchCount(memberIds.length, input.matchesPerTeam);
  const completed = leagueMatches.filter((match) => completedLeagueMatch(match)).length;
  const complete =
    groupId != null &&
    expected != null &&
    leagueMatches.length === expected &&
    completed === expected;

  const standings = computeGroupStandings(memberIds, leagueMatches);
  const progress = {
    complete,
    expected: expected ?? 0,
    completed,
  };
  const standingsByGroupId = groupId ? { [groupId]: standings } : {};

  if (!complete || input.options.format !== input.knockoutCutoff) {
    const ranked = standings.map((row) => ({
      participantId: row.applicationId,
      rank: row.rank,
    }));
    const provisionalPlan =
      input.options.format === input.knockoutCutoff
        ? buildLeagueKnockoutPlan(input.options, ranked)
        : {
            matches: [] as KnockoutPlanMatch[],
            error: "Das K.-o.-Format muss der gespeicherten Ligaqualifikation entsprechen.",
          };
    return {
      progress,
      standingsByGroupId,
      qualifiers: standings.slice(0, input.knockoutCutoff).map((row) => ({
        applicationId: row.applicationId,
        groupIndex: 0,
        rank: row.rank,
        seedLabel: `Platz ${row.rank}`,
      })),
      plan: provisionalPlan,
      firstRoundMatches: provisionalPlan.matches.filter(
        (match) => match.homeId != null && match.awayId != null,
      ),
      provisional: true,
    };
  }

  const ranked = standings.map((row) => ({
    participantId: row.applicationId,
    rank: row.rank,
  }));
  const plan = buildLeagueKnockoutPlan(input.options, ranked);
  return {
    progress,
    standingsByGroupId,
    qualifiers: standings.slice(0, input.knockoutCutoff).map((row) => ({
      applicationId: row.applicationId,
      groupIndex: 0,
      rank: row.rank,
      seedLabel: `Platz ${row.rank}`,
    })),
    plan,
    firstRoundMatches: plan.matches.filter(
      (match) => match.homeId != null && match.awayId != null,
    ),
    provisional: false,
  };
}

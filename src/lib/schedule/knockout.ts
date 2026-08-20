import { expectedGroupMatchCount } from "@/lib/schedule/round-robin";
import type {
  DecidedBy,
  KnockoutRound,
  KnockoutSlot,
  MatchStatus,
  StandingRow,
} from "@/types/schedule";

export type { DecidedBy, KnockoutRound, KnockoutSlot } from "@/types/schedule";
export { KNOCKOUT_ROUNDS, KNOCKOUT_SLOTS, DECIDED_BY } from "@/types/schedule";

export const knockoutRoundLabel: Record<KnockoutRound, string> = {
  quarterfinal: "Viertelfinale",
  semifinal: "Halbfinale",
  "third-place": "Spiel um Platz 3",
  final: "Finale",
  "placement-5": "Spiel um Platz 5/6",
  "placement-7": "Spiel um Platz 7/8",
};

export type KnockoutFormat = 4 | 8;

export type KnockoutOptions = {
  format: KnockoutFormat;
  includeThirdPlace: boolean;
  includePlacement5: boolean;
  includePlacement7: boolean;
};

export type QualifiedTeam = {
  applicationId: string;
  groupIndex: number;
  rank: number;
  seedLabel: string;
};

export type KnockoutMatchLike = {
  id?: string;
  homeApplicationId: string | null;
  awayApplicationId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  decidedBy?: DecidedBy | null;
  homePenalties?: number | null;
  awayPenalties?: number | null;
  round?: KnockoutRound | null;
  nextMatchId?: string | null;
  nextMatchSlot?: KnockoutSlot | null;
  loserNextMatchId?: string | null;
  loserNextMatchSlot?: KnockoutSlot | null;
};

export type KnockoutPlanMatch = {
  key: string;
  round: KnockoutRound;
  homeId: string | null;
  awayId: string | null;
  nextKey: string | null;
  nextSlot: KnockoutSlot | null;
  loserNextKey: string | null;
  loserNextSlot: KnockoutSlot | null;
  sortOrder: number;
};

const GROUP_LETTERS = "ABCDEFGH";

export function seedLabel(groupIndex: number, rank: number) {
  return `${GROUP_LETTERS[groupIndex] ?? groupIndex + 1}${rank}`;
}

export function isGroupStageComplete(
  groups: Array<{ id: string }>,
  memberIdsByGroupId: Record<string, string[]>,
  matches: Array<{ groupId: string | null; status: MatchStatus; phase?: string }>,
) {
  if (groups.length === 0) {
    return { complete: false, expected: 0, completed: 0 };
  }

  let expected = 0;
  let completed = 0;

  for (const group of groups) {
    const teamCount = (memberIdsByGroupId[group.id] ?? []).length;
    const groupExpected = expectedGroupMatchCount(teamCount);
    expected += groupExpected;
    completed += matches.filter(
      (match) =>
        match.groupId === group.id &&
        match.phase !== "knockout" &&
        match.status === "completed",
    ).length;
  }

  return {
    complete: expected > 0 && completed >= expected,
    expected,
    completed,
  };
}

export function qualifyTopTwo(
  groups: Array<{ id: string }>,
  standingsByGroupId: Record<string, StandingRow[]>,
): QualifiedTeam[] {
  return groups.flatMap((group, groupIndex) => {
    const standings = standingsByGroupId[group.id] ?? [];
    return standings.slice(0, 2).map((row) => ({
      applicationId: row.applicationId,
      groupIndex,
      rank: row.rank,
      seedLabel: seedLabel(groupIndex, row.rank),
    }));
  });
}

function teamBySeed(qualified: QualifiedTeam[], label: string) {
  return qualified.find((team) => team.seedLabel === label) ?? null;
}

export function defaultFirstRoundSeeds(format: KnockoutFormat): Array<[string, string]> {
  if (format === 4) {
    return [
      ["A1", "B2"],
      ["B1", "A2"],
    ];
  }

  return [
    ["A1", "B2"],
    ["B1", "A2"],
    ["C1", "D2"],
    ["D1", "C2"],
  ];
}

export function buildKnockoutPlan(
  options: KnockoutOptions,
  qualified: QualifiedTeam[],
): { matches: KnockoutPlanMatch[]; error: string | null } {
  const neededGroups = options.format === 4 ? 2 : 4;
  const neededTeams = options.format;
  if (qualified.length < neededTeams) {
    return {
      matches: [],
      error: `Für dieses Format werden ${neededTeams} qualifizierte Teams aus ${neededGroups} Gruppen benötigt.`,
    };
  }

  const seeds = defaultFirstRoundSeeds(options.format);
  const firstRound = seeds.map(([homeSeed, awaySeed]) => {
    const home = teamBySeed(qualified, homeSeed);
    const away = teamBySeed(qualified, awaySeed);
    return {
      homeId: home?.applicationId ?? null,
      awayId: away?.applicationId ?? null,
    };
  });

  if (firstRound.some((match) => !match.homeId || !match.awayId)) {
    return { matches: [], error: "Die Standard-Qualifikation konnte nicht vollständig ermittelt werden." };
  }

  if (firstRound.some((match) => match.homeId === match.awayId)) {
    return { matches: [], error: "Ein Team kann nicht gegen sich selbst spielen." };
  }

  const matches: KnockoutPlanMatch[] = [];

  if (options.format === 4) {
    matches.push(
      {
        key: "sf1",
        round: "semifinal",
        homeId: firstRound[0]?.homeId ?? null,
        awayId: firstRound[0]?.awayId ?? null,
        nextKey: "final",
        nextSlot: "home",
        loserNextKey: options.includeThirdPlace ? "third" : null,
        loserNextSlot: options.includeThirdPlace ? "home" : null,
        sortOrder: 200,
      },
      {
        key: "sf2",
        round: "semifinal",
        homeId: firstRound[1]?.homeId ?? null,
        awayId: firstRound[1]?.awayId ?? null,
        nextKey: "final",
        nextSlot: "away",
        loserNextKey: options.includeThirdPlace ? "third" : null,
        loserNextSlot: options.includeThirdPlace ? "away" : null,
        sortOrder: 201,
      },
      {
        key: "final",
        round: "final",
        homeId: null,
        awayId: null,
        nextKey: null,
        nextSlot: null,
        loserNextKey: null,
        loserNextSlot: null,
        sortOrder: 400,
      },
    );

    if (options.includeThirdPlace) {
      matches.push({
        key: "third",
        round: "third-place",
        homeId: null,
        awayId: null,
        nextKey: null,
        nextSlot: null,
        loserNextKey: null,
        loserNextSlot: null,
        sortOrder: 390,
      });
    }
  } else {
    matches.push(
      {
        key: "qf1",
        round: "quarterfinal",
        homeId: firstRound[0]?.homeId ?? null,
        awayId: firstRound[0]?.awayId ?? null,
        nextKey: "sf1",
        nextSlot: "home",
        loserNextKey: options.includePlacement5 ? "p5" : null,
        loserNextSlot: options.includePlacement5 ? "home" : null,
        sortOrder: 100,
      },
      {
        key: "qf2",
        round: "quarterfinal",
        homeId: firstRound[1]?.homeId ?? null,
        awayId: firstRound[1]?.awayId ?? null,
        nextKey: "sf1",
        nextSlot: "away",
        loserNextKey: options.includePlacement5 ? "p5" : null,
        loserNextSlot: options.includePlacement5 ? "away" : null,
        sortOrder: 101,
      },
      {
        key: "qf3",
        round: "quarterfinal",
        homeId: firstRound[2]?.homeId ?? null,
        awayId: firstRound[2]?.awayId ?? null,
        nextKey: "sf2",
        nextSlot: "home",
        loserNextKey: options.includePlacement7 ? "p7" : null,
        loserNextSlot: options.includePlacement7 ? "home" : null,
        sortOrder: 102,
      },
      {
        key: "qf4",
        round: "quarterfinal",
        homeId: firstRound[3]?.homeId ?? null,
        awayId: firstRound[3]?.awayId ?? null,
        nextKey: "sf2",
        nextSlot: "away",
        loserNextKey: options.includePlacement7 ? "p7" : null,
        loserNextSlot: options.includePlacement7 ? "away" : null,
        sortOrder: 103,
      },
      {
        key: "sf1",
        round: "semifinal",
        homeId: null,
        awayId: null,
        nextKey: "final",
        nextSlot: "home",
        loserNextKey: options.includeThirdPlace ? "third" : null,
        loserNextSlot: options.includeThirdPlace ? "home" : null,
        sortOrder: 200,
      },
      {
        key: "sf2",
        round: "semifinal",
        homeId: null,
        awayId: null,
        nextKey: "final",
        nextSlot: "away",
        loserNextKey: options.includeThirdPlace ? "third" : null,
        loserNextSlot: options.includeThirdPlace ? "away" : null,
        sortOrder: 201,
      },
      {
        key: "final",
        round: "final",
        homeId: null,
        awayId: null,
        nextKey: null,
        nextSlot: null,
        loserNextKey: null,
        loserNextSlot: null,
        sortOrder: 400,
      },
    );

    if (options.includeThirdPlace) {
      matches.push({
        key: "third",
        round: "third-place",
        homeId: null,
        awayId: null,
        nextKey: null,
        nextSlot: null,
        loserNextKey: null,
        loserNextSlot: null,
        sortOrder: 390,
      });
    }
    if (options.includePlacement5) {
      matches.push({
        key: "p5",
        round: "placement-5",
        homeId: null,
        awayId: null,
        nextKey: null,
        nextSlot: null,
        loserNextKey: null,
        loserNextSlot: null,
        sortOrder: 250,
      });
    }
    if (options.includePlacement7) {
      matches.push({
        key: "p7",
        round: "placement-7",
        homeId: null,
        awayId: null,
        nextKey: null,
        nextSlot: null,
        loserNextKey: null,
        loserNextSlot: null,
        sortOrder: 251,
      });
    }
  }

  return { matches, error: null };
}

export function resolveKnockoutOutcome(match: KnockoutMatchLike): {
  winnerId: string | null;
  loserId: string | null;
  error: string | null;
} {
  if (!match.homeApplicationId || !match.awayApplicationId) {
    return { winnerId: null, loserId: null, error: "Beide Teams müssen gesetzt sein." };
  }

  if (match.homeApplicationId === match.awayApplicationId) {
    return { winnerId: null, loserId: null, error: "Ein Team kann nicht gegen sich selbst spielen." };
  }

  if (match.status !== "completed" || match.homeScore == null || match.awayScore == null) {
    return { winnerId: null, loserId: null, error: null };
  }

  if (match.homeScore !== match.awayScore) {
    const homeWins = match.homeScore > match.awayScore;
    return {
      winnerId: homeWins ? match.homeApplicationId : match.awayApplicationId,
      loserId: homeWins ? match.awayApplicationId : match.homeApplicationId,
      error: null,
    };
  }

  if (
    match.decidedBy === "penalties" &&
    match.homePenalties != null &&
    match.awayPenalties != null &&
    match.homePenalties !== match.awayPenalties
  ) {
    const homeWins = match.homePenalties > match.awayPenalties;
    return {
      winnerId: homeWins ? match.homeApplicationId : match.awayApplicationId,
      loserId: homeWins ? match.awayApplicationId : match.homeApplicationId,
      error: null,
    };
  }

  return {
    winnerId: null,
    loserId: null,
    error: "KO-Spiele dürfen nicht unentschieden enden. Bitte Elfmeterschießen eintragen.",
  };
}

export function hasDuplicateTeamInRound(
  matches: Array<{ round?: KnockoutRound | null; homeApplicationId: string | null; awayApplicationId: string | null }>,
) {
  const seen = new Map<string, Set<string>>();

  for (const match of matches) {
    if (!match.round) {
      continue;
    }
    const roundTeams = seen.get(match.round) ?? new Set<string>();
    for (const teamId of [match.homeApplicationId, match.awayApplicationId]) {
      if (!teamId) {
        continue;
      }
      if (roundTeams.has(teamId)) {
        return true;
      }
      roundTeams.add(teamId);
    }
    seen.set(match.round, roundTeams);
  }

  return false;
}

export type PlacementRow = {
  place: number;
  applicationId: string;
};

export function computeKnockoutPlacements(matches: KnockoutMatchLike[]): PlacementRow[] {
  const rows: PlacementRow[] = [];

  function addFromRound(round: KnockoutRound, winnerPlace: number, loserPlace: number) {
    const match = matches.find((item) => item.round === round);
    if (!match) {
      return;
    }
    const outcome = resolveKnockoutOutcome(match);
    if (!outcome.winnerId || !outcome.loserId) {
      return;
    }
    rows.push({ place: winnerPlace, applicationId: outcome.winnerId });
    rows.push({ place: loserPlace, applicationId: outcome.loserId });
  }

  addFromRound("final", 1, 2);
  addFromRound("third-place", 3, 4);
  addFromRound("placement-5", 5, 6);
  addFromRound("placement-7", 7, 8);

  return rows.sort((a, b) => a.place - b.place);
}

export const KNOCKOUT_SCHEDULE_WAVES: KnockoutRound[][] = [
  ["quarterfinal"],
  ["semifinal", "placement-5", "placement-7"],
  ["third-place", "final"],
];

function assignSlot<T extends { homeApplicationId: string | null; awayApplicationId: string | null }>(
  match: T,
  slot: KnockoutSlot,
  teamId: string | null,
) {
  if (slot === "home") {
    match.homeApplicationId = teamId;
  } else {
    match.awayApplicationId = teamId;
  }
}

function resetKnockoutResult<
  T extends {
    status: MatchStatus;
    homeScore: number | null;
    awayScore: number | null;
    homePenalties?: number | null;
    awayPenalties?: number | null;
    decidedBy?: DecidedBy | null;
  },
>(match: T) {
  match.status = "scheduled";
  match.homeScore = null;
  match.awayScore = null;
  match.homePenalties = null;
  match.awayPenalties = null;
  match.decidedBy = "regular";
}

export function propagateKnockoutTeams<T extends KnockoutMatchLike & { id: string }>(matches: T[]): T[] {
  const byId = new Map(matches.map((match) => [match.id, { ...match }]));

  function setForward(sourceId: string, visited: Set<string>) {
    if (visited.has(sourceId)) {
      return;
    }
    visited.add(sourceId);
    const source = byId.get(sourceId);
    if (!source) {
      return;
    }

    const outcome = resolveKnockoutOutcome(source);
    const winnerId = outcome.error ? null : outcome.winnerId;
    const loserId = outcome.error ? null : outcome.loserId;

    function place(targetId: string | null | undefined, slot: KnockoutSlot | null | undefined, teamId: string | null) {
      if (!targetId || !slot) {
        return;
      }
      const target = byId.get(targetId);
      if (!target) {
        return;
      }
      const previous = slot === "home" ? target.homeApplicationId : target.awayApplicationId;
      if (previous === teamId) {
        return;
      }
      assignSlot(target, slot, teamId);
      if (target.status === "completed") {
        resetKnockoutResult(target);
        setForward(target.id, visited);
      }
    }

    place(source.nextMatchId, source.nextMatchSlot, winnerId);
    place(source.loserNextMatchId, source.loserNextMatchSlot, loserId);
  }

  for (const match of matches) {
    setForward(match.id, new Set());
  }

  return [...byId.values()];
}

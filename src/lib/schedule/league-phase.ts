/**
 * Pure Champions League league phase.
 * No DB, no server actions, no UI.
 *
 * Even team counts: the first M rounds of the circle method. Each round is a
 * perfect matching, so every team plays exactly once per round.
 * Odd team counts: the first M/2 cycles of the Walecki Hamilton decomposition
 * of the complete graph. Each cycle gives every team two distinct opponents.
 * A simple league with equal matches and no repeated opponents exists only when
 * 1 <= M <= n - 1 and n * M is even.
 */

import {
  buildKnockoutPlan,
  defaultFirstRoundSeeds,
  type KnockoutFormat,
  type KnockoutOptions,
  type KnockoutPlanMatch,
  type QualifiedTeam,
} from "@/lib/schedule/knockout";

export const LEAGUE_KNOCKOUT_CUTOFFS = [4, 8, 16] as const;

export type LeagueKnockoutCutoff = (typeof LEAGUE_KNOCKOUT_CUTOFFS)[number];

export const LEAGUE_PHASE_ISSUE_CODES = [
  "INVALID_CUTOFF",
  "INVALID_MATCHES_PER_TEAM",
  "EMPTY_TEAM_ID",
  "DUPLICATE_TEAM",
  "TOO_FEW_TEAMS",
  "MATCHES_OUT_OF_RANGE",
  "UNEVEN_MATCH_TOTAL",
  "CUTOFF_EXCEEDS_TEAMS",
  "FIXTURE_INVARIANT",
  "SAME_CLUB_TOO_FEW_OPPONENTS",
  "SAME_CLUB_DRAW_NOT_FOUND",
] as const;

export type LeaguePhaseIssueCode = (typeof LEAGUE_PHASE_ISSUE_CODES)[number];

export type LeaguePhaseInput = {
  teamIds: readonly string[];
  matchesPerTeam: number;
  knockoutCutoff: number;
  /**
   * When true, two teams that share the same non-null club identity must not be
   * drawn against each other in the league phase. The restriction is never
   * silently relaxed: an impossible draw fails with an explicit error.
   */
  restrictSameClub?: boolean;
  /**
   * Stable club identity per team id. A null/absent value means the team has no
   * shared club identity and can meet anyone. Only used when restrictSameClub.
   */
  clubByTeamId?: Readonly<Record<string, string | null>>;
};

export type ValidLeaguePhaseConfig = {
  teamIds: string[];
  matchesPerTeam: number;
  knockoutCutoff: LeagueKnockoutCutoff;
  restrictSameClub: boolean;
  clubByTeamId: Readonly<Record<string, string | null>>;
};

export type LeaguePhaseValidation =
  | { ok: true; config: ValidLeaguePhaseConfig }
  | { ok: false; code: LeaguePhaseIssueCode; message: string };

export type LeagueFixture = {
  homeId: string;
  awayId: string;
  /**
   * Even team counts: circle-method round, each team once.
   * Odd team counts: Hamilton cycle, each team twice.
   */
  roundIndex: number;
};

export type LeagueFixtureBuild = {
  fixtures: LeagueFixture[];
  error: string | null;
  code: LeaguePhaseIssueCode | null;
};

export type RankedLeagueTeam = {
  participantId: string;
  rank: number;
};

export type LeagueQualifierSelection = {
  qualifiers: RankedLeagueTeam[];
  error: string | null;
};

export type LeagueKnockoutPlan = {
  matches: KnockoutPlanMatch[];
  error: string | null;
};

const FIRST_ROUND_RANKS: Record<LeagueKnockoutCutoff, ReadonlyArray<readonly [number, number]>> = {
  4: [
    [1, 4],
    [2, 3],
  ],
  8: [
    [1, 8],
    [4, 5],
    [2, 7],
    [3, 6],
  ],
  // Standard single-elimination seeding for 16 qualifiers, in bracket order.
  // Top-half matches first (seed 1), bottom-half last (seed 2), so seeds 1 and
  // 2 can only meet in the final.
  16: [
    [1, 16],
    [8, 9],
    [4, 13],
    [5, 12],
    [2, 15],
    [7, 10],
    [3, 14],
    [6, 11],
  ],
};

function fail(code: LeaguePhaseIssueCode, message: string): LeaguePhaseValidation {
  return { ok: false, code, message };
}

function isKnockoutCutoff(value: number): value is LeagueKnockoutCutoff {
  return value === 4 || value === 8 || value === 16;
}

export function leagueFirstRoundRanks(
  cutoff: LeagueKnockoutCutoff,
): ReadonlyArray<readonly [number, number]> {
  return FIRST_ROUND_RANKS[cutoff];
}

export function expectedLeagueMatchCount(teamCount: number, matchesPerTeam: number): number | null {
  if (!Number.isInteger(teamCount) || !Number.isInteger(matchesPerTeam)) {
    return null;
  }
  if (teamCount < 2 || matchesPerTeam < 1 || matchesPerTeam > teamCount - 1) {
    return null;
  }
  if ((teamCount * matchesPerTeam) % 2 !== 0) {
    return null;
  }
  return (teamCount * matchesPerTeam) / 2;
}

export function validateLeaguePhaseConfig(input: LeaguePhaseInput): LeaguePhaseValidation {
  if (!isKnockoutCutoff(input.knockoutCutoff)) {
    return fail(
      "INVALID_CUTOFF",
      "Die K.-o.-Qualifikation unterstützt die ersten 4, 8 oder 16 Teams.",
    );
  }

  if (!Number.isInteger(input.matchesPerTeam)) {
    return fail(
      "INVALID_MATCHES_PER_TEAM",
      "Die Spiele pro Team müssen eine ganze Zahl sein.",
    );
  }

  if (!Array.isArray(input.teamIds)) {
    return fail("TOO_FEW_TEAMS", "Für eine Liga werden mindestens zwei Teams benötigt.");
  }

  const seen = new Set<string>();
  const teamIds: string[] = [];
  for (const teamId of input.teamIds) {
    if (typeof teamId !== "string" || teamId.trim() === "") {
      return fail("EMPTY_TEAM_ID", "Jeder Teilnehmer braucht eine gültige Kennung.");
    }
    if (seen.has(teamId)) {
      return fail("DUPLICATE_TEAM", "Ein Team darf nur einmal gesetzt sein.");
    }
    seen.add(teamId);
    teamIds.push(teamId);
  }

  if (teamIds.length < 2) {
    return fail("TOO_FEW_TEAMS", "Für eine Liga werden mindestens zwei Teams benötigt.");
  }

  if (input.matchesPerTeam < 1 || input.matchesPerTeam > teamIds.length - 1) {
    return fail(
      "MATCHES_OUT_OF_RANGE",
      `Jedes Team spielt zwischen 1 und ${teamIds.length - 1} verschiedene Gegner.`,
    );
  }

  if ((teamIds.length * input.matchesPerTeam) % 2 !== 0) {
    return fail(
      "UNEVEN_MATCH_TOTAL",
      "Die Gesamtzahl der Ligabegegnungen muss ganzzahlig sein. Bei ungerader Teamzahl muss die Spielezahl pro Team gerade sein.",
    );
  }

  if (teamIds.length < input.knockoutCutoff) {
    return fail(
      "CUTOFF_EXCEEDS_TEAMS",
      "Es gibt weniger Teams als Qualifikationsplätze.",
    );
  }

  const restrictSameClub = input.restrictSameClub === true;
  const clubByTeamId: Record<string, string | null> = {};
  for (const teamId of teamIds) {
    const club = input.clubByTeamId?.[teamId];
    clubByTeamId[teamId] = typeof club === "string" && club.trim() !== "" ? club : null;
  }

  if (restrictSameClub) {
    const clubSizes = new Map<string, number>();
    for (const teamId of teamIds) {
      const club = clubByTeamId[teamId];
      if (club != null) {
        clubSizes.set(club, (clubSizes.get(club) ?? 0) + 1);
      }
    }
    for (const teamId of teamIds) {
      const club = clubByTeamId[teamId];
      const sameClubCount = club != null ? (clubSizes.get(club) ?? 1) : 1;
      const allowedOpponents = teamIds.length - sameClubCount;
      if (allowedOpponents < input.matchesPerTeam) {
        return fail(
          "SAME_CLUB_TOO_FEW_OPPONENTS",
          "Diese Konfiguration ist nachweislich unmöglich: Mit dem Ausschluss vereinsinterner Begegnungen hat mindestens ein Team weniger mögliche Gegner als die gewünschte Spielezahl. Bitte reduziere die Spiele pro Team oder verteile die Vereine anders.",
        );
      }
    }
  }

  return {
    ok: true,
    config: {
      teamIds,
      matchesPerTeam: input.matchesPerTeam,
      knockoutCutoff: input.knockoutCutoff,
      restrictSameClub,
      clubByTeamId,
    },
  };
}

function mod(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}

function rotateCircle(circle: readonly string[]): string[] | null {
  const [fixed, ...rest] = circle;
  const last = rest.pop();
  if (!fixed || last === undefined) {
    return null;
  }
  return [fixed, last, ...rest];
}

function circleMethodRounds(teamIds: readonly string[], roundCount: number): LeagueFixture[] | null {
  const teamCount = teamIds.length;
  if (teamCount % 2 !== 0 || roundCount < 1 || roundCount > teamCount - 1) {
    return null;
  }

  let circle = [...teamIds];
  const fixtures: LeagueFixture[] = [];
  for (let round = 0; round < roundCount; round += 1) {
    const half = teamCount / 2;
    for (let index = 0; index < half; index += 1) {
      const left = circle[index];
      const right = circle[teamCount - 1 - index];
      if (!left || !right) {
        return null;
      }
      if (round % 2 === 0) {
        fixtures.push({ homeId: left, awayId: right, roundIndex: round });
      } else {
        fixtures.push({ homeId: right, awayId: left, roundIndex: round });
      }
    }

    if (round < roundCount - 1) {
      const rotated = rotateCircle(circle);
      if (!rotated) {
        return null;
      }
      circle = rotated;
    }
  }

  return fixtures;
}

function hamiltonCycle(teamIds: readonly string[], cycleIndex: number): LeagueFixture[] | null {
  const teamCount = teamIds.length;
  const polygonCount = teamCount - 1;
  const infinity = teamIds[0];
  if (!infinity || polygonCount < 2 || polygonCount % 2 !== 0) {
    return null;
  }

  const polygon = teamIds.slice(1);
  const sequence: string[] = [];
  for (let step = 0; step < polygonCount; step += 1) {
    let offset = 0;
    if (step !== 0) {
      offset = step % 2 === 1 ? -((step + 1) / 2) : step / 2;
    }
    const vertex = polygon[mod(cycleIndex + offset, polygonCount)];
    if (!vertex) {
      return null;
    }
    sequence.push(vertex);
  }

  const cycle = [infinity, ...sequence];
  const fixtures: LeagueFixture[] = [];
  for (let index = 0; index < cycle.length; index += 1) {
    const homeId = cycle[index];
    const awayId = cycle[(index + 1) % cycle.length];
    if (!homeId || !awayId) {
      return null;
    }
    fixtures.push({ homeId, awayId, roundIndex: cycleIndex });
  }

  return fixtures;
}

function hamiltonCycles(teamIds: readonly string[], cycleCount: number): LeagueFixture[] | null {
  const maximumCycles = (teamIds.length - 1) / 2;
  if (teamIds.length % 2 !== 1 || cycleCount < 1 || cycleCount > maximumCycles) {
    return null;
  }

  const fixtures: LeagueFixture[] = [];
  for (let cycleIndex = 0; cycleIndex < cycleCount; cycleIndex += 1) {
    const cycle = hamiltonCycle(teamIds, cycleIndex);
    if (!cycle) {
      return null;
    }
    fixtures.push(...cycle);
  }
  return fixtures;
}

function unorderedPair(homeId: string, awayId: string) {
  return homeId < awayId ? `${homeId}\0${awayId}` : `${awayId}\0${homeId}`;
}

function isPerfectMatching(teamIds: readonly string[], edges: readonly LeagueFixture[]) {
  if (edges.length * 2 !== teamIds.length) {
    return false;
  }
  const seen = new Set<string>();
  for (const edge of edges) {
    if (edge.homeId === edge.awayId || seen.has(edge.homeId) || seen.has(edge.awayId)) {
      return false;
    }
    seen.add(edge.homeId);
    seen.add(edge.awayId);
  }
  return seen.size === teamIds.length;
}

function isHamiltonCycle(teamIds: readonly string[], edges: readonly LeagueFixture[]) {
  if (edges.length !== teamIds.length || teamIds.length < 3) {
    return false;
  }

  const adjacency = new Map<string, string[]>();
  for (const teamId of teamIds) {
    adjacency.set(teamId, []);
  }
  for (const edge of edges) {
    if (edge.homeId === edge.awayId) {
      return false;
    }
    const home = adjacency.get(edge.homeId);
    const away = adjacency.get(edge.awayId);
    if (!home || !away) {
      return false;
    }
    home.push(edge.awayId);
    away.push(edge.homeId);
  }

  for (const teamId of teamIds) {
    if ((adjacency.get(teamId)?.length ?? 0) !== 2) {
      return false;
    }
  }

  const start = teamIds[0];
  if (!start) {
    return false;
  }
  const seen = new Set<string>();
  let current: string | undefined = start;
  let previous: string | null = null;
  for (let step = 0; step < teamIds.length; step += 1) {
    if (!current || seen.has(current)) {
      return false;
    }
    seen.add(current);
    const neighbors: string[] = adjacency.get(current) ?? [];
    const successor = neighbors.find((neighbor) => neighbor !== previous);
    previous = current;
    current = successor;
  }

  return seen.size === teamIds.length && current === start;
}

function findFixtureIssue(config: ValidLeaguePhaseConfig, fixtures: readonly LeagueFixture[]) {
  const expected = expectedLeagueMatchCount(config.teamIds.length, config.matchesPerTeam);
  if (expected == null || fixtures.length !== expected) {
    return "Die Anzahl der Begegnungen stimmt nicht.";
  }

  const teamIds = new Set(config.teamIds);
  const played = new Map(config.teamIds.map((teamId) => [teamId, 0]));
  const pairs = new Set<string>();
  const byRound = new Map<number, LeagueFixture[]>();

  for (const fixture of fixtures) {
    if (!teamIds.has(fixture.homeId) || !teamIds.has(fixture.awayId)) {
      return "Eine Begegnung enthält ein unbekanntes Team.";
    }
    if (fixture.homeId === fixture.awayId) {
      return "Ein Team kann nicht gegen sich selbst spielen.";
    }
    const pair = unorderedPair(fixture.homeId, fixture.awayId);
    if (pairs.has(pair)) {
      return "Zwei Teams treffen mehr als einmal aufeinander.";
    }
    if (config.restrictSameClub) {
      const homeClub = config.clubByTeamId[fixture.homeId];
      const awayClub = config.clubByTeamId[fixture.awayId];
      if (homeClub != null && awayClub != null && homeClub === awayClub) {
        return "Zwei Mannschaften desselben Vereins treffen in der Ligaphase aufeinander.";
      }
    }
    pairs.add(pair);
    played.set(fixture.homeId, (played.get(fixture.homeId) ?? 0) + 1);
    played.set(fixture.awayId, (played.get(fixture.awayId) ?? 0) + 1);
    const round = byRound.get(fixture.roundIndex) ?? [];
    round.push(fixture);
    byRound.set(fixture.roundIndex, round);
  }

  for (const teamId of config.teamIds) {
    if (played.get(teamId) !== config.matchesPerTeam) {
      return "Nicht jedes Team hat die gleiche Anzahl Spiele.";
    }
  }

  if (config.restrictSameClub) {
    // Constrained draws are coloured into rounds that are plain matchings: each
    // team plays at most once per round so the round maps to one time block.
    for (const [, round] of byRound) {
      const roundTeams = new Set<string>();
      for (const fixture of round) {
        if (roundTeams.has(fixture.homeId) || roundTeams.has(fixture.awayId)) {
          return "Eine Ligarunde setzt ein Team doppelt ein.";
        }
        roundTeams.add(fixture.homeId);
        roundTeams.add(fixture.awayId);
      }
    }
    return null;
  }

  const odd = config.teamIds.length % 2 === 1;
  const roundCount = odd ? config.matchesPerTeam / 2 : config.matchesPerTeam;
  if (byRound.size !== roundCount) {
    return "Die Rundenzahl stimmt nicht.";
  }

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const round = byRound.get(roundIndex);
    if (!round) {
      return "Eine Runde fehlt.";
    }
    const valid = odd
      ? isHamiltonCycle(config.teamIds, round)
      : isPerfectMatching(config.teamIds, round);
    if (!valid) {
      return odd
        ? "Eine ungerade Ligarunde ist kein Hamiltonkreis."
        : "Eine gerade Ligarunde ist kein vollständiges Matching.";
    }
  }

  return null;
}

/** Deterministic PRNG so a given set of teams always yields the same draw. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromTeamIds(teamIds: readonly string[], salt: number): number {
  let hash = 2166136261 ^ salt;
  for (const teamId of teamIds) {
    for (let index = 0; index < teamId.length; index += 1) {
      hash ^= teamId.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

function shuffleInPlace<T>(items: T[], rng: () => number): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [items[index], items[swap]] = [items[swap]!, items[index]!];
  }
  return items;
}

function sameClubForbidden(
  clubByTeamId: Readonly<Record<string, string | null>>,
  left: string,
  right: string,
): boolean {
  const leftClub = clubByTeamId[left];
  const rightClub = clubByTeamId[right];
  return leftClub != null && rightClub != null && leftClub === rightClub;
}

/**
 * Havel–Hakimi style construction of an M-regular simple graph that skips
 * forbidden (same-club) edges. Returns unordered edges or null when this random
 * attempt gets stuck. Caller retries with fresh randomness before giving up.
 */
function tryBuildRegularGraph(
  teamIds: readonly string[],
  matchesPerTeam: number,
  clubByTeamId: Readonly<Record<string, string | null>>,
  rng: () => number,
): Array<[string, string]> | null {
  const need = new Map<string, number>(teamIds.map((teamId) => [teamId, matchesPerTeam]));
  const adjacency = new Map<string, Set<string>>(teamIds.map((teamId) => [teamId, new Set()]));
  const edges: Array<[string, string]> = [];

  for (;;) {
    const active = teamIds.filter((teamId) => (need.get(teamId) ?? 0) > 0);
    if (active.length === 0) {
      return edges;
    }
    shuffleInPlace(active, rng);
    active.sort((left, right) => (need.get(right) ?? 0) - (need.get(left) ?? 0));
    const vertex = active[0]!;
    const vertexNeed = need.get(vertex) ?? 0;

    const candidates = teamIds.filter(
      (teamId) =>
        teamId !== vertex &&
        (need.get(teamId) ?? 0) > 0 &&
        !adjacency.get(vertex)!.has(teamId) &&
        !sameClubForbidden(clubByTeamId, vertex, teamId),
    );
    if (candidates.length < vertexNeed) {
      return null;
    }
    shuffleInPlace(candidates, rng);
    candidates.sort((left, right) => (need.get(right) ?? 0) - (need.get(left) ?? 0));

    for (let index = 0; index < vertexNeed; index += 1) {
      const partner = candidates[index]!;
      adjacency.get(vertex)!.add(partner);
      adjacency.get(partner)!.add(vertex);
      need.set(vertex, (need.get(vertex) ?? 0) - 1);
      need.set(partner, (need.get(partner) ?? 0) - 1);
      edges.push([vertex, partner]);
    }
  }
}

/** Greedy edge colouring: each colour is a round (a matching, one time block). */
function colourEdgesIntoRounds(
  edges: ReadonlyArray<readonly [string, string]>,
  rng: () => number,
): LeagueFixture[] {
  const ordered = shuffleInPlace([...edges], rng);
  const usedRounds = new Map<string, Set<number>>();
  const homeCount = new Map<string, number>();
  const fixtures: LeagueFixture[] = [];

  const roundsOf = (teamId: string) => {
    let rounds = usedRounds.get(teamId);
    if (!rounds) {
      rounds = new Set();
      usedRounds.set(teamId, rounds);
    }
    return rounds;
  };

  for (const [left, right] of ordered) {
    const leftRounds = roundsOf(left);
    const rightRounds = roundsOf(right);
    let roundIndex = 0;
    while (leftRounds.has(roundIndex) || rightRounds.has(roundIndex)) {
      roundIndex += 1;
    }
    leftRounds.add(roundIndex);
    rightRounds.add(roundIndex);
    // Light home/away balancing keeps the schedule fair without affecting pairings.
    const leftHomes = homeCount.get(left) ?? 0;
    const rightHomes = homeCount.get(right) ?? 0;
    const homeId = leftHomes <= rightHomes ? left : right;
    const awayId = homeId === left ? right : left;
    homeCount.set(homeId, (homeCount.get(homeId) ?? 0) + 1);
    fixtures.push({ homeId, awayId, roundIndex });
  }

  return fixtures;
}

function buildSameClubFixtures(config: ValidLeaguePhaseConfig): LeagueFixture[] | null {
  const attempts = 400;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const rng = mulberry32(seedFromTeamIds(config.teamIds, attempt + 1));
    const edges = tryBuildRegularGraph(
      config.teamIds,
      config.matchesPerTeam,
      config.clubByTeamId,
      rng,
    );
    if (!edges) {
      continue;
    }
    const fixtures = colourEdgesIntoRounds(edges, rng);
    if (findFixtureIssue(config, fixtures) == null) {
      return fixtures;
    }
  }
  return null;
}

export function buildLeagueFixtures(input: LeaguePhaseInput): LeagueFixtureBuild {
  const validated = validateLeaguePhaseConfig(input);
  if (!validated.ok) {
    return { fixtures: [], error: validated.message, code: validated.code };
  }

  const { config } = validated;

  if (config.restrictSameClub) {
    const fixtures = buildSameClubFixtures(config);
    if (!fixtures) {
      // The per-team precheck already rejects provably impossible setups. Here
      // the constructive search was exhausted without finding a draw; this is
      // not a proof of impossibility, so the message says so.
      return {
        fixtures: [],
        error:
          "Es konnte keine gültige Auslosung ohne vereinsinterne Begegnungen gefunden werden. Das ist kein Nachweis der Unmöglichkeit – bitte reduziere die Spiele pro Team oder verteile die Vereine anders und versuche es erneut.",
        code: "SAME_CLUB_DRAW_NOT_FOUND",
      };
    }
    return { fixtures, error: null, code: null };
  }

  const fixtures =
    config.teamIds.length % 2 === 0
      ? circleMethodRounds(config.teamIds, config.matchesPerTeam)
      : hamiltonCycles(config.teamIds, config.matchesPerTeam / 2);

  if (!fixtures) {
    return {
      fixtures: [],
      error: "Die Ligapaarungen konnten nicht erzeugt werden.",
      code: "FIXTURE_INVARIANT",
    };
  }

  const issue = findFixtureIssue(config, fixtures);
  if (issue) {
    return {
      fixtures: [],
      error: `Die Ligapaarungen sind ungültig: ${issue}`,
      code: "FIXTURE_INVARIANT",
    };
  }

  return { fixtures, error: null, code: null };
}

export function selectLeagueQualifiers(
  ranked: readonly RankedLeagueTeam[],
  cutoff: number,
): LeagueQualifierSelection {
  if (!isKnockoutCutoff(cutoff)) {
    return {
      qualifiers: [],
      error: "Die K.-o.-Qualifikation unterstützt die ersten 4, 8 oder 16 Teams.",
    };
  }

  const byRank = new Map<number, string>();
  const participants = new Set<string>();
  for (const row of ranked) {
    if (typeof row.participantId !== "string" || row.participantId.trim() === "") {
      return { qualifiers: [], error: "Jeder Teilnehmer braucht eine gültige Kennung." };
    }
    if (!Number.isInteger(row.rank) || row.rank < 1) {
      return { qualifiers: [], error: "Jede Platzierung muss eine positive ganze Zahl sein." };
    }
    if (participants.has(row.participantId)) {
      return { qualifiers: [], error: "Ein Team ist mehrfach in der Tabelle." };
    }
    if (byRank.has(row.rank)) {
      return { qualifiers: [], error: "Jede Platzierung darf nur einmal vorkommen." };
    }
    participants.add(row.participantId);
    byRank.set(row.rank, row.participantId);
  }

  const qualifiers: RankedLeagueTeam[] = [];
  for (let rank = 1; rank <= cutoff; rank += 1) {
    const participantId = byRank.get(rank);
    if (!participantId) {
      return {
        qualifiers: [],
        error: `Die Platzierungen 1 bis ${cutoff} müssen vollständig sein.`,
      };
    }
    qualifiers.push({ participantId, rank });
  }

  return { qualifiers, error: null };
}

function placeholderQualifiers(format: KnockoutFormat): QualifiedTeam[] {
  const labels = [...new Set(defaultFirstRoundSeeds(format).flat())];
  return labels.map((seedLabel, index) => ({
    applicationId: `seed:${seedLabel}`,
    groupIndex: index,
    rank: 1,
    seedLabel,
  }));
}

export function buildLeagueKnockoutPlan(
  options: KnockoutOptions,
  ranked: readonly RankedLeagueTeam[],
): LeagueKnockoutPlan {
  if (!isKnockoutCutoff(options.format)) {
    return {
      matches: [],
      error: "Die K.-o.-Qualifikation unterstützt die ersten 4, 8 oder 16 Teams.",
    };
  }

  const selected = selectLeagueQualifiers(ranked, options.format);
  if (selected.error) {
    return { matches: [], error: selected.error };
  }

  const skeleton = buildKnockoutPlan(options, placeholderQualifiers(options.format));
  if (skeleton.error) {
    return { matches: [], error: skeleton.error };
  }

  const pairs = leagueFirstRoundRanks(options.format);
  const matches = skeleton.matches.map((match) => ({ ...match }));
  const seeded = matches
    .filter((match) => match.homeId != null && match.awayId != null)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  if (seeded.length !== pairs.length) {
    return {
      matches: [],
      error: "Das bestehende K.-o.-Gerüst passt nicht zur Ligasetzung.",
    };
  }

  const qualifierByRank = new Map(
    selected.qualifiers.map((team) => [team.rank, team.participantId]),
  );
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    const match = seeded[index];
    const homeId = pair ? qualifierByRank.get(pair[0]) : undefined;
    const awayId = pair ? qualifierByRank.get(pair[1]) : undefined;
    if (!match || !homeId || !awayId) {
      return {
        matches: [],
        error: "Die Ligasetzung konnte nicht in das K.-o.-Gerüst übernommen werden.",
      };
    }
    match.homeId = homeId;
    match.awayId = awayId;
  }

  return { matches, error: null };
}

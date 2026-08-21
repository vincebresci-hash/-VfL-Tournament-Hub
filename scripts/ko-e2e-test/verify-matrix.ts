/**
 * Lokale Verifikation der vorgeschriebenen Gruppenmatrix für den KO-E2E-Test.
 * Keine DB, keine Produktionsdaten.
 */
import { computeGroupStandings } from "../../src/lib/schedule/standings";
import {
  buildKnockoutPlan,
  propagateKnockoutTeams,
  resolveKnockoutOutcome,
  type KnockoutMatchLike,
} from "../../src/lib/schedule/knockout";

function koMatch(
  partial: Partial<KnockoutMatchLike> & { id?: string },
): KnockoutMatchLike & { id: string } {
  return {
    id: partial.id ?? "match",
    homeApplicationId: null,
    awayApplicationId: null,
    homeScore: null,
    awayScore: null,
    status: "scheduled",
    decidedBy: "regular",
    homePenalties: null,
    awayPenalties: null,
    round: null,
    nextMatchId: null,
    nextMatchSlot: null,
    loserNextMatchId: null,
    loserNextMatchSlot: null,
    ...partial,
  };
}

function completeAndPropagate(
  matches: Array<KnockoutMatchLike & { id: string }>,
  id: string,
  homeScore: number,
  awayScore: number,
  penalties?: { homePenalties: number; awayPenalties: number },
) {
  const next = matches.map((match) =>
    match.id === id
      ? {
          ...match,
          homeScore,
          awayScore,
          status: "completed" as const,
          decidedBy: penalties ? ("penalties" as const) : ("regular" as const),
          homePenalties: penalties?.homePenalties ?? null,
          awayPenalties: penalties?.awayPenalties ?? null,
        }
      : { ...match },
  );
  return propagateKnockoutTeams(next);
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const groupAIds = ["A1", "A2", "A3", "A4"];
const groupAMatches = [
  { homeApplicationId: "A1", awayApplicationId: "A2", homeScore: 3, awayScore: 1, status: "completed" as const },
  { homeApplicationId: "A1", awayApplicationId: "A3", homeScore: 2, awayScore: 0, status: "completed" as const },
  { homeApplicationId: "A1", awayApplicationId: "A4", homeScore: 4, awayScore: 0, status: "completed" as const },
  { homeApplicationId: "A2", awayApplicationId: "A3", homeScore: 2, awayScore: 1, status: "completed" as const },
  { homeApplicationId: "A2", awayApplicationId: "A4", homeScore: 3, awayScore: 0, status: "completed" as const },
  { homeApplicationId: "A3", awayApplicationId: "A4", homeScore: 1, awayScore: 0, status: "completed" as const },
];

const standingsA = computeGroupStandings(groupAIds, groupAMatches);
assert(standingsA.map((row) => row.applicationId).join(",") === "A1,A2,A3,A4", "Reihenfolge Gruppe A");
assert(standingsA[0]?.points === 9 && standingsA[0].goalDiff === 8, "A1 9/+8");
assert(standingsA[1]?.points === 6 && standingsA[1].goalDiff === 2, "A2 6/+2");
assert(standingsA[2]?.points === 3 && standingsA[2].goalDiff === -2, "A3 3/-2");
assert(standingsA[3]?.points === 0 && standingsA[3].goalDiff === -8, "A4 0/-8");
assert(groupAMatches.length === 6, "6 Gruppenspiele");

const plan = buildKnockoutPlan(
  {
    format: 4,
    includeThirdPlace: true,
    includePlacement5: false,
    includePlacement7: false,
  },
  [
    { applicationId: "A1", groupIndex: 0, rank: 1, seedLabel: "A1" },
    { applicationId: "A2", groupIndex: 0, rank: 2, seedLabel: "A2" },
    { applicationId: "B1", groupIndex: 1, rank: 1, seedLabel: "B1" },
    { applicationId: "B2", groupIndex: 1, rank: 2, seedLabel: "B2" },
  ],
);

assert(!plan.error, "KO-Plan");
assert(plan.matches.find((match) => match.key === "sf1")?.homeId === "A1", "HF1 Heim A1");
assert(plan.matches.find((match) => match.key === "sf1")?.awayId === "B2", "HF1 Auswärts B2");
assert(plan.matches.find((match) => match.key === "sf2")?.homeId === "B1", "HF2 Heim B1");
assert(plan.matches.find((match) => match.key === "sf2")?.awayId === "A2", "HF2 Auswärts A2");

let live = plan.matches.map((match) =>
  koMatch({
    id: match.key,
    round: match.round,
    homeApplicationId: match.homeId,
    awayApplicationId: match.awayId,
    nextMatchId: match.nextKey,
    nextMatchSlot: match.nextSlot,
    loserNextMatchId: match.loserNextKey,
    loserNextMatchSlot: match.loserNextSlot,
  }),
);

live = completeAndPropagate(live, "sf1", 2, 1);
assert(live.find((match) => match.id === "final")?.homeApplicationId === "A1", "HF1 Sieger Finale");
assert(live.find((match) => match.id === "third")?.homeApplicationId === "B2", "HF1 Verlierer Platz 3");

live = completeAndPropagate(live, "sf2", 1, 1, { homePenalties: 5, awayPenalties: 4 });
const sf2 = live.find((match) => match.id === "sf2");
assert(resolveKnockoutOutcome(sf2!).winnerId === "B1", "Elfmeter-Sieger B1");
assert(live.find((match) => match.id === "final")?.awayApplicationId === "B1", "HF2 Sieger Finale");
assert(live.find((match) => match.id === "third")?.awayApplicationId === "A2", "HF2 Verlierer Platz 3");

live = completeAndPropagate(live, "final", 1, 0);
live = completeAndPropagate(live, "third", 2, 0);

const changed = completeAndPropagate(live, "sf1", 0, 3);
assert(changed.find((match) => match.id === "final")?.homeApplicationId === "B2", "Änderung Finale Heim");
assert(changed.find((match) => match.id === "third")?.homeApplicationId === "A1", "Änderung Platz 3 Heim");
assert(changed.find((match) => match.id === "final")?.status === "scheduled", "Finale zurückgesetzt");
assert(changed.find((match) => match.id === "third")?.status === "scheduled", "Platz 3 zurückgesetzt");

const finalTeams = [
  changed.find((match) => match.id === "final")?.homeApplicationId,
  changed.find((match) => match.id === "final")?.awayApplicationId,
];
assert(new Set(finalTeams).size === 2, "Keine doppelten Teams im Finale");

console.log("ko-e2e-matrix-checks: ok");

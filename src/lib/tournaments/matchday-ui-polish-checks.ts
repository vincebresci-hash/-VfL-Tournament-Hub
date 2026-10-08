import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeGroupStandings } from "@/lib/schedule/standings";
import {
  computeKnockoutPlacements,
  qualifyTopTwo,
  resolveKnockoutOutcome,
} from "@/lib/schedule/knockout";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Focused presentation checks for Matchday UI Polish.
 */
export function runMatchdayUiPolishChecks(): string {
  const schedule = read("src/components/tournaments/TournamentScheduleCards.tsx");
  const sides = read("src/components/tournaments/MatchSidesScoreBlock.tsx");
  const standings = read("src/components/tournaments/TournamentStandingsSection.tsx");
  const knockout = read("src/components/tournaments/TournamentKnockoutRounds.tsx");
  const placements = read("src/components/tournaments/TournamentPlacementsList.tsx");
  const stage = read("src/components/tournaments/TournamentPublicStage.tsx");
  const liveKo = read("src/lib/live/build-live-knockout-views.ts");
  const liveCard = read("src/components/live/LiveMatchCard.tsx");
  const standingsLogic = read("src/lib/schedule/standings.ts");
  const knockoutLogic = read("src/lib/schedule/knockout.ts");
  const logoWith = read("src/components/tournaments/TeamNameWithLogo.tsx");

  // Spielplan: explicit home/away rows via shared block
  assert(schedule.includes("<MatchSidesScoreBlock"), "Spielplan uses MatchSidesScoreBlock");
  assert(schedule.includes("home={home}"), "home side row wiring");
  assert(schedule.includes("away={away}"), "away side row wiring");
  assert(schedule.includes("homeScore={match.homeScore}"), "completed homeScore maps to home");
  assert(schedule.includes("awayScore={match.awayScore}"), "completed awayScore maps to away");
  assert(!schedule.includes(">vs<") && !schedule.includes(">VS<"), "no disconnected VS row in Spielplan");
  assert(!schedule.includes("Ergebnis folgt"), "no far-right Ergebnis folgt blob");
  assert(
    schedule.includes("homePenalties != null") &&
      schedule.includes("awayPenalties != null") &&
      !schedule.includes("homePenalties ?? 0"),
    "penalty note does not coerce null penalties to 0",
  );
  assert(
    knockout.includes("homePenalties != null") &&
      !knockout.includes("homePenalties ?? 0") &&
      !knockout.includes("bg-[#"),
    "KO penalty note null-safe; no arbitrary hex surfaces",
  );

  // Upcoming VS: centered between rows, not owned by one team
  assert(/\bVS\b/.test(sides), "VS presentation exists");
  assert(
    sides.includes("grid-cols-[minmax(0,1fr)_auto]") &&
      sides.includes("self-center") &&
      sides.includes("aria-hidden"),
    "upcoming VS is visually neutral between both team rows",
  );
  assert(
    !sides.includes("SideScoreRow") || sides.includes("completed"),
    "VS path is separate from per-side score rows",
  );

  // TeamNameWithLogo + fixed slot preserved
  assert(sides.includes("<TeamNameWithLogo"), "MatchSidesScoreBlock uses TeamNameWithLogo");
  assert(logoWith.includes("logoSlotClass"), "fixed logo-slot behavior remains");
  assert(sides.includes("min-w-0") && sides.includes("shrink-0"), "mobile min-w-0 / shrink-0 retained");

  // No business logic in presentation helpers
  for (const [name, src] of [
    ["sides", sides],
    ["placements", placements],
    ["schedule", schedule],
  ] as const) {
    assert(
      !src.includes("resolveKnockoutOutcome") &&
        !src.includes("computeGroupStandings") &&
        !src.includes("qualifyTopTwo") &&
        !src.includes("createClient") &&
        !src.includes("supabase"),
      `${name}: no business/data-layer logic`,
    );
  }

  // Standings: light polish only, no qualify inference
  assert(standings.includes("<TeamNameWithLogo"), "standings keep TeamNameWithLogo");
  assert(standings.includes("overflow-x-auto"), "intentional table overflow retained");
  assert(standings.includes("min-w-[40rem]"), "min-width behavior retained");
  assert(
    !standings.includes("qualif") &&
      !standings.includes("qualify") &&
      !/row\.rank\s*<=\s*2/.test(standings) &&
      !standings.includes("seedLabel"),
    "no qualification inference from rank",
  );
  assert(
    !standingsLogic.includes("MatchSidesScoreBlock") &&
      !standingsLogic.includes("TournamentPlacementsList"),
    "standings calculation unchanged by UI polish",
  );
  const computed = computeGroupStandings(["a", "b"], []);
  assert(computed.length === 2 && computed[0]?.points === 0, "standings math still runs");

  const qualified = qualifyTopTwo([{ id: "g1" }], {
    g1: [
      {
        applicationId: "a",
        rank: 1,
        played: 1,
        won: 1,
        drawn: 0,
        lost: 0,
        goalsFor: 1,
        goalsAgainst: 0,
        goalDiff: 1,
        points: 3,
      },
      {
        applicationId: "b",
        rank: 2,
        played: 1,
        won: 0,
        drawn: 0,
        lost: 1,
        goalsFor: 0,
        goalsAgainst: 1,
        goalDiff: -1,
        points: 0,
      },
    ],
  });
  assert(
    qualified[0]?.applicationId === "a" && qualified[1]?.applicationId === "b",
    "qualification unchanged",
  );

  // KO: prepared scores + winnerLabel reuse
  assert(knockout.includes("<MatchSidesScoreBlock"), "KO uses shared match language");
  assert(knockout.includes("homeScore={match.homeScore}"), "KO scores use prepared score fields");
  assert(knockout.includes("awayScore={match.awayScore}"), "KO away score prepared");
  assert(knockout.includes("match.winnerLabel"), "KO winnerLabel reused");
  assert(!knockout.includes("resolveKnockoutOutcome"), "KO presenter does not recalculate winners");
  assert(
    stage.includes("homeScore: match.homeScore") &&
      stage.includes("awayScore: match.awayScore") &&
      stage.includes("status: match.status"),
    "stage wires existing match score fields into KO DTO",
  );
  assert(
    liveKo.includes("homeScore: match.homeScore") &&
      liveKo.includes("awayScore: match.awayScore") &&
      liveKo.includes("status: match.status"),
    "LIVE KO builder mirrors prepared score fields",
  );
  assert(
    !liveCard.includes("MatchSidesScoreBlock") &&
      !liveCard.includes("TournamentPlacementsList"),
    "LiveMatchCard unchanged",
  );

  const outcome = resolveKnockoutOutcome({
    homeApplicationId: "h",
    awayApplicationId: "a",
    homeScore: 2,
    awayScore: 1,
    status: "completed",
    round: "final",
  });
  assert(outcome.winnerId === "h", "KO identity/outcome logic unchanged");

  // Finale hierarchy CSS-only
  assert(
    knockout.includes('round.id === "final"') &&
      knockout.includes("ring-brand-yellow") &&
      !knockout.includes("trophy") &&
      !knockout.includes("gradient"),
    "Finale hierarchy is CSS/presentation only",
  );

  // Single-match KO rounds span full round width on desktop (no half-empty grid)
  assert(
    knockout.includes("round.matches.length === 1") &&
      knockout.includes('"mt-2.5 grid grid-cols-1 gap-2"') &&
      knockout.includes("md:grid-cols-2"),
    "single-match KO round uses one-column layout; multi-match keeps md:grid-cols-2",
  );
  assert(
    !/ul className="mt-2\.5 grid grid-cols-1 gap-2 md:grid-cols-2"/.test(knockout),
    "single-match KO round does not retain always-on desktop half-width grid",
  );
  assert(
    knockout.includes("grid-cols-1") &&
      !knockout.includes("resolveKnockoutOutcome") &&
      !knockout.includes("winnerId"),
    "mobile remains single-column; no KO business logic introduced for layout",
  );

  // Placements
  assert(placements.includes("{row.place}."), "placement ranks retained");
  assert(placements.includes("<TeamNameWithLogo"), "placements keep TeamNameWithLogo");
  assert(placements.includes("row.place === 1"), "subtle top hierarchy for place 1");
  assert(
    !placements.includes("Champion") &&
      !placements.includes("Runner-up") &&
      !placements.includes(".sort("),
    "no invented labels or reorder",
  );
  assert(
    stage.includes("<TournamentPlacementsList") || stage.includes("PublicPlacements"),
    "overview placements still mounted",
  );
  const placed = computeKnockoutPlacements([
    {
      homeApplicationId: "f-home",
      awayApplicationId: "f-away",
      homeScore: 1,
      awayScore: 0,
      status: "completed",
      round: "final",
    },
    {
      homeApplicationId: "t-home",
      awayApplicationId: "t-away",
      homeScore: 2,
      awayScore: 1,
      status: "completed",
      round: "third-place",
    },
  ]);
  assert(
    placed.map((row) => row.place).join(",") === "1,2,3,4",
    "placement order unchanged",
  );

  assert(
    !knockoutLogic.includes("MatchSidesScoreBlock") &&
      !knockoutLogic.includes("TournamentPlacementsList"),
    "KO generation / propagation logic untouched",
  );

  return "ok";
}

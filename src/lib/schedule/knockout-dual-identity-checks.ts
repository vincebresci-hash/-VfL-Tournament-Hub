import {
  emptyScheduleParticipantRef,
  matchSideDbColumns,
  matchSideParticipantId,
  resolveScheduleParticipantRef,
  scheduleParticipantId,
  teamLabelsFromParticipants,
} from "@/lib/schedule/admin";
import {
  buildKnockoutPlan,
  computeKnockoutPlacements,
  hasDuplicateTeamInRound,
  knockoutSideRef,
  propagateKnockoutTeams,
  resolveKnockoutOutcome,
  type KnockoutMatchLike,
  type KnockoutSideRef,
} from "@/lib/schedule/knockout";
import type { TournamentParticipant } from "@/lib/tournament-participants";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`knockout-dual-identity-checks: ${message}`);
  }
}

function side(
  applicationId: string | null,
  externalTeamId: string | null = null,
): KnockoutSideRef {
  return knockoutSideRef(applicationId, externalTeamId);
}

function koMatch(
  partial: Partial<KnockoutMatchLike> & { id?: string },
): KnockoutMatchLike & { id: string } {
  return {
    id: partial.id ?? "match",
    homeApplicationId: null,
    awayApplicationId: null,
    homeExternalTeamId: null,
    awayExternalTeamId: null,
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

function withSides(
  match: KnockoutMatchLike & { id: string },
  home: KnockoutSideRef,
  away: KnockoutSideRef,
) {
  return {
    ...match,
    homeApplicationId: home.applicationId,
    homeExternalTeamId: home.externalTeamId,
    awayApplicationId: away.applicationId,
    awayExternalTeamId: away.externalTeamId,
  };
}

function complete(
  match: KnockoutMatchLike & { id: string },
  homeScore: number,
  awayScore: number,
  penalties?: { home: number; away: number },
) {
  return {
    ...match,
    homeScore,
    awayScore,
    status: "completed" as const,
    decidedBy: penalties ? ("penalties" as const) : ("regular" as const),
    homePenalties: penalties?.home ?? null,
    awayPenalties: penalties?.away ?? null,
  };
}

function assertTypedWinner(
  outcome: ReturnType<typeof resolveKnockoutOutcome>,
  expectedWinner: KnockoutSideRef,
  expectedLoser: KnockoutSideRef,
  label: string,
) {
  assert(outcome.error == null, `${label}: no error`);
  assert(outcome.winner != null && outcome.loser != null, `${label}: typed sides`);
  assert(
    outcome.winner.applicationId === expectedWinner.applicationId &&
      outcome.winner.externalTeamId === expectedWinner.externalTeamId,
    `${label}: winner typed identity`,
  );
  assert(
    outcome.loser.applicationId === expectedLoser.applicationId &&
      outcome.loser.externalTeamId === expectedLoser.externalTeamId,
    `${label}: loser typed identity`,
  );
  assert(
    outcome.winnerId === (expectedWinner.applicationId ?? expectedWinner.externalTeamId),
    `${label}: opaque winnerId`,
  );
  assert(
    outcome.loserId === (expectedLoser.applicationId ?? expectedLoser.externalTeamId),
    `${label}: opaque loserId`,
  );
}

function fourTeamBracket(sides: {
  sf1Home: KnockoutSideRef;
  sf1Away: KnockoutSideRef;
  sf2Home: KnockoutSideRef;
  sf2Away: KnockoutSideRef;
}) {
  return [
    withSides(
      koMatch({
        id: "sf1",
        round: "semifinal",
        nextMatchId: "final",
        nextMatchSlot: "home",
        loserNextMatchId: "third",
        loserNextMatchSlot: "home",
      }),
      sides.sf1Home,
      sides.sf1Away,
    ),
    withSides(
      koMatch({
        id: "sf2",
        round: "semifinal",
        nextMatchId: "final",
        nextMatchSlot: "away",
        loserNextMatchId: "third",
        loserNextMatchSlot: "away",
      }),
      sides.sf2Home,
      sides.sf2Away,
    ),
    koMatch({ id: "final", round: "final" }),
    koMatch({ id: "third", round: "third-place" }),
  ];
}

/**
 * Focused dual-identity KO lifecycle checks (application + external teams).
 */
export function runKnockoutDualIdentityChecks() {
  const appA = side("app-a");
  const appB = side("app-b");
  const appC = side("app-c");
  const appD = side("app-d");
  const extA = side(null, "ext-a");
  const extB = side(null, "ext-b");
  const extC = side(null, "ext-c");
  const extD = side(null, "ext-d");

  // --- Outcome matrix: all four identity combinations ---
  const pairs: Array<{
    label: string;
    home: KnockoutSideRef;
    away: KnockoutSideRef;
  }> = [
    { label: "APPLICATION/APPLICATION", home: appA, away: appB },
    { label: "EXTERNAL/EXTERNAL", home: extA, away: extB },
    { label: "APPLICATION/EXTERNAL", home: appA, away: extB },
    { label: "EXTERNAL/APPLICATION", home: extA, away: appB },
  ];

  for (const pair of pairs) {
    const base = withSides(koMatch({ id: "m", round: "semifinal" }), pair.home, pair.away);
    assertTypedWinner(
      resolveKnockoutOutcome(complete(base, 2, 1)),
      pair.home,
      pair.away,
      `${pair.label} regular win`,
    );
    assertTypedWinner(
      resolveKnockoutOutcome(complete(base, 0, 3)),
      pair.away,
      pair.home,
      `${pair.label} regular loss`,
    );

    const draw = resolveKnockoutOutcome(complete(base, 1, 1));
    assert(draw.error && !draw.winnerId, `${pair.label} draw without penalties errors`);

    const zeroZero = resolveKnockoutOutcome(complete(base, 0, 0));
    assert(
      zeroZero.error && zeroZero.winnerId == null,
      `${pair.label} completed 0:0 still requires penalties`,
    );

    assertTypedWinner(
      resolveKnockoutOutcome(complete(base, 1, 1, { home: 5, away: 4 })),
      pair.home,
      pair.away,
      `${pair.label} penalty winner`,
    );
  }

  // Explicit external / application penalty winners
  assertTypedWinner(
    resolveKnockoutOutcome(
      complete(withSides(koMatch({ round: "final" }), extA, extB), 0, 0, {
        home: 4,
        away: 3,
      }),
    ),
    extA,
    extB,
    "external penalty winner",
  );
  assertTypedWinner(
    resolveKnockoutOutcome(
      complete(withSides(koMatch({ round: "final" }), appA, appB), 0, 0, {
        home: 4,
        away: 3,
      }),
    ),
    appA,
    appB,
    "application penalty winner",
  );

  // Unset sides remain unresolved (not scoreable winners)
  const unresolved = resolveKnockoutOutcome(
    complete(koMatch({ round: "final", homeScore: 1, awayScore: 0, status: "completed" }), 1, 0),
  );
  assert(!unresolved.winnerId && unresolved.error, "unresolved sides cannot yield a winner");

  // --- Duplicate checks understand both identity columns ---
  assert(
    hasDuplicateTeamInRound([
      withSides(koMatch({ round: "semifinal" }), extA, extB),
      withSides(koMatch({ round: "semifinal" }), extA, extC),
    ]),
    "duplicate external in same round detected",
  );
  assert(
    hasDuplicateTeamInRound([
      withSides(koMatch({ round: "semifinal" }), appA, appB),
      withSides(koMatch({ round: "semifinal" }), appA, appC),
    ]),
    "duplicate application in same round detected",
  );
  assert(
    !hasDuplicateTeamInRound([
      withSides(koMatch({ round: "semifinal" }), appA, extB),
      withSides(koMatch({ round: "semifinal" }), appC, extD),
    ]),
    "distinct mixed sides are allowed",
  );
  assert(
    !hasDuplicateTeamInRound([
      withSides(koMatch({ round: "semifinal" }), extA, extB),
      withSides(koMatch({ round: "final" }), extA, extB),
    ]),
    "same team across different rounds is allowed",
  );

  // --- Generation column mapping at persistence boundary ---
  const participantRefById: Record<string, KnockoutSideRef> = {
    "app-a": appA,
    "app-b": appB,
    "ext-a": extA,
    "ext-b": extB,
  };

  function mapSeed(id: string | null): KnockoutSideRef {
    if (!id) {
      return emptyScheduleParticipantRef();
    }
    return participantRefById[id] ?? emptyScheduleParticipantRef();
  }

  const appHomeCols = matchSideDbColumns("home", mapSeed("app-a"));
  assert(
    appHomeCols.home_application_id === "app-a" && appHomeCols.home_external_team_id === null,
    "generation application → application column",
  );
  const extAwayCols = matchSideDbColumns("away", mapSeed("ext-b"));
  assert(
    extAwayCols.away_application_id === null && extAwayCols.away_external_team_id === "ext-b",
    "generation external → external column",
  );
  const mixedHome = matchSideDbColumns("home", mapSeed("ext-a"));
  const mixedAway = matchSideDbColumns("away", mapSeed("app-b"));
  assert(
    mixedHome.home_application_id === null &&
      mixedHome.home_external_team_id === "ext-a" &&
      mixedAway.away_application_id === "app-b" &&
      mixedAway.away_external_team_id === null,
    "mixed qualifiers map per side",
  );
  const unresolvedHome = matchSideDbColumns("home", mapSeed(null));
  const unresolvedAway = matchSideDbColumns("away", mapSeed(null));
  assert(
    unresolvedHome.home_application_id === null &&
      unresolvedHome.home_external_team_id === null &&
      unresolvedAway.away_application_id === null &&
      unresolvedAway.away_external_team_id === null,
    "unresolved final/third-place → all identity columns null",
  );

  const plan = buildKnockoutPlan(
    {
      format: 4,
      includeThirdPlace: true,
      includePlacement5: false,
      includePlacement7: false,
    },
    [
      { applicationId: "ext-a", groupIndex: 0, rank: 1, seedLabel: "A1" },
      { applicationId: "app-b", groupIndex: 0, rank: 2, seedLabel: "A2" },
      { applicationId: "app-c", groupIndex: 1, rank: 1, seedLabel: "B1" },
      { applicationId: "ext-d", groupIndex: 1, rank: 2, seedLabel: "B2" },
    ],
  );
  assert(!plan.error, "mixed opaque seeds still build plan");
  assert(plan.matches.find((m) => m.key === "sf1")?.homeId === "ext-a", "seeding HF1 home A1 frozen");
  assert(plan.matches.find((m) => m.key === "sf1")?.awayId === "ext-d", "seeding HF1 away B2 frozen");
  assert(plan.matches.find((m) => m.key === "final")?.homeId == null, "final initially unresolved");
  assert(plan.matches.find((m) => m.key === "third")?.homeId == null, "third-place initially unresolved");

  // --- Propagation: winner/loser typed identity + stale opposite clearing ---
  let live = fourTeamBracket({
    sf1Home: extA,
    sf1Away: appB,
    sf2Home: appC,
    sf2Away: extD,
  });
  assert(live.find((m) => m.id === "final")?.homeApplicationId == null, "final starts unresolved app");
  assert(
    (live.find((m) => m.id === "final")?.homeExternalTeamId ?? null) == null,
    "final starts unresolved ext",
  );
  assert(live.find((m) => m.id === "third")?.awayApplicationId == null, "third starts unresolved");

  live = propagateKnockoutTeams(
    live.map((match) =>
      match.id === "sf1" ? complete(match, 2, 1) : match,
    ),
  );
  const finalAfterSf1 = live.find((m) => m.id === "final")!;
  const thirdAfterSf1 = live.find((m) => m.id === "third")!;
  assert(
    finalAfterSf1.homeApplicationId === null && finalAfterSf1.homeExternalTeamId === "ext-a",
    "external winner → final home external column",
  );
  assert(
    thirdAfterSf1.homeApplicationId === "app-b" && thirdAfterSf1.homeExternalTeamId === null,
    "application loser → third-place home application column",
  );

  live = propagateKnockoutTeams(
    live.map((match) =>
      match.id === "sf2" ? complete(match, 0, 1) : match,
    ),
  );
  const finalFull = live.find((m) => m.id === "final")!;
  const thirdFull = live.find((m) => m.id === "third")!;
  assert(
    finalFull.awayApplicationId === null && finalFull.awayExternalTeamId === "ext-d",
    "external winner from HF2 → final away external",
  );
  assert(
    thirdFull.awayApplicationId === "app-c" && thirdFull.awayExternalTeamId === null,
    "application loser from HF2 → third-place away application",
  );

  // Application winners / losers path
  live = fourTeamBracket({
    sf1Home: appA,
    sf1Away: appB,
    sf2Home: appC,
    sf2Away: appD,
  });
  live = propagateKnockoutTeams(
    live.map((match) => (match.id === "sf1" ? complete(match, 3, 0) : match)),
  );
  assert(
    live.find((m) => m.id === "final")?.homeApplicationId === "app-a" &&
      (live.find((m) => m.id === "final")?.homeExternalTeamId ?? null) === null,
    "application winner → final application column",
  );
  assert(
    live.find((m) => m.id === "third")?.homeApplicationId === "app-b" &&
      (live.find((m) => m.id === "third")?.homeExternalTeamId ?? null) === null,
    "application loser → third-place application column",
  );

  // Stale opposite identity clearing on slot replacement
  const staleTarget = withSides(
    koMatch({
      id: "final",
      round: "final",
      homeApplicationId: "stale-app",
      homeExternalTeamId: null,
    }),
    side("stale-app"),
    emptyScheduleParticipantRef(),
  );
  // Force a stale dual-write scenario then replace with external winner
  staleTarget.homeApplicationId = "stale-app";
  staleTarget.homeExternalTeamId = "stale-ext";
  const source = complete(
    withSides(
      koMatch({
        id: "sf1",
        round: "semifinal",
        nextMatchId: "final",
        nextMatchSlot: "home",
      }),
      extA,
      appB,
    ),
    1,
    0,
  );
  const cleared = propagateKnockoutTeams([source, staleTarget]);
  const clearedFinal = cleared.find((m) => m.id === "final")!;
  assert(
    clearedFinal.homeApplicationId === null && clearedFinal.homeExternalTeamId === "ext-a",
    "slot replacement clears stale opposite identity column",
  );

  // --- Placements with mixed identities ---
  const placed = computeKnockoutPlacements([
    complete(withSides(koMatch({ round: "final" }), extA, appB), 2, 1),
    complete(withSides(koMatch({ round: "third-place" }), appC, extD), 1, 0),
  ]);
  assert(
    placed.map((row) => `${row.place}:${row.applicationId}`).join(",") ===
      "1:ext-a,2:app-b,3:app-c,4:ext-d",
    "placements preserve order for mixed identities",
  );

  // --- Completion eligibility: opaque winnerId for both champion types ---
  const appChampion = resolveKnockoutOutcome(
    complete(withSides(koMatch({ round: "final" }), appA, appB), 1, 0),
  );
  const extChampion = resolveKnockoutOutcome(
    complete(withSides(koMatch({ round: "final" }), extA, extB), 1, 0),
  );
  assert(Boolean(appChampion.winnerId), "application champion is a resolved winner");
  assert(Boolean(extChampion.winnerId), "external champion is a resolved winner");
  assert(
    appChampion.winner?.applicationId === "app-a" &&
      appChampion.winner?.externalTeamId === null,
    "application champion typed",
  );
  assert(
    extChampion.winner?.applicationId === null &&
      extChampion.winner?.externalTeamId === "ext-a",
    "external champion typed",
  );

  // --- Admin identity helpers: labels + manual assignment mapping ---
  const participants = [
    {
      applicationId: "app-a",
      externalTeamId: null,
      displayName: "App A",
      clubName: "Club A",
      teamName: "A",
    },
    {
      applicationId: null,
      externalTeamId: "ext-a",
      displayName: "Ext A",
      clubName: "Club Ext",
      teamName: "X",
    },
  ] as unknown as TournamentParticipant[];

  const labels = teamLabelsFromParticipants(participants);
  assert(labels["app-a"], "admin application label present");
  assert(labels["ext-a"], "admin external label present");
  assert(scheduleParticipantId(participants[0]) === "app-a", "schedule id application");
  assert(scheduleParticipantId(participants[1]) === "ext-a", "schedule id external");

  const appRef = resolveScheduleParticipantRef("app-a", participants);
  const extRef = resolveScheduleParticipantRef("ext-a", participants);
  assert(
    appRef?.applicationId === "app-a" && appRef.externalTeamId === null,
    "manual assign application → application",
  );
  assert(
    extRef?.applicationId === null && extRef?.externalTeamId === "ext-a",
    "manual assign external → external",
  );

  const appThenExt = matchSideDbColumns("home", extRef!);
  assert(
    appThenExt.home_application_id === null && appThenExt.home_external_team_id === "ext-a",
    "application → external clears opposite",
  );
  const extThenApp = matchSideDbColumns("away", appRef!);
  assert(
    extThenApp.away_application_id === "app-a" && extThenApp.away_external_team_id === null,
    "external → application clears opposite",
  );
  const emptyCols = matchSideDbColumns("home", emptyScheduleParticipantRef());
  assert(
    emptyCols.home_application_id === null && emptyCols.home_external_team_id === null,
    "participant → empty clears both",
  );

  const matchRecord = {
    homeApplicationId: null as string | null,
    awayApplicationId: "app-b" as string | null,
    homeExternalTeamId: "ext-a" as string | null,
    awayExternalTeamId: null as string | null,
  };
  assert(
    matchSideParticipantId(matchRecord, "home") === "ext-a",
    "admin card reads external home id",
  );
  assert(
    matchSideParticipantId(matchRecord, "away") === "app-b",
    "admin card reads application away id",
  );
  assert(
    matchSideParticipantId(
      {
        homeApplicationId: null,
        awayApplicationId: null,
        homeExternalTeamId: null,
        awayExternalTeamId: null,
      },
      "home",
    ) == null,
    "unresolved admin side stays empty for steht noch nicht fest",
  );

  // --- Application-only regression: external columns stay null ---
  const appOnly = propagateKnockoutTeams([
    complete(
      withSides(
        koMatch({
          id: "sf1",
          round: "semifinal",
          nextMatchId: "final",
          nextMatchSlot: "home",
          loserNextMatchId: "third",
          loserNextMatchSlot: "home",
        }),
        appA,
        appB,
      ),
      2,
      0,
    ),
    koMatch({ id: "final", round: "final" }),
    koMatch({ id: "third", round: "third-place" }),
  ]);
  const appFinal = appOnly.find((m) => m.id === "final")!;
  const appThird = appOnly.find((m) => m.id === "third")!;
  assert(
    appFinal.homeApplicationId === "app-a" &&
      (appFinal.homeExternalTeamId ?? null) === null &&
      appThird.homeApplicationId === "app-b" &&
      (appThird.homeExternalTeamId ?? null) === null,
    "application-only writes never populate external columns",
  );

  const appOnlyCols = matchSideDbColumns("home", side("app-only"));
  assert(
    appOnlyCols.home_application_id === "app-only" &&
      appOnlyCols.home_external_team_id === null,
    "application-only persist helper keeps external null",
  );

  return "ok";
}

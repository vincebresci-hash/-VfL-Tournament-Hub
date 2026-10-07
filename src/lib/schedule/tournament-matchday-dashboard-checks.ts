import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { selectNextMatches } from "@/lib/live/match-center";
import { canMutateGroupResults } from "@/lib/schedule/group-result-lock";
import { isGroupStageComplete } from "@/lib/schedule/knockout";
import { resolveEffectiveTournamentLifecycle } from "@/lib/schedule/tournament-lifecycle";
import {
  buildTournamentMatchdayDashboardModel,
  type BuildTournamentMatchdayDashboardModelInput,
} from "@/lib/schedule/tournament-matchday-dashboard";
import type { TournamentMatchRecord } from "@/types/schedule";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`tournament-matchday-dashboard-checks: ${message}`);
  }
}

function match(
  partial: Partial<TournamentMatchRecord> &
    Pick<TournamentMatchRecord, "id" | "status">,
): TournamentMatchRecord {
  return {
    tournamentId: "t1",
    groupId: "g1",
    fieldId: "f1",
    homeApplicationId: "a",
    awayApplicationId: "b",
    homeExternalTeamId: null,
    awayExternalTeamId: null,
    homeScore: null,
    awayScore: null,
    scheduledAt: null,
    durationMinutes: 12,
    phase: "group",
    sortOrder: 0,
    round: null,
    nextMatchId: null,
    nextMatchSlot: null,
    loserNextMatchId: null,
    loserNextMatchSlot: null,
    decidedBy: "regular",
    homePenalties: null,
    awayPenalties: null,
    externalSource: null,
    externalId: null,
    manualOverride: false,
    ...partial,
  };
}

const allPerms = {
  canScheduleManage: true,
  canResultsManage: true,
  canTournamentsManage: true,
};

function build(
  overrides: Partial<BuildTournamentMatchdayDashboardModelInput> &
    Pick<BuildTournamentMatchdayDashboardModelInput, "effective" | "matches">,
) {
  return buildTournamentMatchdayDashboardModel({
    tournamentId: "tid",
    groups: overrides.groups ?? [{ id: "g1" }],
    memberIdsByGroupId: overrides.memberIdsByGroupId ?? {
      g1: ["a", "b", "c"],
    },
    permissions: overrides.permissions ?? allPerms,
    ...overrides,
  });
}

/**
 * Pure + structural checks for C6-H D4 Matchday Dashboard.
 * Not authenticated E2E / DB integration.
 */
export function runTournamentMatchdayDashboardChecks() {
  // 1) setup → groups missing
  const setup = build({
    effective: "setup",
    groups: [],
    memberIdsByGroupId: {},
    matches: [],
  });
  assert(setup.attention.kind === "setup_groups_missing", "1 setup attention");
  assert(setup.attention.title === "Gruppen fehlen", "1 setup copy");
  assert(setup.attention.href === "/admin/turniere/tid/gruppen", "1 setup href");

  // 2) group_stage + no group schedule → schedule missing
  const noSchedule = build({
    effective: "group_stage",
    matches: [],
  });
  assert(
    noSchedule.attention.kind === "group_schedule_missing",
    "2 schedule missing kind",
  );
  assert(noSchedule.attention.title === "Spielplan fehlt", "2 schedule missing copy");
  assert(
    noSchedule.attention.href === "/admin/turniere/tid/spielplan",
    "2 schedule missing href",
  );

  // 3) group_stage + pending group matches → results pending
  const pending = build({
    effective: "group_stage",
    matches: [
      match({
        id: "m1",
        status: "scheduled",
        homeApplicationId: "a",
        awayApplicationId: "b",
        sortOrder: 0,
      }),
      match({
        id: "m2",
        status: "scheduled",
        homeApplicationId: "a",
        awayApplicationId: "c",
        sortOrder: 1,
      }),
      match({
        id: "m3",
        status: "live",
        homeApplicationId: "b",
        awayApplicationId: "c",
        homeScore: 1,
        awayScore: null,
        sortOrder: 2,
      }),
    ],
  });
  assert(
    pending.attention.kind === "group_results_pending",
    "3 results pending kind",
  );
  assert(
    pending.attention.title === "Gruppenergebnisse offen",
    "3 results pending copy",
  );
  assert(
    pending.progress.groupProgress.complete === false,
    "3 not complete via isGroupStageComplete",
  );

  // 4) group_stage + authoritative completeness + no KO → qualification ready
  const completeGroupMatches = [
    match({
      id: "c1",
      status: "completed",
      homeApplicationId: "a",
      awayApplicationId: "b",
      homeScore: 1,
      awayScore: 0,
      sortOrder: 0,
    }),
    match({
      id: "c2",
      status: "completed",
      homeApplicationId: "a",
      awayApplicationId: "c",
      homeScore: 2,
      awayScore: 2,
      sortOrder: 1,
    }),
    match({
      id: "c3",
      status: "completed",
      homeApplicationId: "b",
      awayApplicationId: "c",
      homeScore: 0,
      awayScore: 0,
      sortOrder: 2,
    }),
  ];
  const authoritative = isGroupStageComplete(
    [{ id: "g1" }],
    { g1: ["a", "b", "c"] },
    completeGroupMatches,
  );
  assert(authoritative.complete === true, "4 fixture complete via helper");
  const ready = build({
    effective: "group_stage",
    matches: completeGroupMatches,
  });
  assert(ready.attention.kind === "qualification_ready", "4 qualification ready kind");
  assert(ready.attention.title === "Qualifikation bereit", "4 qualification copy");
  assert(
    ready.progress.groupProgress.complete === true &&
      ready.progress.groupProgress.completed === authoritative.completed &&
      ready.progress.groupProgress.expected === authoritative.expected,
    "4 group progress mirrors isGroupStageComplete",
  );
  assert(
    ready.progress.groupProgressLabel ===
      `${authoritative.completed} von ${authoritative.expected} Gruppenspielen abgeschlossen`,
    "4 group progress label",
  );

  // 5) knockout_stage + incomplete KO → KO in progress
  const koInProgress = build({
    effective: "knockout_stage",
    matches: [
      ...completeGroupMatches,
      match({
        id: "ko1",
        status: "scheduled",
        phase: "knockout",
        groupId: null,
        round: "final",
        homeApplicationId: "a",
        awayApplicationId: "b",
        sortOrder: 100,
      }),
    ],
  });
  assert(koInProgress.attention.kind === "ko_in_progress", "5 ko in progress kind");
  assert(koInProgress.attention.title === "K.-o.-Phase läuft", "5 ko in progress copy");
  assert(koInProgress.progress.completionEligible === false, "5 not completion eligible");

  // 6) knockout_stage + completion eligible → completion available
  const koComplete = build({
    effective: "knockout_stage",
    matches: [
      ...completeGroupMatches,
      match({
        id: "final1",
        status: "completed",
        phase: "knockout",
        groupId: null,
        round: "final",
        homeApplicationId: "a",
        awayApplicationId: "b",
        homeScore: 2,
        awayScore: 1,
        sortOrder: 100,
      }),
    ],
  });
  assert(
    koComplete.attention.kind === "completion_available",
    "6 completion available kind",
  );
  assert(
    koComplete.attention.title === "Turnier kann abgeschlossen werden",
    "6 completion available copy",
  );
  assert(koComplete.progress.completionEligible === true, "6 completionEligible true");

  // 7) completed → completed advisory
  const completedModel = build({
    effective: "completed",
    matches: [
      ...completeGroupMatches,
      match({
        id: "final1",
        status: "completed",
        phase: "knockout",
        groupId: null,
        round: "final",
        homeApplicationId: "a",
        awayApplicationId: "b",
        homeScore: 2,
        awayScore: 1,
        sortOrder: 100,
      }),
    ],
  });
  assert(completedModel.attention.kind === "completed", "7 completed kind");
  assert(
    completedModel.attention.title === "Turnier abgeschlossen",
    "7 completed copy",
  );
  assert(completedModel.attention.href === null, "7 completed no mutation href");

  // 8) any KO presence → locked via canMutateGroupResults
  assert(koInProgress.groupResultsLocked === true, "8 KO locks group results");
  assert(
    koInProgress.correctionWarning != null &&
      koInProgress.correctionWarning.includes("K.-o.-Phase"),
    "8 correction warning present",
  );
  assert(
    canMutateGroupResults([
      match({ id: "x", status: "scheduled", phase: "knockout", groupId: null }),
    ]).allowed === false,
    "8 C6-F helper locks on any KO presence",
  );

  // 9) cancelled KO still locks
  const cancelledKoMatches = [
    ...completeGroupMatches,
    match({
      id: "ko-c",
      status: "cancelled",
      phase: "knockout",
      groupId: null,
      round: "semifinal",
      homeApplicationId: "a",
      awayApplicationId: "b",
      sortOrder: 90,
    }),
  ];
  const cancelledKo = build({
    effective: "knockout_stage",
    matches: cancelledKoMatches,
  });
  assert(cancelledKo.groupResultsLocked === true, "9 cancelled KO locks");
  assert(
    canMutateGroupResults(cancelledKoMatches).allowed === false,
    "9 C6-F helper blocks cancelled KO",
  );

  // 10) cancelled match excluded from next (selector semantics)
  const withCancelled = [
    match({
      id: "sched",
      status: "scheduled",
      scheduledAt: "2026-06-01T10:00:00.000Z",
      sortOrder: 1,
    }),
    match({
      id: "canc",
      status: "cancelled",
      scheduledAt: "2026-06-01T09:00:00.000Z",
      sortOrder: 0,
    }),
  ];
  const nextList = selectNextMatches(withCancelled, null, 5);
  assert(
    nextList.every((row) => row.status !== "cancelled") &&
      nextList[0]?.id === "sched",
    "10 cancelled excluded from next selector",
  );
  const nextModel = build({
    effective: "group_stage",
    matches: withCancelled,
  });
  assert(
    nextModel.matchLists.next.every((row) => row.id !== "canc"),
    "10 dashboard next excludes cancelled",
  );

  // 11) 0-0 completed preserves group progress semantics
  assert(
    ready.progress.groupProgress.completed === 3 &&
      ready.progress.groupProgress.expected === 3,
    "11 0-0 completed counts in group progress",
  );

  // 12) partial/live score does not create false completed progress
  const partialOnly = build({
    effective: "group_stage",
    matches: [
      match({
        id: "p1",
        status: "live",
        homeScore: 1,
        awayScore: null,
        homeApplicationId: "a",
        awayApplicationId: "b",
      }),
    ],
  });
  assert(
    partialOnly.progress.groupProgress.completed === 0 &&
      partialOnly.progress.groupProgress.complete === false,
    "12 partial/live not completed progress",
  );

  // 13) stale persisted vs effective — dashboard consumes effective only
  const effectiveFromStale = resolveEffectiveTournamentLifecycle({
    intended: "knockout_stage",
    facts: {
      marketingStatusCompleted: false,
      groupsExist: true,
      groupScheduleExists: true,
      groupStageComplete: true,
      knockoutExists: false,
      completionEligible: false,
    },
  });
  assert(effectiveFromStale === "group_stage", "13 effective rewinds stale KO");
  const staleConsumed = build({
    effective: effectiveFromStale,
    matches: completeGroupMatches,
  });
  assert(
    staleConsumed.attention.kind === "qualification_ready" &&
      staleConsumed.effective === "group_stage",
    "13 dashboard uses effective, not persisted knockout",
  );

  // 14) permission-restricted quick-action presentation
  const restricted = build({
    effective: "group_stage",
    matches: completeGroupMatches,
    permissions: {
      canScheduleManage: false,
      canResultsManage: false,
      canTournamentsManage: false,
    },
  });
  assert(
    restricted.quickActions.every((action) => action.emphasized === false),
    "14 no emphasize without permissions",
  );
  assert(
    restricted.quickActions.some((action) => action.key === "edit") &&
      restricted.quickActions.length === 5,
    "14 navigation actions still present (view)",
  );
  const withResults = build({
    effective: "knockout_stage",
    matches: [
      ...completeGroupMatches,
      match({
        id: "kf",
        status: "scheduled",
        phase: "knockout",
        groupId: null,
        round: "final",
      }),
    ],
    permissions: {
      canScheduleManage: false,
      canResultsManage: true,
      canTournamentsManage: false,
    },
  });
  assert(
    withResults.quickActions.find((a) => a.key === "knockout")?.emphasized === true &&
      withResults.quickActions.find((a) => a.key === "results")?.emphasized === false,
    "14 results.manage emphasizes KO only",
  );

  // --- Structural freezes ---
  const model = read("src/lib/schedule/tournament-matchday-dashboard.ts");
  const ui = read("src/components/admin/TournamentMatchdayDashboard.tsx");
  const overviewPage = read("src/app/admin/turniere/[id]/page.tsx");
  const detailView = read("src/components/admin/AdminTournamentDetailView.tsx");
  const lifecycle = read("src/lib/schedule/tournament-lifecycle.ts");
  const standings = read("src/lib/schedule/standings.ts");
  const knockoutPreview = read("src/lib/schedule/knockout-preview.ts");
  const groupLock = read("src/lib/schedule/group-result-lock.ts");
  const planPreview = read("src/lib/schedule/plan-preview.ts");
  const livePage = read("src/components/live/LivePageView.tsx");
  const matchCenter = read("src/lib/live/match-center.ts");
  const runChecksCli = read("src/lib/schedule/run-checks-cli.ts");

  assert(
    model.includes("export function buildTournamentMatchdayDashboardModel") &&
      model.includes("isGroupStageComplete") &&
      model.includes("isTournamentCompletionEligible") &&
      model.includes("canMutateGroupResults") &&
      model.includes("selectNextMatches") &&
      model.includes("selectPrimaryMatchMoment") &&
      model.includes("selectRecentResults"),
    "model composes authoritative helpers + match-center selectors",
  );

  assert(
    !model.includes("function resolveEffectiveTournamentLifecycle") &&
      !model.includes("export function resolveEffectiveTournamentLifecycle"),
    "no second lifecycle algorithm in dashboard model",
  );
  assert(
    !model.includes("function computeGroupStandings") &&
      !model.includes("export function computeGroupStandings"),
    "no second standings algorithm",
  );
  assert(
    !model.includes("function qualifyTopTwo") &&
      !model.includes("function buildKnockoutQualificationPreview") &&
      !model.includes("buildKnockoutPlan"),
    "no second qualification algorithm",
  );
  assert(
    !model.includes("function resolveKnockoutOutcome") &&
      !model.includes("function isTournamentCompletionEligible"),
    "no second completion algorithm (imports only)",
  );
  assert(
    model.includes("isTournamentCompletionEligible") &&
      lifecycle.includes("export function isTournamentCompletionEligible"),
    "completion authority remains lifecycle helper",
  );
  assert(
    !model.includes("canRegenerateGroupSchedule") &&
      planPreview.includes("export function canRegenerateGroupSchedule"),
    "no C6-B duplication",
  );
  assert(
    !model.includes("function canMutateGroupResults") &&
      !model.includes("function hasKnockoutPhase") &&
      groupLock.includes("export function canMutateGroupResults"),
    "no C6-F duplication",
  );
  assert(
    knockoutPreview.includes("export function buildKnockoutQualificationPreview") &&
      standings.includes("export function computeGroupStandings"),
    "C6-G surfaces remain authoritative",
  );

  assert(
    ui.includes("Jetzt wichtig") &&
      ui.includes("Turnierfortschritt") &&
      ui.includes("Schnellzugriff") &&
      !ui.includes("completeTournamentAction") &&
      !ui.includes("reopenTournamentAction") &&
      !ui.includes("saveMatchResultAction"),
    "UI hierarchy + navigation-only (no mutations)",
  );
  assert(
    !ui.includes("TournamentLifecyclePanel") || ui.includes("// no second stepper"),
    "UI does not mount a second lifecycle stepper",
  );
  assert(!ui.includes("TournamentLifecyclePanel"), "no second lifecycle panel in D4 UI");

  assert(
    overviewPage.includes("buildTournamentMatchdayDashboardModel") &&
      overviewPage.includes("getAdminTournamentStage") &&
      overviewPage.includes("getAdminLifecyclePanelModel") &&
      detailView.includes("TournamentMatchdayDashboard"),
    "overview wires stage + lifecycle + dashboard",
  );

  assert(
    !livePage.includes("buildTournamentMatchdayDashboardModel") &&
      matchCenter.includes("export function selectNextMatches"),
    "no /live modification; selectors unchanged export",
  );

  assert(
    runChecksCli.includes("runTournamentMatchdayDashboardChecks") &&
      runChecksCli.includes("tournament-matchday-dashboard-checks"),
    "checks registered in run-checks-cli",
  );

  // No migration / RLS / RPC / service role in D4 product surfaces (not this checks file)
  for (const [name, source] of [
    ["model", model],
    ["ui", ui],
    ["overview", overviewPage],
    ["detail", detailView],
  ] as const) {
    assert(
      !source.includes("service_role") &&
        !source.includes("CREATE OR REPLACE FUNCTION") &&
        !source.includes("CREATE POLICY") &&
        !source.includes("alter table") &&
        !source.includes("ALTER TABLE"),
      `${name}: no migration/RLS/RPC/service-role`,
    );
  }

  const migrationsDir = join(process.cwd(), "supabase/migrations");
  if (existsSync(migrationsDir)) {
    const migrationNames = readdirSync(migrationsDir);
    assert(
      !migrationNames.some((name) => name.toLowerCase().includes("matchday")),
      "no matchday migration file",
    );
  }

  // Public route freeze: D4 overview stays under admin App Router path
  assert(
    overviewPage.includes("AdminTournamentDetailView") &&
      overviewPage.includes("getAdminLifecyclePanelModel") &&
      !overviewPage.includes("LivePageView") &&
      !overviewPage.includes('from "@/components/live'),
    "overview remains admin route (no live public import)",
  );

  // gruppen/spielplan/ergebnisse/ko-runde duplicate-read out of scope: unchanged loaders
  for (const page of [
    "src/app/admin/turniere/[id]/gruppen/page.tsx",
    "src/app/admin/turniere/[id]/spielplan/page.tsx",
    "src/app/admin/turniere/[id]/ergebnisse/page.tsx",
    "src/app/admin/turniere/[id]/ko-runde/page.tsx",
  ]) {
    const source = read(page);
    assert(
      source.includes("getAdminTournamentStage") &&
        source.includes("getAdminLifecyclePanelModel") &&
        !source.includes("buildTournamentMatchdayDashboardModel"),
      `${page} left without D4 mega-loader refactor`,
    );
  }

  return "ok";
}

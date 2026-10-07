import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TOURNAMENT_LIFECYCLE_DESCRIPTION_DE,
  TOURNAMENT_LIFECYCLE_KO_CORRECTION_HINT,
  TOURNAMENT_LIFECYCLE_LABEL_DE,
  TOURNAMENT_LIFECYCLE_STEPS,
  tournamentLifecycleLabelDe,
  tournamentLifecycleStepIndex,
} from "@/lib/schedule/tournament-lifecycle-labels";
import { resolveEffectiveTournamentLifecycle } from "@/lib/schedule/tournament-lifecycle";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`tournament-lifecycle-ux-checks: ${message}`);
  }
}

/**
 * Structural + pure checks for C6-H D3 admin lifecycle UX.
 * Not authenticated E2E / DB integration.
 */
export function runTournamentLifecycleUxChecks() {
  // A–D labels
  assert(tournamentLifecycleLabelDe("setup") === "Vorbereitung", "A setup label");
  assert(
    tournamentLifecycleLabelDe("group_stage") === "Gruppenphase",
    "B group_stage label",
  );
  assert(
    tournamentLifecycleLabelDe("knockout_stage") === "K.-o.-Phase",
    "C knockout_stage label",
  );
  assert(
    tournamentLifecycleLabelDe("completed") === "Abgeschlossen",
    "D completed label",
  );
  assert(
    TOURNAMENT_LIFECYCLE_STEPS.length === 4 &&
      TOURNAMENT_LIFECYCLE_LABEL_DE.setup &&
      TOURNAMENT_LIFECYCLE_DESCRIPTION_DE.setup,
    "four-step label/description maps present",
  );

  // E effective lifecycle drives display (stale persisted KO rewinds)
  assert(
    resolveEffectiveTournamentLifecycle({
      intended: "knockout_stage",
      facts: {
        marketingStatusCompleted: false,
        groupsExist: true,
        groupScheduleExists: true,
        groupStageComplete: true,
        knockoutExists: false,
        completionEligible: false,
      },
    }) === "group_stage",
    "E effective wins over stale persisted knockout",
  );
  assert(
    tournamentLifecycleStepIndex("group_stage") === 1,
    "step index for group_stage",
  );

  const labels = read("src/lib/schedule/tournament-lifecycle-labels.ts");
  const panel = read("src/components/admin/TournamentLifecyclePanel.tsx");
  const chrome = read("src/components/admin/TournamentAdminChrome.tsx");
  const adminHelper = read("src/lib/db/tournament-lifecycle-admin.ts");
  const form = read("src/components/admin/TournamentAdminForm.tsx");
  const knockoutBoard = read("src/components/admin/TournamentKnockoutBoard.tsx");
  const resultsBoard = read("src/components/admin/TournamentResultsBoard.tsx");
  const groupLock = read("src/lib/schedule/group-result-lock.ts");
  const groupLockUx = read("src/lib/schedule/group-result-lock-ux.ts");
  const knockoutPreview = read("src/lib/schedule/knockout-preview.ts");
  const planPreview = read("src/lib/schedule/plan-preview.ts");
  const runChecksCli = read("src/lib/schedule/run-checks-cli.ts");
  const overviewPage = read("src/app/admin/turniere/[id]/page.tsx");
  const groupsPage = read("src/app/admin/turniere/[id]/gruppen/page.tsx");
  const schedulePage = read("src/app/admin/turniere/[id]/spielplan/page.tsx");
  const resultsPage = read("src/app/admin/turniere/[id]/ergebnisse/page.tsx");
  const knockoutPage = read("src/app/admin/turniere/[id]/ko-runde/page.tsx");

  // F no generic lifecycle setter/dropdown
  assert(
    !panel.includes("setLifecycle") &&
      !panel.includes("lifecycle_state") &&
      !panel.includes("<select") &&
      !chrome.includes("setLifecycle") &&
      !adminHelper.includes("setTournamentLifecycle"),
    "F no generic lifecycle setter/dropdown",
  );

  // G panel does not implement completion algorithm
  assert(
    !panel.includes("resolveKnockoutOutcome") &&
      !panel.includes("isTournamentCompletionEligible") &&
      !panel.includes("finalReady") &&
      adminHelper.includes("includeCompletionEligible: true") &&
      adminHelper.includes("loadTournamentLifecycleSnapshot"),
    "G completion eligibility from server snapshot only",
  );
  assert(
    adminHelper.includes(
      "Das Finale hat einen Sieger. Das Turnier kann abgeschlossen werden.",
    ) &&
      !adminHelper.includes(
        "Das Turnier kann nach dem Finale abgeschlossen werden.",
      ),
    "eligible completion copy uses final-winner wording",
  );
  assert(
    !adminHelper.includes("persisted:") &&
      !adminHelper.includes("mismatch:") &&
      !panel.includes("model.persisted") &&
      !panel.includes("model.mismatch"),
    "client lifecycle panel model omits unused persisted/mismatch",
  );

  // H–K reopen wiring
  assert(
    panel.includes("reopenTournamentAction") &&
      panel.includes("Turnier wieder öffnen") &&
      panel.includes("model.canReopen") &&
      adminHelper.includes('effective === "completed"') &&
      adminHelper.includes("results.manage"),
    "H reopen UI gated by completed + results.manage",
  );
  assert(
    panel.includes("ConfirmModal") &&
      panel.includes("Turnier wieder öffnen?") &&
      panel.includes("Wieder öffnen"),
    "I reopen requires explicit confirmation modal",
  );
  assert(
    panel.includes("reopenTournamentAction(tournamentId, true)") &&
      !panel.includes("destination") &&
      !panel.includes("lifecycleState"),
    "J/K reopen calls action with confirm=true; no browser target",
  );

  // L application consequence copy
  assert(
    panel.includes("Bewerbungsstatus") &&
      panel.includes("Bewerbungsfenster") &&
      panel.includes("Kapazität") &&
      panel.includes("wieder möglich"),
    "L reopen copy states application consequence",
  );

  // M marketing distinction
  assert(
    form.includes("Öffentlicher Turnierstatus") &&
      form.includes("Matchday-Phase") &&
      form.includes("öffentliche Darstellung und Bewerbung"),
    "M marketing status label/helper distinguishes public status",
  );
  assert(
    chrome.includes("Öffentlicher Status") &&
      chrome.includes("TournamentLifecyclePanel") &&
      !chrome.includes("tournamentStageStatusLabel") &&
      panel.includes("Matchday-Phase"),
    "chrome separates public status from matchday; legacy stage badge removed",
  );

  // N KO correction hint
  assert(
    labels.includes(TOURNAMENT_LIFECYCLE_KO_CORRECTION_HINT) ||
      panel.includes("Gruppenergebnisse sind gesperrt"),
    "N KO correction hint present",
  );
  assert(
    adminHelper.includes("TOURNAMENT_LIFECYCLE_KO_CORRECTION_HINT") ||
      adminHelper.includes("correctionHint"),
    "correction hint supplied by server model",
  );

  // O C6-F board messages intact
  assert(
    resultsBoard.includes("GROUP_RESULT_LOCKED_MESSAGE") &&
      resultsBoard.includes("GROUP_RESULT_LOCK_CORRECTION_MESSAGE") &&
      groupLock.includes("Gruppenergebnisse sind gesperrt") &&
      groupLockUx.includes("lösche zuerst die K.-o.-Phase"),
    "O C6-F board messages remain intact",
  );

  // P C6-G unchanged presence
  assert(
    knockoutPreview.includes("export function buildKnockoutQualificationPreview") &&
      knockoutBoard.includes("buildKnockoutQualificationPreview"),
    "P C6-G qualification preview unchanged",
  );

  // Q C6-B unchanged presence
  assert(
    planPreview.includes("export function canRegenerateGroupSchedule"),
    "Q C6-B regeneration helper unchanged presence",
  );

  // Complete stays on KO board; no second complete button in panel
  assert(
    knockoutBoard.includes("Turnier abschließen") &&
      knockoutBoard.includes("completeTournamentAction") &&
      !panel.includes("completeTournamentAction") &&
      !panel.includes("Turnier abschließen"),
    "completion remains on KO board only",
  );

  // Page integration uses shared model
  for (const [name, source] of [
    ["overview", overviewPage],
    ["gruppen", groupsPage],
    ["spielplan", schedulePage],
    ["ergebnisse", resultsPage],
    ["ko-runde", knockoutPage],
  ] as const) {
    assert(
      source.includes("getAdminLifecyclePanelModel"),
      `${name} page loads shared lifecycle model`,
    );
  }

  // S mobile/responsive structure
  assert(
    panel.includes("grid-cols-2") &&
      panel.includes("sm:grid-cols-4") &&
      panel.includes("sr-only"),
    "S responsive stepper + accessible text labels",
  );

  // T no migration/schema/RPC/service-role/new-permission in D3 surfaces
  assert(
    !adminHelper.includes("service_role") &&
      !adminHelper.includes("CREATE OR REPLACE FUNCTION") &&
      !panel.includes("service_role") &&
      !chrome.includes("CREATE POLICY"),
    "T no RPC/service-role/RLS in D3 UX layer",
  );

  // Setup / group navigation only
  assert(
    panel.includes("Gruppen anlegen") &&
      panel.includes("Zur K.-o.-Runde") &&
      panel.includes("model.groupsHref") &&
      panel.includes("model.knockoutHref"),
    "setup/group navigation CTAs present",
  );

  // Refresh after reopen; no optimistic state
  assert(
    panel.includes("router.refresh()") &&
      !panel.includes("setEffective") &&
      !panel.includes("useOptimistic"),
    "stale handling: refresh, no optimistic lifecycle mutation",
  );

  // Runner once
  assert(
    runChecksCli.includes("runTournamentLifecycleUxChecks") &&
      runChecksCli.includes("tournament-lifecycle-ux-checks"),
    "UX checks registered in run-checks-cli",
  );

  // Public/live freeze: D3 files must not be public routes
  assert(
    !panel.includes("/live") || panel.includes("knockoutHref"),
    "panel is admin chrome, not public live redesign",
  );

  return "ok";
}

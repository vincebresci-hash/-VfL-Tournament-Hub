import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`knockout-preview-ux-checks: ${message}`);
  }
}

/**
 * Structural checks for C6-G D2 admin qualification / KO preview UX.
 * Not browser/E2E proof.
 */
export function runKnockoutPreviewUxChecks() {
  const board = read("src/components/admin/TournamentKnockoutBoard.tsx");
  const previewHelper = read("src/lib/schedule/knockout-preview.ts");
  const knockoutActions = read("src/lib/db/knockout-actions.ts");
  const runChecksCli = read("src/lib/schedule/run-checks-cli.ts");
  const lockHelper = read("src/lib/schedule/group-result-lock.ts");
  const lockUx = read("src/lib/schedule/group-result-lock-ux.ts");
  const resultsBoard = read("src/components/admin/TournamentResultsBoard.tsx");
  const scheduleBoard = read("src/components/admin/TournamentScheduleBoard.tsx");
  const scheduleActions = read("src/lib/db/schedule-actions.ts");

  assert(
    board.includes("buildKnockoutQualificationPreview") &&
      board.includes('from "@/lib/schedule/knockout-preview"') &&
      board.includes("qualificationPreview"),
    "TournamentKnockoutBoard imports/uses D1 buildKnockoutQualificationPreview",
  );

  assert(
    !board.includes(".slice(0, 2)") &&
      !board.includes('seedLabel === "A1"') &&
      !board.includes("defaultFirstRoundSeeds") &&
      !board.includes("computeGroupStandings("),
    "KnockoutBoard does not implement a second standings/qualification/pairing algorithm",
  );

  assert(
    board.includes("Qualifikationsvorschau") &&
      board.includes("Aktuelle Gruppentabellen") &&
      board.includes("PreviewStandingsTable"),
    "standings preview is rendered",
  );

  assert(
    board.includes("Qualifizierte Teams") &&
      board.includes("qualifier.seedLabel") &&
      board.includes("Rang {qualifier.rank}"),
    "qualifier seed/rank is rendered",
  );

  assert(
    board.includes("Erste K.-o.-Runde") &&
      board.includes("firstRoundMatches") &&
      board.includes("preview.firstRoundMatches"),
    "first-round preview uses firstRoundMatches",
  );

  assert(
    board.includes("Vorläufige Vorschau") &&
      board.includes("Die Gruppenphase ist noch nicht vollständig abgeschlossen. Platzierungen und") &&
      board.includes("!preview.progress.complete"),
    "incomplete preview warning exists",
  );

  assert(
    board.includes("Eine K.-o.-Phase ist bereits vorhanden") &&
      board.includes("K.-o.-Phase ersetzt") &&
      board.includes("knockoutExists"),
    "existing-KO replacement notice exists",
  );

  assert(
    board.includes("KO-Runde erzeugen") &&
      board.includes("generateKnockoutAction") &&
      board.includes("forceIncomplete") &&
      board.includes("Bestehende KO-Spiele werden ersetzt"),
    "generation CTA and force/replace workflow remain",
  );

  assert(
    !board.includes("applyKnockoutPreview") &&
      !board.includes("saveQualificationPreview") &&
      !board.includes("previewFingerprint"),
    "no preview mutation / apply / fingerprint action exists",
  );

  assert(
    previewHelper.includes("export function buildKnockoutQualificationPreview") &&
      knockoutActions.includes("buildKnockoutQualificationPreview") &&
      !knockoutActions.includes("applyKnockoutPreview"),
    "D1 shared helper remains the planning source; generate unchanged for D2 mutation surface",
  );

  assert(
    lockHelper.includes("GROUP_RESULT_LOCKED_BY_KNOCKOUT") &&
      lockUx.includes("GROUP_RESULT_LOCK_CORRECTION_MESSAGE") &&
      resultsBoard.includes("canMutateGroupResults") &&
      scheduleBoard.includes("canMutateGroupResults") &&
      scheduleActions.includes("tournamentHasKnockoutPhase"),
    "C6-F production modules remain present/unchanged in D2 scope",
  );

  assert(
    !board.includes("qualifyTopTwo(") && !board.includes("buildKnockoutPlan("),
    "board does not call qualifyTopTwo/buildKnockoutPlan directly",
  );

  assert(
    runChecksCli.includes("runKnockoutPreviewUxChecks") &&
      runChecksCli.includes("knockout-preview-ux-checks"),
    "knockout-preview-ux-checks wired into run-checks-cli",
  );

  return "ok";
}

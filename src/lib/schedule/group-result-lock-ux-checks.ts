import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GROUP_RESULT_LOCK_CORRECTION_MESSAGE } from "@/lib/schedule/group-result-lock-ux";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`group-result-lock-ux-checks: ${message}`);
  }
}

/**
 * Structural checks for C6-F D2 admin lock UX.
 * Not browser/E2E proof.
 */
export function runGroupResultLockUxChecks() {
  const results = read("src/components/admin/TournamentResultsBoard.tsx");
  const schedule = read("src/components/admin/TournamentScheduleBoard.tsx");
  const knockout = read("src/components/admin/TournamentKnockoutBoard.tsx");
  const lockHelper = read("src/lib/schedule/group-result-lock.ts");
  const lockUx = read("src/lib/schedule/group-result-lock-ux.ts");
  const scheduleActions = read("src/lib/db/schedule-actions.ts");
  const knockoutActions = read("src/lib/db/knockout-actions.ts");
  const runChecksCli = read("src/lib/schedule/run-checks-cli.ts");
  const resultsPage = read("src/app/admin/turniere/[id]/ergebnisse/page.tsx");
  const schedulePage = read("src/app/admin/turniere/[id]/spielplan/page.tsx");

  // UI lock source: loaded stage matches (includes KO), same D1 semantic.
  assert(
    results.includes("canMutateGroupResults") &&
      results.includes('from "@/lib/schedule/group-result-lock"') &&
      results.includes("groupResultsLocked") &&
      results.includes("matches"),
    "ResultsBoard derives lock via D1 canMutateGroupResults(matches)",
  );
  assert(
    schedule.includes("canMutateGroupResults") &&
      schedule.includes('from "@/lib/schedule/group-result-lock"') &&
      schedule.includes("groupResultsLocked"),
    "ScheduleBoard derives lock via D1 canMutateGroupResults(matches)",
  );
  assert(
    resultsPage.includes("matches={stage.matches}") &&
      schedulePage.includes("matches={stage.matches}"),
    "admin pages pass full stage.matches (including KO) without extra client fetch",
  );

  // ResultsBoard locked UX
  assert(
    results.includes("locked={groupResultsLocked}") &&
      results.includes("disabled={controlsDisabled}") &&
      results.includes('aria-label="Heimtore"') &&
      results.includes('aria-label="Gasttore"') &&
      results.includes("Ergebnis speichern"),
    "ResultsBoard disables score inputs/save when locked",
  );
  assert(
    results.includes("if (locked)") && results.includes("return"),
    "ResultsBoard submit short-circuits when locked",
  );
  assert(
    results.includes("StandingsTable") &&
      results.includes("Tabelle") &&
      results.includes("groupMatches"),
    "ResultsBoard keeps results/standings visible",
  );
  assert(
    results.includes("GROUP_RESULT_LOCKED_MESSAGE") &&
      results.includes('from "@/lib/schedule/group-result-lock"'),
    "ResultsBoard shows D1 lock explanation message constant",
  );
  assert(
    results.includes("GROUP_RESULT_LOCK_CORRECTION_MESSAGE") &&
      lockUx.includes(GROUP_RESULT_LOCK_CORRECTION_MESSAGE),
    "ResultsBoard shows correction explanation",
  );
  assert(
    results.includes('role="status"') && results.includes("aria-live"),
    "ResultsBoard lock banner is accessible without hover",
  );

  // ScheduleBoard locked UX
  assert(
    schedule.includes("locked={groupResultsLocked}") &&
      schedule.includes('aria-label="Status"') &&
      schedule.includes("disabled={controlsDisabled}") &&
      schedule.includes("Spiel speichern") &&
      schedule.includes("Löschen"),
    "ScheduleBoard disables group edit/status/save when locked",
  );
  assert(
    schedule.includes("onClick={() => {") &&
      schedule.includes("if (locked)") &&
      schedule.includes("onDelete()"),
    "ScheduleBoard group delete is gated when locked",
  );
  assert(
    schedule.includes("Spiel hinzufügen") && schedule.includes("locked={groupResultsLocked}"),
    "ScheduleBoard add-match path receives lock",
  );
  assert(
    schedule.includes("GROUP_RESULT_LOCKED_MESSAGE") &&
      schedule.includes("GROUP_RESULT_LOCK_CORRECTION_MESSAGE"),
    "ScheduleBoard shows lock + correction explanation",
  );

  // No-KO path remains: disabled only when pending || locked
  assert(
    results.includes("const controlsDisabled = pending || locked"),
    "ResultsBoard enables editing when not locked (pending||locked)",
  );
  assert(
    schedule.includes("const controlsDisabled = pending || locked") ||
      schedule.includes("pending || locked"),
    "ScheduleBoard enables group controls when not locked",
  );

  // KO delete remains available and not wrapped by group lock UI.
  assert(
    knockout.includes("deleteTournamentKnockoutAction") &&
      knockout.includes("KO-System löschen") &&
      !knockout.includes("canMutateGroupResults") &&
      !knockout.includes("groupResultsLocked") &&
      !knockout.includes("GROUP_RESULT_LOCKED"),
    "KnockoutBoard delete UI remains available and not disabled by group lock",
  );
  assert(
    knockoutActions.includes("export async function deleteTournamentKnockoutAction") &&
      !knockoutActions.includes("canMutateGroupResults"),
    "deleteTournamentKnockoutAction remains unchanged/available",
  );

  // Server error fallback: ResultsBoard still surfaces result.error (D1 message).
  assert(
    results.includes("result.error") &&
      results.includes("setError(result.error)") &&
      results.includes("saveMatchResultAction"),
    "ResultsBoard still surfaces D1/server lock errors for stale UI races",
  );
  assert(
    schedule.includes("result.error") && schedule.includes("setError(result.error)"),
    "ScheduleBoard still surfaces server errors via existing run() handler",
  );

  // D1 freeze: helper + server guards untouched by D2 UX module.
  assert(
    lockHelper.includes("GROUP_RESULT_LOCKED_BY_KNOCKOUT") &&
      lockHelper.includes('phase === "knockout"') &&
      scheduleActions.includes("tournamentHasKnockoutPhase") &&
      scheduleActions.includes("GROUP_RESULT_LOCKED_BY_KNOCKOUT"),
    "D1 lock helper and server guards remain present",
  );
  assert(
    !lockUx.includes("createClient") &&
      !lockUx.includes("supabase") &&
      lockUx.includes("GROUP_RESULT_LOCK_CORRECTION_MESSAGE"),
    "D2 UX copy module is presentation-only",
  );

  // Status must not appear as a lock unlock condition in UI.
  assert(
    !results.includes('status === "completed"') ||
      results.includes("canMutateGroupResults(matches)"),
    "ResultsBoard lock is phase-based via helper, not status-gated",
  );

  assert(
    runChecksCli.includes("runGroupResultLockUxChecks") &&
      runChecksCli.includes("group-result-lock-ux-checks"),
    "group-result-lock-ux-checks wired into run-checks-cli",
  );

  // No public/live/capacity/D1 semantic redesign in these boards.
  assert(
    !results.includes("qualifyTopTwo") && !schedule.includes("forceIncomplete"),
    "D2 boards do not add qualification/forceIncomplete UX",
  );

  return "ok";
}

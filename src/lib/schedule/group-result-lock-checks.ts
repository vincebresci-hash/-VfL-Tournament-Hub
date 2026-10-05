import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GROUP_RESULT_LOCKED_BY_KNOCKOUT,
  GROUP_RESULT_LOCKED_MESSAGE,
  canMutateGroupResults,
  hasKnockoutPhase,
} from "@/lib/schedule/group-result-lock";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`group-result-lock-checks: ${message}`);
  }
}

function sliceFn(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  assert(start >= 0, `missing start marker ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(end > start, `missing end marker ${endMarker} after ${startMarker}`);
  return source.slice(start, end);
}

function firstTokenIndex(source: string, tokens: string[]) {
  const indexes = tokens
    .map((token) => source.indexOf(token))
    .filter((idx) => idx >= 0);
  assert(indexes.length > 0, `missing tokens ${tokens.join("|")}`);
  return Math.min(...indexes);
}

function assertBlocked(matches: Array<{ phase?: string | null; status?: string }>, label: string) {
  assert(hasKnockoutPhase(matches), `${label}: hasKnockoutPhase true`);
  const policy = canMutateGroupResults(matches);
  assert(!policy.allowed, `${label}: not allowed`);
  assert(policy.reason === "knockout_exists", `${label}: reason knockout_exists`);
  assert(policy.code === GROUP_RESULT_LOCKED_BY_KNOCKOUT, `${label}: code`);
  assert(policy.message === GROUP_RESULT_LOCKED_MESSAGE, `${label}: message`);
}

function assertAllowed(matches: Array<{ phase?: string | null; status?: string }>, label: string) {
  assert(!hasKnockoutPhase(matches), `${label}: hasKnockoutPhase false`);
  const policy = canMutateGroupResults(matches);
  assert(policy.allowed, `${label}: allowed`);
  assert(policy.reason === null, `${label}: reason null`);
  assert(policy.code === null, `${label}: code null`);
  assert(policy.message === null, `${label}: message null`);
}

/**
 * Pure + structural checks for C6-F D1 post-KO group-result freeze.
 * Does not hit Supabase / Production.
 */
export function runGroupResultLockChecks() {
  // --- Pure lock policy ---
  assertAllowed([], "no matches");
  assertAllowed(
    [
      { phase: "group", status: "scheduled" },
      { phase: "group", status: "completed" },
    ],
    "group matches only",
  );
  assertAllowed([{ phase: null, status: "scheduled" }], "null phase treated as non-knockout");

  assertBlocked([{ phase: "knockout", status: "scheduled" }], "scheduled KO");
  assertBlocked([{ phase: "knockout", status: "live" }], "live KO");
  assertBlocked([{ phase: "knockout", status: "completed" }], "completed KO");
  assertBlocked([{ phase: "knockout", status: "cancelled" }], "cancelled KO");
  assertBlocked(
    [{ phase: "knockout", status: "scheduled" }],
    "placeholder/unresolved KO",
  );
  assertBlocked(
    [
      { phase: "group", status: "completed" },
      { phase: "knockout", status: "scheduled" },
    ],
    "mixed group + KO",
  );

  // Status must not unlock once KO phase exists.
  for (const status of ["scheduled", "live", "completed", "cancelled"] as const) {
    assertBlocked([{ phase: "knockout", status }], `status=${status} still locks`);
  }

  // --- Structural server guards ---
  const scheduleActions = read("src/lib/db/schedule-actions.ts");
  const knockoutActions = read("src/lib/db/knockout-actions.ts");
  const lockHelper = read("src/lib/schedule/group-result-lock.ts");
  const runChecksCli = read("src/lib/schedule/run-checks-cli.ts");

  assert(
    lockHelper.includes('phase === "knockout"') &&
      lockHelper.includes("GROUP_RESULT_LOCKED_BY_KNOCKOUT") &&
      lockHelper.includes(GROUP_RESULT_LOCKED_MESSAGE) &&
      !lockHelper.includes("createClient") &&
      !lockHelper.includes("supabase") &&
      !lockHelper.includes("useState") &&
      !lockHelper.includes('from "@/lib/schedule/plan-preview"') &&
      !lockHelper.includes("canRegenerateGroupSchedule("),
    "lock helper is pure and uses KO_STARTED phase semantics (not full C6-B regen policy)",
  );

  assert(
    scheduleActions.includes('from "@/lib/schedule/group-result-lock"') &&
      scheduleActions.includes("canMutateGroupResults") &&
      scheduleActions.includes("GROUP_RESULT_LOCKED_BY_KNOCKOUT") &&
      scheduleActions.includes("tournamentHasKnockoutPhase"),
    "schedule-actions imports shared group-result lock helper + authoritative KO read",
  );

  const saveResultFnBody = scheduleActions.slice(
    scheduleActions.indexOf("export async function saveMatchResultAction"),
  );
  assert(saveResultFnBody.startsWith("export async function saveMatchResultAction"), "saveMatchResultAction present");
  assert(
    saveResultFnBody.includes("tournamentHasKnockoutPhase") &&
      saveResultFnBody.includes("canMutateGroupResults"),
    "saveMatchResultAction invokes authoritative KO lock",
  );
  assert(
    saveResultFnBody.includes("GROUP_RESULT_LOCKED_BY_KNOCKOUT") ||
      saveResultFnBody.includes("groupResultLockedFailure"),
    "saveMatchResultAction returns lock failure contract",
  );
  assert(
    firstTokenIndex(saveResultFnBody, [".update({"]) >
      firstTokenIndex(saveResultFnBody, ["tournamentHasKnockoutPhase", "canMutateGroupResults"]),
    "saveMatchResultAction runs KO lock before first UPDATE",
  );
  assert(
    saveResultFnBody.includes('.eq("phase", "group")'),
    "saveMatchResultAction retains phase=group write filter",
  );

  const saveMatchFn = sliceFn(
    scheduleActions,
    "export async function saveTournamentMatchAction",
    "export async function deleteTournamentMatchAction",
  );
  assert(
    saveMatchFn.includes("tournamentHasKnockoutPhase") &&
      saveMatchFn.includes("canMutateGroupResults"),
    "saveTournamentMatchAction invokes KO lock for group mutations",
  );
  assert(
    saveMatchFn.includes('.select("id, phase")') || saveMatchFn.includes(".select(\"id, phase\")"),
    "saveTournamentMatchAction loads authoritative existing phase when matchId present",
  );
  assert(
    saveMatchFn.includes('phase === "knockout"'),
    "saveTournamentMatchAction refuses rewriting knockout rows as group matches",
  );
  assert(
    firstTokenIndex(saveMatchFn, [".update(", ".insert("]) >
      firstTokenIndex(saveMatchFn, ["tournamentHasKnockoutPhase", "canMutateGroupResults"]),
    "saveTournamentMatchAction lock before mutation",
  );
  assert(
    saveMatchFn.includes('phase: "group" as const'),
    "saveTournamentMatchAction remains group-phase writer",
  );

  const deleteMatchFn = sliceFn(
    scheduleActions,
    "export async function deleteTournamentMatchAction",
    "export async function deleteTournamentScheduleAction",
  );
  assert(
    deleteMatchFn.includes('.select("id, phase")') || deleteMatchFn.includes(".select(\"id, phase\")"),
    "deleteTournamentMatchAction loads authoritative target phase",
  );
  assert(
    deleteMatchFn.includes("tournamentHasKnockoutPhase") &&
      deleteMatchFn.includes("canMutateGroupResults"),
    "deleteTournamentMatchAction invokes KO lock for group deletes",
  );
  assert(
    deleteMatchFn.includes('phase !== "knockout"'),
    "deleteTournamentMatchAction distinguishes group vs knockout target",
  );
  assert(
    firstTokenIndex(deleteMatchFn, [".delete()"]) >
      firstTokenIndex(deleteMatchFn, ["tournamentHasKnockoutPhase", "canMutateGroupResults"]),
    "group delete path locks before DELETE",
  );

  const deleteKoFn = sliceFn(
    knockoutActions,
    "export async function deleteTournamentKnockoutAction",
    "export async function completeTournamentAction",
  );
  assert(
    deleteKoFn.includes("requireResultsManage()") &&
      deleteKoFn.includes('.eq("phase", "knockout")') &&
      !deleteKoFn.includes("canMutateGroupResults") &&
      !deleteKoFn.includes("group-result-lock") &&
      !deleteKoFn.includes("GROUP_RESULT_LOCKED"),
    "deleteTournamentKnockoutAction unchanged and not wrapped by group-result freeze",
  );

  const deleteScheduleFn = sliceFn(
    scheduleActions,
    "export async function deleteTournamentScheduleAction",
    "export async function saveMatchResultAction",
  );
  assert(
    deleteScheduleFn.includes("blockedGroupScheduleMutationError"),
    "deleteTournamentScheduleAction retains C6-B blockedGroupScheduleMutationError",
  );
  assert(
    !deleteScheduleFn.includes("canMutateGroupResults"),
    "deleteTournamentScheduleAction not rewritten onto C6-F group-result lock",
  );
  assert(
    scheduleActions.includes("canRegenerateGroupSchedule") &&
      scheduleActions.includes("blockedGroupScheduleMutationError"),
    "C6-B regeneration policy wiring remains in schedule-actions",
  );

  assert(
    knockoutActions.includes("forceIncomplete") &&
      knockoutActions.includes("isGroupStageComplete") &&
      knockoutActions.includes("generateKnockoutAction"),
    "forceIncomplete remains wired unchanged in generateKnockoutAction",
  );
  assert(
    knockoutActions.includes("forceIncomplete") &&
      scheduleActions.includes("tournamentHasKnockoutPhase"),
    "once forceIncomplete creates KO rows, group-result lock applies via KO presence",
  );

  assert(
    runChecksCli.includes("runGroupResultLockChecks") &&
      runChecksCli.includes("group-result-lock-checks"),
    "group-result-lock-checks wired into run-checks-cli",
  );

  assert(
    !scheduleActions.includes("TournamentResultsBoard"),
    "D1 does not embed ResultsBoard UI lock in schedule-actions",
  );

  return "ok";
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canRegenerateGroupSchedule } from "@/lib/schedule/plan-preview";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`plan-apply-checks: ${message}`);
  }
}

function stripTsComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function extractExportedFunctionSource(source: string, functionName: string) {
  const marker = `export async function ${functionName}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `missing exported function ${functionName}`);
  let index = source.indexOf("(", start + marker.length);
  assert(index >= 0, `missing params for ${functionName}`);
  let parenDepth = 0;
  for (; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") {
      parenDepth += 1;
    } else if (char === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) {
        index += 1;
        break;
      }
    }
  }
  while (index < source.length && /\s/.test(source[index] ?? "")) {
    index += 1;
  }
  if (source[index] === ":") {
    index += 1;
    let angleDepth = 0;
    let braceDepth = 0;
    for (; index < source.length; index += 1) {
      const char = source[index];
      if (char === "<") {
        angleDepth += 1;
      } else if (char === ">") {
        angleDepth -= 1;
      } else if (char === "{") {
        if (angleDepth === 0 && braceDepth === 0) {
          break;
        }
        braceDepth += 1;
      } else if (char === "}") {
        braceDepth -= 1;
      }
    }
  }
  while (index < source.length && /\s/.test(source[index] ?? "")) {
    index += 1;
  }
  assert(source[index] === "{", `missing body for ${functionName}`);
  const bodyStart = index;
  let depth = 0;
  index = bodyStart;
  while (index < source.length) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
    index += 1;
  }
  throw new Error(`plan-apply-checks: could not extract ${functionName}`);
}

function assertPolicyBlocked(
  matches: Array<{
    phase?: string | null;
    status?: string | null;
    homeScore?: number | null;
    awayScore?: number | null;
  }>,
  tournamentStatus: string | null,
  expectedState: string,
  label: string,
) {
  const policy = canRegenerateGroupSchedule({
    tournamentStatus,
    groupCount: 2,
    matches,
  });
  assert(
    policy.state === expectedState && policy.decision === "blocked",
    `${label} => ${expectedState}/blocked`,
  );
}

function runApplyPolicyUnitChecks() {
  assertPolicyBlocked(
    [{ phase: "group", status: "completed", homeScore: 0, awayScore: 0 }],
    "published",
    "RESULTS_EXIST",
    "completed 0-0",
  );
  assertPolicyBlocked(
    [{ phase: "group", status: "scheduled", homeScore: 0, awayScore: 0 }],
    "published",
    "RESULTS_EXIST",
    "scheduled 0-0",
  );
  assertPolicyBlocked(
    [{ phase: "group", status: "scheduled", homeScore: 0, awayScore: null }],
    "published",
    "RESULTS_EXIST",
    "partial 0-null",
  );
  assertPolicyBlocked(
    [{ phase: "group", status: "scheduled", homeScore: null, awayScore: 0 }],
    "published",
    "RESULTS_EXIST",
    "partial null-0",
  );
  assertPolicyBlocked(
    [{ phase: "group", status: "live", homeScore: null, awayScore: null }],
    "published",
    "LIVE",
    "LIVE",
  );
  assertPolicyBlocked(
    [{ phase: "knockout", status: "scheduled", homeScore: null, awayScore: null }],
    "published",
    "KO_STARTED",
    "KO_STARTED",
  );
  assertPolicyBlocked(
    [{ phase: "group", status: "scheduled", homeScore: null, awayScore: null }],
    "completed",
    "COMPLETED",
    "COMPLETED",
  );

  const ambiguous = canRegenerateGroupSchedule({
    tournamentStatus: "published",
    groupCount: Number.NaN,
    matches: [],
  });
  assert(
    ambiguous.state === "AMBIGUOUS" && ambiguous.decision === "blocked",
    "AMBIGUOUS blocks",
  );

  const needsConfirm = canRegenerateGroupSchedule({
    tournamentStatus: "published",
    groupCount: 2,
    matches: [{ phase: "group", status: "scheduled", homeScore: null, awayScore: null }],
  });
  assert(
    needsConfirm.state === "SCHEDULE_NO_RESULTS" &&
      needsConfirm.decision === "allowedWithConfirmation",
    "SCHEDULE_NO_RESULTS requires confirmation",
  );
}

function runApplyStructuralChecks() {
  const applySource = read("src/lib/db/plan-apply-actions.ts");
  const persistSource = read("src/lib/db/plan-schedule-persist.ts");
  const prepareSource = read("src/lib/db/plan-preview-prepare.ts");
  const previewActions = read("src/lib/db/plan-preview-actions.ts");
  const scheduleActions = read("src/lib/db/schedule-actions.ts");
  const scheduleBoard = read("src/components/admin/TournamentScheduleBoard.tsx");
  const previewPanel = read("src/components/admin/TournamentPlanPreviewPanel.tsx");
  const runChecksCli = read("src/lib/schedule/run-checks-cli.ts");
  const knockoutActions = read("src/lib/db/knockout-actions.ts");
  const syncActions = read("src/lib/db/mein-turnierplan-sync-actions.ts");

  assert(
    applySource.includes('"use server"') || applySource.includes("'use server'"),
    "apply module is a server action module",
  );
  assert(
    applySource.includes("requireScheduleManage"),
    "apply requires schedule.manage",
  );
  const persistModuleExec = stripTsComments(persistSource);
  assert(
    !/^\s*["']use server["']\s*;/m.test(persistModuleExec) &&
      !persistModuleExec.includes('"use server"') &&
      !persistModuleExec.includes("'use server'"),
    "shared persist core is not a public use-server entrypoint",
  );

  const applyFn = extractExportedFunctionSource(applySource, "applyTournamentPlanAction");
  const applyModuleExec = stripTsComments(applySource);
  const persistFn = extractExportedFunctionSource(persistSource, "persistPreparedGroupSchedule");
  const persistExec = stripTsComments(persistFn);
  const generateFn = extractExportedFunctionSource(
    scheduleActions,
    "generateTournamentScheduleAction",
  );
  const generateExec = stripTsComments(generateFn);

  assert(
    applyFn.includes("tournamentId") &&
      applyFn.includes("previewFingerprint") &&
      applyFn.includes("confirmReplace"),
    "apply signature is tournamentId + previewFingerprint + confirmReplace?",
  );
  // Parameter list only — confirm by inspecting the function header before body.
  const header = applySource.slice(
    applySource.indexOf("export async function applyTournamentPlanAction"),
    applySource.indexOf("{", applySource.indexOf("export async function applyTournamentPlanAction")),
  );
  assert(
    !header.includes("groups") &&
      !header.includes("matches") &&
      !header.includes("fields") &&
      !header.includes("timing") &&
      !header.includes("policy") &&
      !header.includes("scores"),
    "apply client trust boundary: no competition payload params",
  );

  assert(
    applyFn.includes("prepareTournamentPlanFromDb"),
    "apply recomputes via shared server prepare",
  );
  assert(
    applyFn.includes("persistPreparedGroupSchedule"),
    "Apply calls persistPreparedGroupSchedule",
  );
  assert(
    applyFn.includes("inputFingerprint") &&
      applyFn.includes("stale_preview") &&
      applyFn.includes("currentFingerprint !== clientFingerprint"),
    "fingerprint mismatch returns stale_preview",
  );

  // Apply: fingerprint before shared core call.
  const fpIdx = applyFn.indexOf("stale_preview");
  const persistCallIdx = applyFn.indexOf("persistPreparedGroupSchedule");
  assert(fpIdx >= 0 && persistCallIdx > fpIdx, "Apply fingerprint comparison before persist core");

  // Shared core gate order: blocked → confirmation → zero-field → empty matches → map → delete.
  const blockedIdx = persistFn.indexOf('policy.decision === "blocked"');
  const confirmIdx = persistFn.indexOf("confirmation_required");
  const zeroFieldIdx = persistFn.indexOf("stage.fields.length === 0");
  const emptyMatchesIdx = persistFn.indexOf("preview.matches.length === 0");
  const participantsIdx = persistFn.indexOf("getTournamentParticipants");
  const resolveIdx = persistFn.indexOf("resolveScheduleParticipantRef");
  const deleteIdx = persistExec.search(/\.delete\s*\(/);
  assert(blockedIdx >= 0 && confirmIdx > blockedIdx, "shared core: blocked before confirmation");
  assert(zeroFieldIdx > confirmIdx, "shared core: confirmation before zero-field");
  assert(emptyMatchesIdx > zeroFieldIdx, "shared core: zero-field before empty-timetable");
  assert(participantsIdx > emptyMatchesIdx, "shared core: participants after empty-timetable gate");
  assert(resolveIdx > participantsIdx, "shared core: resolve after participant load");
  assert(deleteIdx > resolveIdx, "shared core: participant mapping before DELETE");
  assert(deleteIdx > emptyMatchesIdx, "shared core: all validation gates before DELETE");

  assert(
    persistFn.includes('allowedWithConfirmation') &&
      persistFn.includes("confirmReplace !== true"),
    "shared core requires confirmation for allowedWithConfirmation",
  );
  assert(
    persistFn.includes("stage.fields.length === 0") &&
      persistFn.includes("validation_error") &&
      persistFn.includes("Bitte zuerst mindestens ein Spielfeld anlegen und speichern.") &&
      !persistFn.includes("fieldDisplayName") &&
      !persistExec.includes("tournament_fields"),
    "shared core zero fields → validation_error; no default field insert",
  );
  assert(
    persistFn.includes("preview.matches") &&
      persistFn.includes("previewParticipantKey") &&
      persistFn.includes("resolveScheduleParticipantRef") &&
      persistFn.includes('phase: "group"'),
    "shared core persists server-recomputed preview.matches",
  );

  const deleteSlice = persistExec.slice(deleteIdx, deleteIdx + 220);
  assert(
    deleteSlice.includes('eq("tournament_id"') &&
      deleteSlice.includes('eq("phase", "group")'),
    "DELETE scope is tournament + phase=group only",
  );
  assert(
    !persistFn.includes("generateKnockoutAction") &&
      !persistFn.includes("deleteKnockout") &&
      !persistFn.includes("syncMeinTurnierplan") &&
      !persistFn.includes("mein-turnierplan-sync") &&
      !persistSource.includes("knockout-actions") &&
      !persistSource.includes("mein-turnierplan"),
    "shared core has no KO/MTP mutation imports",
  );

  // Generate routes through prepare + shared core.
  assert(
    generateFn.includes("prepareTournamentPlanFromDb"),
    "Generate uses prepareTournamentPlanFromDb",
  );
  assert(
    generateFn.includes("persistPreparedGroupSchedule"),
    "Generate calls persistPreparedGroupSchedule",
  );
  assert(
    generateFn.includes("confirmReplace"),
    "Generate accepts confirmReplace",
  );
  assert(
    !generateExec.includes("fieldDisplayName") &&
      !generateExec.includes("tournament_fields") &&
      !generateExec.includes("roundRobinFixtures") &&
      !generateExec.includes("buildTimetable"),
    "Generate no longer has default-field insert or inline planner",
  );
  assert(
    !/\.delete\s*\(/.test(generateExec),
    "Generate has no direct DELETE; persistence is in shared core",
  );
  assert(
    !scheduleActions.includes("applyTournamentPlanAction"),
    "schedule-actions does NOT call applyTournamentPlanAction",
  );
  // C6-E: schedule-actions may import prepare + persist core (obsolete freeze revised).
  assert(
    scheduleActions.includes("prepareTournamentPlanFromDb") &&
      scheduleActions.includes("persistPreparedGroupSchedule"),
    "schedule-actions may import prepare + persist core for Generate",
  );

  assert(
    !applyFn.includes("generateTournamentScheduleAction") &&
      !applyModuleExec.includes("generateTournamentScheduleAction"),
    "apply does not call generateTournamentScheduleAction",
  );

  assert(
    prepareSource.includes("prepareTournamentPlanFromDb") &&
      prepareSource.includes("buildTournamentPlanPreview") &&
      prepareSource.includes("canRegenerateGroupSchedule") &&
      prepareSource.includes("knockout: null"),
    "shared prepare recomputes preview + C6-B policy with knockout:null",
  );
  const prepareExec = stripTsComments(prepareSource);
  assert(!/\.insert\s*\(/.test(prepareExec), "prepare has no insert");
  assert(!/\.delete\s*\(/.test(prepareExec), "prepare has no delete");
  assert(!prepareExec.includes("revalidatePath"), "prepare has no revalidatePath");

  // C6-C preview remains zero mutation; D2 UI is board-orchestrated.
  const previewFn = extractExportedFunctionSource(
    previewActions,
    "previewTournamentPlanAction",
  );
  const previewExec = stripTsComments(previewFn);
  assert(!/\.insert\s*\(/.test(previewExec), "C6-C preview remains zero mutation (no insert)");
  assert(!/\.delete\s*\(/.test(previewExec), "C6-C preview remains zero mutation (no delete)");
  runD2ApplyUiStructuralChecks(scheduleBoard, previewPanel);
  runC6EGenerateBoardStructuralChecks(scheduleBoard);

  assert(
    scheduleActions.includes("canRegenerateGroupSchedule") &&
      scheduleActions.includes("blockedGroupScheduleMutationError"),
    "delete schedule path remains C6-B protected via blocked helper",
  );
  assert(
    !knockoutActions.includes("applyTournamentPlanAction") &&
      !syncActions.includes("applyTournamentPlanAction") &&
      !knockoutActions.includes("persistPreparedGroupSchedule") &&
      !syncActions.includes("persistPreparedGroupSchedule"),
    "KO/MTP modules unwired to apply/persist",
  );

  assert(
    runChecksCli.includes("runPlanApplyChecks") &&
      runChecksCli.includes("plan-apply-checks"),
    "C6-D/E apply suite wired into run-checks-cli",
  );

  assert(
    applySource.includes("stale_preview") &&
      persistSource.includes("confirmation_required") &&
      persistSource.includes("blocked") &&
      persistSource.includes("validation_error") &&
      persistSource.includes("persistence_error") &&
      persistSource.includes("success"),
    "apply/persist result statuses are discriminated",
  );
}

function runC6EGenerateBoardStructuralChecks(scheduleBoard: string) {
  assert(
    scheduleBoard.includes("executeGenerate") &&
      scheduleBoard.includes("generateTournamentScheduleAction"),
    "Board wires typed Generate executor",
  );
  assert(
    scheduleBoard.includes("executeGenerate(true)") &&
      scheduleBoard.includes("executeGenerate(false)"),
    "Board confirmed Generate passes true; non-replace path passes false",
  );
  const generateCall = scheduleBoard.match(/generateTournamentScheduleAction\([\s\S]*?\);/);
  assert(generateCall != null, "generateTournamentScheduleAction call present");
  assert(
    generateCall[0].includes("tournament.id") && generateCall[0].includes("confirmReplace"),
    "generate call uses tournament id + confirmReplace",
  );
}

function runD2ApplyUiStructuralChecks(scheduleBoard: string, previewPanel: string) {
  assert(
    scheduleBoard.includes("applyTournamentPlanAction") &&
      scheduleBoard.includes('from "@/lib/db/plan-apply-actions"'),
    "Board imports apply action",
  );
  assert(
    !previewPanel.includes("applyTournamentPlanAction") &&
      !previewPanel.includes("plan-apply-actions") &&
      !previewPanel.includes("previewTournamentPlanAction"),
    "panel does not import apply/preview server actions",
  );

  const applyCall = scheduleBoard.match(/applyTournamentPlanAction\([\s\S]*?\);/);
  assert(applyCall != null, "applyTournamentPlanAction call present");
  assert(
    applyCall[0].includes("tournament.id") &&
      applyCall[0].includes("fingerprint") &&
      applyCall[0].includes("confirmReplace"),
    "apply call uses tournament id + fingerprint + boolean only",
  );
  assert(
    !applyCall[0].includes("matches") &&
      !applyCall[0].includes("groups") &&
      !applyCall[0].includes("memberships") &&
      !applyCall[0].includes("policy") &&
      !applyCall[0].includes("timing") &&
      !applyCall[0].includes("preview.matches"),
    "apply payload excludes competition rows/policy/timing",
  );

  assert(
    scheduleBoard.includes("previewIsApplicable") &&
      scheduleBoard.includes("handleApplyRequest") &&
      previewPanel.includes("Spielplan übernehmen") &&
      previewPanel.includes("canApply") &&
      previewPanel.includes("showApply"),
    "allowed/applicable preview can expose apply",
  );
  assert(
    scheduleBoard.includes('decision !== "allowed"') &&
      scheduleBoard.includes('decision !== "allowedWithConfirmation"') &&
      scheduleBoard.includes("fieldCount") &&
      scheduleBoard.includes("matches.length") &&
      scheduleBoard.includes("NO_FIELDS"),
    "blocked/zero-field/empty previews are not applicable for apply",
  );

  assert(
    scheduleBoard.includes("confirmApplyReplace") &&
      scheduleBoard.includes('confirmLabel="Spielplan ersetzen"') &&
      scheduleBoard.includes("executeApply(true)") &&
      scheduleBoard.includes("allowedWithConfirmation"),
    "allowedWithConfirmation uses distinct apply ConfirmModal path",
  );
  assert(
    scheduleBoard.includes("confirmGenerate") &&
      scheduleBoard.includes('confirmLabel="Generieren"') &&
      scheduleBoard.includes("generateTournamentScheduleAction"),
    "existing generate confirmation remains distinct",
  );
  assert(
    !scheduleBoard.includes("executeApply(true)") ||
      scheduleBoard.includes("confirmApplyReplace"),
    "no silent confirmReplace=true outside apply confirmation flow",
  );
  assert(
    scheduleBoard.includes("executeApply(false)") &&
      !scheduleBoard.includes("executeApply(true);\n    void executeApply(false)"),
    "direct apply uses confirmReplace false",
  );

  assert(
    scheduleBoard.includes("previewApplyLocked") &&
      scheduleBoard.includes("stale_preview") &&
      scheduleBoard.includes("setPreviewApplyLocked(true)") &&
      scheduleBoard.includes("Vorschau aktualisieren") &&
      !scheduleBoard.includes("executeApply(false);\n      void handlePreview"),
    "stale response locks apply and requires explicit preview refresh",
  );
  assert(
    !scheduleBoard.includes('status === "stale_preview"') ||
      !/stale_preview[\s\S]{0,400}executeApply\(/.test(scheduleBoard),
    "stale does not auto-retry apply",
  );

  assert(
    scheduleBoard.includes("Der Spielplan wurde erfolgreich übernommen.") &&
      scheduleBoard.includes("clearPreviewState") &&
      scheduleBoard.includes("router.refresh()"),
    "success clears preview and refreshes",
  );
  assert(
    scheduleBoard.includes("invalidateOpenPreview") &&
      scheduleBoard.includes("invalidateOpenPreview()"),
    "generate/delete success path invalidates preview via shared run()",
  );

  assert(
    scheduleBoard.includes("setPending(true)") &&
      previewPanel.includes("applyPending") &&
      previewPanel.includes("disabled={applyPending}") &&
      scheduleBoard.includes("disabled={pending || previewLoading}"),
    "apply pending disables relevant controls",
  );

  assert(
    scheduleBoard.includes("nicht vollständig übernommen") ||
      scheduleBoard.includes("Bitte lade den aktuellen Stand neu"),
    "persistence_error wording does not claim unchanged/rollback state",
  );
  assert(
    !scheduleBoard.includes("unverändert") &&
      !scheduleBoard.includes("wurde nicht geändert") &&
      !scheduleBoard.includes("Rollback"),
    "no false unchanged/rollback guarantee on persistence failure",
  );

  assert(
    scheduleBoard.includes("previewTournamentPlanAction") &&
      scheduleBoard.includes("generateTournamentScheduleAction") &&
      scheduleBoard.includes("deleteTournamentScheduleAction") &&
      scheduleBoard.includes("Vorschau anzeigen") &&
      scheduleBoard.includes("Spielplan generieren") &&
      scheduleBoard.includes("Spielplan löschen"),
    "preview/generate/delete controls remain wired",
  );
  assert(
    !scheduleBoard.includes("generateKnockoutAction") &&
      !scheduleBoard.includes("mein-turnierplan-sync") &&
      !previewPanel.includes("mein-turnierplan"),
    "no KO/MTP wiring in apply UI",
  );
}

/**
 * C6-D D1/D2 apply foundation + UI checks (pure/structural; not DB integration).
 */
export function runPlanApplyChecks() {
  runApplyPolicyUnitChecks();
  runApplyStructuralChecks();
  return "ok";
}

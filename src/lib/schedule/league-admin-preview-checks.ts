import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_COMPETITION_MODE_LABELS,
  buildChampionsLeagueAdminPreview,
  championsLeagueParticipantIds,
  describeChampionsLeagueConfig,
  expectedLeagueKnockoutMatchCount,
  parseMatchesPerTeam,
  PREVIEW_ONLY_SCHEDULE_LOCK_MESSAGE,
  savedCompetitionMode,
  scheduleEditingEnabled,
} from "@/lib/schedule/league-admin-preview";
import { previewParticipantKey, type PlanPreviewMatch } from "@/lib/schedule/plan-preview";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`league-admin-preview-checks: ${message}`);
  }
}

function ids(count: number) {
  return Array.from({ length: count }, (_, index) => `t${index + 1}`);
}

function participants(count: number) {
  return ids(count).map((id) => ({ applicationId: id, externalTeamId: null }));
}

function fields(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `field-${index + 1}`,
    name: `Platz ${index + 1}`,
  }));
}

const timing = {
  startIso: "2026-12-27T08:00:00.000Z",
  durationMinutes: 12,
  breakMinutes: 3,
  minimumRestMinutes: 15,
  lunchStartIso: null,
  lunchEndIso: null,
};

function preview(teamCount: number, matchesPerTeam: number | null, cutoff: 4 | 8, fieldCount: number) {
  return buildChampionsLeagueAdminPreview({
    participants: participants(teamCount),
    matchesPerTeam,
    knockoutCutoff: cutoff,
    fields: fields(fieldCount),
    timing,
  });
}

function assertNoOverlap(matches: PlanPreviewMatch[]) {
  const byTeam = new Map<string, Array<{ start: number; end: number }>>();
  for (const match of matches) {
    if (!match.scheduledAt) {
      continue;
    }
    const start = Date.parse(match.scheduledAt);
    const end = start + match.durationMinutes * 60_000;
    for (const teamId of [previewParticipantKey(match.home), previewParticipantKey(match.away)]) {
      if (!teamId) {
        continue;
      }
      const slots = byTeam.get(teamId) ?? [];
      for (const slot of slots) {
        assert(end <= slot.start || start >= slot.end, `${teamId} overlaps`);
      }
      slots.push({ start, end });
      byTeam.set(teamId, slots);
    }
  }
}

export function runLeagueAdminPreviewChecks() {
  const adminForm = read("src/components/admin/TournamentAdminForm.tsx");
  const scheduleBoard = read("src/components/admin/TournamentScheduleBoard.tsx");
  const previewPanel = read("src/components/admin/TournamentPlanPreviewPanel.tsx");
  const scheduleFields = read("src/components/admin/ChampionsLeagueScheduleFields.tsx");
  const adminPreview = read("src/lib/schedule/league-admin-preview.ts");
  const apply = read("src/lib/db/plan-apply-actions.ts");
  const prepare = read("src/lib/db/plan-preview-prepare.ts");
  const schedulePage = read("src/app/admin/turniere/[id]/spielplan/page.tsx");

  assert(savedCompetitionMode(0) === "round-robin", "no groups stays round robin");
  assert(savedCompetitionMode(1) === "groups-knockout", "groups stay groups-knockout");
  assert(
    ADMIN_COMPETITION_MODE_LABELS["round-robin"] === "Jeder gegen jeden" &&
      ADMIN_COMPETITION_MODE_LABELS["groups-knockout"] === "Gruppenphase + K.-o.-Runde" &&
      ADMIN_COMPETITION_MODE_LABELS["champions-league"] === "Champions League",
    "competition mode labels",
  );
  assert(parseMatchesPerTeam("3") === 3, "integer matches parse");
  assert(parseMatchesPerTeam("1.5") == null && parseMatchesPerTeam("") == null, "fractional matches rejected");
  assert(expectedLeagueKnockoutMatchCount(4) === 4, "top 4 counts the existing four-team skeleton");
  assert(expectedLeagueKnockoutMatchCount(8) === 8, "top 8 counts the existing eight-team skeleton");

  const eight = describeChampionsLeagueConfig({
    participantIds: ids(8),
    matchesPerTeam: 3,
    knockoutCutoff: 4,
  });
  assert(eight.ok && eight.expectedLeagueMatchCount === 12 && eight.participantCount === 8, "8 x 3 top 4");
  const twelve = describeChampionsLeagueConfig({
    participantIds: ids(12),
    matchesPerTeam: 5,
    knockoutCutoff: 8,
  });
  assert(twelve.ok && twelve.expectedLeagueMatchCount === 30, "12 x 5 top 8");
  const nine = describeChampionsLeagueConfig({
    participantIds: ids(9),
    matchesPerTeam: 4,
    knockoutCutoff: 4,
  });
  assert(nine.ok && nine.expectedLeagueMatchCount === 18, "9 x 4 top 4");
  const uneven = describeChampionsLeagueConfig({
    participantIds: ids(9),
    matchesPerTeam: 3,
    knockoutCutoff: 4,
  });
  assert(
    !uneven.ok &&
      uneven.code === "UNEVEN_MATCH_TOTAL" &&
      uneven.expectedLeagueMatchCount == null &&
      uneven.expectedKnockoutMatchCount == null,
    "9 x 3 rejected without a knockout total",
  );
  const tooSmall = describeChampionsLeagueConfig({
    participantIds: ids(6),
    matchesPerTeam: 2,
    knockoutCutoff: 8,
  });
  assert(
    !tooSmall.ok &&
      tooSmall.code === "CUTOFF_EXCEEDS_TEAMS" &&
      tooSmall.expectedKnockoutMatchCount == null,
    "6 teams cannot fill top 8 and show no knockout total",
  );
  assert(eight.expectedKnockoutMatchCount === 4 && twelve.expectedKnockoutMatchCount === 8, "valid configs keep the knockout totals");

  const scheduled = preview(8, 3, 4, 3);
  assert(scheduled.mode === "champions-league", "admin preview mode");
  assert(scheduled.summary.scheduledLeagueMatchCount === 12, "8 x 3 is fully scheduled");
  assert(scheduled.koPlan == null, "admin preview does not create knockout matches");
  const odd = preview(9, 4, 4, 3);
  assert(odd.summary.expectedLeagueMatchCount === 18 && odd.matches.length === 18, "odd league keeps every fixture");
  assertNoOverlap(odd.matches);
  const sameTime = new Map<string, number>();
  for (const match of odd.matches) {
    for (const teamId of [previewParticipantKey(match.home), previewParticipantKey(match.away)]) {
      const key = `${teamId}|${match.scheduledAt}`;
      sameTime.set(key, (sameTime.get(key) ?? 0) + 1);
      assert(sameTime.get(key) === 1, "odd league has no simultaneous double booking");
    }
  }
  const invalid = preview(9, 3, 4, 2);
  assert(invalid.matches.length === 0, "invalid combination creates no fixtures");
  assert(invalid.warnings.some((warning) => warning.code === "LEAGUE_CONFIG_INVALID"), "invalid combination warns");
  const incomplete = preview(8, 3, 4, 0);
  assert(incomplete.matches.length === 12, "incomplete timetable keeps the fixtures");
  assert(incomplete.matches.every((match) => match.scheduledAt == null && match.fieldId == null), "unscheduled fixtures stay visible");
  assert(
    incomplete.warnings.some((warning) => warning.code === "TIMETABLE_INCOMPLETE"),
    "incomplete timetable is marked",
  );

  const identities = championsLeagueParticipantIds([
    { applicationId: "b", externalTeamId: null },
    { applicationId: "a", externalTeamId: null },
    { applicationId: "a", externalTeamId: "ext" },
    { applicationId: null, externalTeamId: null },
    { applicationId: null, externalTeamId: "ext-1" },
  ]);
  assert(identities.join(",") === "a,b,ext-1", "participant ids are explicit, unique and ordered");

  // Behavioral checks call scheduleEditingEnabled. They do not render the page.
  assert(scheduleEditingEnabled("round-robin", "round-robin"), "saved round robin stays editable");
  assert(scheduleEditingEnabled("groups-knockout", "groups-knockout"), "saved groups mode stays editable");
  assert(!scheduleEditingEnabled("champions-league", "round-robin"), "champions league locks settings and matches on a round-robin tournament");
  assert(!scheduleEditingEnabled("champions-league", "groups-knockout"), "champions league locks settings and matches on a groups tournament");
  assert(!scheduleEditingEnabled("groups-knockout", "round-robin"), "the other unsaved legacy mode locks a round-robin tournament");
  assert(!scheduleEditingEnabled("round-robin", "groups-knockout"), "the other unsaved legacy mode locks a groups tournament");
  assert(scheduleEditingEnabled("groups-knockout", "groups-knockout"), "returning to the saved groups mode restores editing");
  assert(scheduleEditingEnabled("round-robin", "round-robin"), "returning to the saved round-robin mode restores editing");
  assert(
    PREVIEW_ONLY_SCHEDULE_LOCK_MESSAGE ===
      "Vorschaumodus: Änderungen am gespeicherten Spielplan sind deaktiviert. Wähle den gespeicherten Modus, um Spiele zu bearbeiten oder zu löschen. Spielparameter und Spielfelder sind dabei ebenfalls gesperrt.",
    "lock message covers matches, settings and fields",
  );

  const modeSwitch = scheduleBoard.slice(
    scheduleBoard.indexOf("function selectCompetitionMode"),
    scheduleBoard.indexOf("function requestClearSchedule"),
  );
  assert(
    modeSwitch.includes("clearPreviewState()") &&
      modeSwitch.includes("setConfirmGenerate(false)") &&
      modeSwitch.includes("setConfirmClear(false)") &&
      modeSwitch.includes("setDeleteMatchId(null)") &&
      !modeSwitch.includes("deleteTournamentScheduleAction") &&
      !modeSwitch.includes("deleteTournamentMatchAction") &&
      !modeSwitch.includes("saveTournamentMatchAction") &&
      !modeSwitch.includes("saveScheduleSettingsAction") &&
      !modeSwitch.includes("setFieldNames") &&
      !modeSwitch.includes("handleSettings") &&
      !modeSwitch.includes("generateTournamentScheduleAction") &&
      !modeSwitch.includes("applyTournamentPlanAction"),
    "source: mode switch clears preview and confirmations without submitting settings",
  );
  const settingsSave = scheduleBoard.slice(
    scheduleBoard.indexOf("async function handleSettings"),
    scheduleBoard.indexOf('title="Spielparameter"'),
  );
  assert(
    settingsSave.indexOf("scheduleEditingEnabled") < settingsSave.indexOf("saveScheduleSettingsAction") &&
      settingsSave.includes("return;"),
    "source: handleSettings returns before saveScheduleSettingsAction",
  );
  const fieldControls = scheduleBoard.slice(
    scheduleBoard.indexOf("function removeField"),
    scheduleBoard.indexOf("function changeScheduleSetting"),
  );
  assert(
    fieldControls.indexOf("function removeField") !== -1 &&
      fieldControls.indexOf("scheduleEditingEnabled") < fieldControls.indexOf("setFieldNames") &&
      fieldControls.indexOf("function addField") < fieldControls.lastIndexOf("setFieldNames") &&
      fieldControls.lastIndexOf("scheduleEditingEnabled") < fieldControls.lastIndexOf("setFieldNames"),
    "source: field add and remove return before changing the field list",
  );
  const applyHandler = scheduleBoard.slice(
    scheduleBoard.indexOf("async function executeApply"),
    scheduleBoard.indexOf("async function executeGenerate"),
  );
  assert(
    applyHandler.indexOf("scheduleEditingEnabled") < applyHandler.indexOf("applyTournamentPlanAction") &&
      applyHandler.includes("return;"),
    "source: executeApply rechecks the mode before the server action",
  );
  const clearSchedule = scheduleBoard.slice(
    scheduleBoard.indexOf("function executeClearSchedule"),
    scheduleBoard.indexOf("function requestDeleteMatch"),
  );
  assert(
    clearSchedule.indexOf("scheduleEditingEnabled") < clearSchedule.indexOf("deleteTournamentScheduleAction") &&
      clearSchedule.includes("return;"),
    "schedule delete rechecks the mode before the server action",
  );
  const deleteMatch = scheduleBoard.slice(
    scheduleBoard.indexOf("function executeDeleteMatch"),
    scheduleBoard.indexOf("function saveExistingMatch"),
  );
  assert(
    deleteMatch.indexOf("scheduleEditingEnabled") < deleteMatch.indexOf("deleteTournamentMatchAction"),
    "match delete rechecks the mode before the server action",
  );
  const saveMatch = scheduleBoard.slice(
    scheduleBoard.indexOf("function saveExistingMatch"),
    scheduleBoard.indexOf("function addMatch"),
  );
  const addMatch = scheduleBoard.slice(
    scheduleBoard.indexOf("function addMatch"),
    scheduleBoard.indexOf("function handleChampionsLeaguePreview"),
  );
  assert(
    saveMatch.indexOf("scheduleEditingEnabled") < saveMatch.indexOf("saveTournamentMatchAction") &&
      addMatch.indexOf("scheduleEditingEnabled") < addMatch.indexOf("saveTournamentMatchAction"),
    "match save and add recheck the mode before the server action",
  );
  assert(
    scheduleBoard.includes("disabled={pending || previewLoading || !scheduleEditingEnabledNow}") &&
      scheduleBoard.includes("disabled={pending || !scheduleEditingEnabledNow}") &&
      scheduleBoard.includes("disabled={!scheduleEditingEnabledNow}") &&
      scheduleBoard.includes("onClick={() => removeField(index)}") &&
      scheduleBoard.includes("onClick={addField}") &&
      scheduleBoard.includes("locked={groupResultsLocked || !scheduleEditingEnabledNow}") &&
      scheduleBoard.includes("{PREVIEW_ONLY_SCHEDULE_LOCK_MESSAGE}"),
    "source: preview-only mode disables schedule delete, settings save, field controls and match editing",
  );

  assert(
    adminForm.includes("updateTournamentAction(tournament.id, values)") &&
      !adminForm.includes("champions-league") &&
      !adminForm.includes("buildChampionsLeagueAdminPreview") &&
      !adminForm.includes("buildTournamentPlanPreview"),
    "tournament form does not submit Champions League configuration",
  );
  assert(
    prepare.includes("resolveGenerationMode") &&
      prepare.indexOf("resolveGenerationMode") < prepare.indexOf("buildTournamentPlanPreview") &&
      !prepare.includes('mode: "champions-league"'),
    "saved preview resolves the stored mode and does not build a champions league preview",
  );
  assert(!apply.includes("champions-league") && !apply.includes("buildChampionsLeagueAdminPreview"), "apply action stays unchanged");
  assert(
    scheduleBoard.includes("buildChampionsLeagueAdminPreview") &&
      scheduleBoard.includes('preview.mode === "champions-league"') &&
      scheduleBoard.includes("applyChampionsLeagueScheduleAction") &&
      scheduleBoard.includes("canScheduleManage") &&
      scheduleBoard.includes("Keine Berechtigung für diese Aktion.") &&
      scheduleBoard.includes("generateAllowed") &&
      scheduleBoard.includes("Direkt generieren") &&
      scheduleBoard.includes("previewTournamentPlanAction") &&
      scheduleBoard.includes("Spielplan als PDF") &&
      !scheduleBoard.includes("updateTournamentAction") &&
      !scheduleBoard.includes("league-phase") &&
      !scheduleBoard.includes("competition_format"),
    "schedule board persists Champions League only through the league schedule action",
  );
  assert(
    previewPanel.includes("Diese Champions-League-Vorschau ist nicht gespeichert") &&
      previewPanel.includes("Nicht eingeplant") &&
      previewPanel.includes("showApply") &&
      previewPanel.includes("Spielplan übernehmen") &&
      previewPanel.includes("overflow-x-auto") &&
      !previewPanel.includes("applyTournamentPlanAction"),
    "preview panel applies Champions League without the legacy apply action",
  );
  assert(
    scheduleFields.includes("ADMIN_COMPETITION_MODE_LABELS") &&
      scheduleFields.includes("Top 4") &&
      scheduleFields.includes("Top 8") &&
      scheduleFields.includes("Spiel um Platz 3") &&
      scheduleFields.includes("Platz 5") &&
      scheduleFields.includes("Platz 7") &&
      scheduleFields.includes("sm:grid-cols-2") &&
      adminPreview.includes("Jeder gegen jeden") &&
      adminPreview.includes("Gruppenphase + K.-o.-Runde") &&
      adminPreview.includes("Champions League"),
    "configuration UI exposes the three modes and responsive fields",
  );
  assert(
    schedulePage.includes("canScheduleManage") &&
      schedulePage.includes('hasPermissionInAuthorization') &&
      schedulePage.includes('"schedule.manage"'),
    "schedule page gates the local preview with schedule.manage",
  );

  return "ok";
}

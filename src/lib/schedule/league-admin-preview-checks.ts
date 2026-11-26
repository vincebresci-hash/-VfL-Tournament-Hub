import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_COMPETITION_MODE_LABELS,
  buildChampionsLeagueAdminPreview,
  championsLeagueApplyBlockReason,
  championsLeagueParticipantIds,
  describeChampionsLeagueConfig,
  expectedLeagueKnockoutMatchCount,
  parseMatchesPerTeam,
  SCHEDULE_CONFIG_LOCKED_MESSAGE,
  savedCompetitionMode,
  scheduleEditingEnabled,
  scheduleParametersEditable,
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

  // Behavioral checks of the draft/saved-mode decoupling (CL Release 5).
  // scheduleEditingEnabled now gates ONLY classic saved-schedule operations
  // (direct generate / clear / classic apply) and never Champions League.
  assert(scheduleEditingEnabled("round-robin", "round-robin"), "saved round robin keeps classic schedule ops");
  assert(scheduleEditingEnabled("groups-knockout", "groups-knockout"), "saved groups mode keeps classic schedule ops");
  assert(!scheduleEditingEnabled("champions-league", "champions-league"), "champions league never uses the classic schedule path");
  assert(!scheduleEditingEnabled("champions-league", "groups-knockout"), "champions league is not a classic schedule op");
  assert(!scheduleEditingEnabled("groups-knockout", "round-robin"), "the other unsaved legacy mode is not a classic op here");
  assert(!scheduleEditingEnabled("round-robin", "groups-knockout"), "the other unsaved legacy mode is not a classic op here");

  // Parameters/fields are a draft, editable for ANY mode unless the tournament
  // is truly locked by the started/result protection.
  assert(scheduleParametersEditable(false), "parameters editable when not policy-blocked");
  assert(!scheduleParametersEditable(true), "parameters frozen only by the started/result lock");

  // Concrete Champions League apply block reasons mirror the server guards.
  assert(
    championsLeagueApplyBlockReason({ storedFormat: null, groupCount: 0, policyBlocked: false }) === null,
    "null legacy format with no groups is applicable",
  );
  assert(
    championsLeagueApplyBlockReason({ storedFormat: "champions-league", groupCount: 1, policyBlocked: false }) === null,
    "a saved champions league with its single league group is applicable",
  );
  assert(
    championsLeagueApplyBlockReason({ storedFormat: null, groupCount: 1, policyBlocked: false }) === null,
    "a legacy single-group resultless tournament is convertible (relaxed UNSAFE_LEGACY_CONVERSION)",
  );
  const groupsKnockoutBlock = championsLeagueApplyBlockReason({
    storedFormat: "groups-knockout",
    groupCount: 2,
    policyBlocked: false,
  });
  assert(
    typeof groupsKnockoutBlock === "string" &&
      groupsKnockoutBlock.includes("Gruppenphase + K.-o.-Runde"),
    "an explicitly saved legacy format blocks a champions league overwrite with its label",
  );
  assert(
    typeof championsLeagueApplyBlockReason({ storedFormat: "round-robin", groupCount: 0, policyBlocked: false }) === "string",
    "an explicitly saved round-robin blocks a champions league overwrite",
  );
  const multiGroupBlock = championsLeagueApplyBlockReason({
    storedFormat: null,
    groupCount: 2,
    policyBlocked: false,
  });
  assert(
    typeof multiGroupBlock === "string" && multiGroupBlock.includes("höchstens eine Gruppe"),
    "more than one group blocks champions league with a concrete remedy",
  );
  assert(
    championsLeagueApplyBlockReason({
      storedFormat: null,
      groupCount: 0,
      policyBlocked: true,
      policyReason: "Es existieren bereits Ergebnisse (inkl. 0:0).",
    }) === "Es existieren bereits Ergebnisse (inkl. 0:0).",
    "the started/result lock reason is surfaced verbatim",
  );
  assert(
    SCHEDULE_CONFIG_LOCKED_MESSAGE.includes("Spielparameter") &&
      SCHEDULE_CONFIG_LOCKED_MESSAGE.includes("gesperrt"),
    "config lock message explains the real started/result freeze",
  );

  // Source invariants: the board decouples draft parameters from the saved mode
  // and no longer carries the misleading preview-only lock.
  assert(
    !scheduleBoard.includes("scheduleEditingEnabledNow") &&
      !scheduleBoard.includes("PREVIEW_ONLY_SCHEDULE_LOCK_MESSAGE"),
    "source: the preview-only parameter lock is gone",
  );
  assert(
    scheduleBoard.includes("scheduleParametersEditable(scheduleConfigLocked)") &&
      scheduleBoard.includes("const parametersEditable") &&
      scheduleBoard.includes("const classicModeActive") &&
      scheduleBoard.includes("const savedScheduleEditable") &&
      scheduleBoard.includes("championsLeagueApplyBlockReason") &&
      scheduleBoard.includes("disabled={!parametersEditable}") &&
      scheduleBoard.includes("locked={!savedScheduleEditable}") &&
      scheduleBoard.includes("SCHEDULE_CONFIG_LOCKED_MESSAGE"),
    "source: parameters/fields/matches are gated by the real lock, not a mode mismatch",
  );
  assert(
    previewPanel.includes("applyBlockReason") &&
      previewPanel.includes("ist gesperrt:"),
    "source: the preview panel shows the concrete apply block reason",
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

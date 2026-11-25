import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StoredCompetitionColumns } from "@/lib/schedule/competition-config";
import {
  executeCompetitionConfigurationSave,
  interpretConditionalTournamentUpdate,
  type CompetitionConfigurationSaveDeps,
  type ConditionalUpdateAttempt,
  type ProvedConfigurationRow,
} from "@/lib/schedule/competition-config-save-executor";
import {
  CHAMPIONS_LEAGUE_CONFIGURATION_SAVE_ACTIVATED,
  evaluateCompetitionConfigurationSave,
  type ConfigurationSaveRequest,
  type ConfigurationSaveSnapshot,
} from "@/lib/schedule/competition-config-save-policy";
import type { ConfirmedParticipantIdentity } from "@/lib/schedule/competition-config";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`competition-config-save-checks: ${message}`);
  }
}

function participants(ids: readonly string[]): ConfirmedParticipantIdentity[] {
  return ids.map((id) => ({ applicationId: id, externalTeamId: null }));
}

function ids(count: number) {
  return Array.from({ length: count }, (_, index) => `team-${index + 1}`);
}

const VERSION = "2026-11-21T10:00:00.000Z";

function snapshot(overrides: Partial<ConfigurationSaveSnapshot> = {}): ConfigurationSaveSnapshot {
  return {
    updatedAt: VERSION,
    competitionFormat: null,
    leagueMatchesPerTeam: null,
    knockoutCutoff: null,
    groupCount: 0,
    matches: [],
    effectiveLifecycle: "setup",
    participants: participants(ids(8)),
    ...overrides,
  };
}

function request(overrides: Partial<ConfigurationSaveRequest> = {}): ConfigurationSaveRequest {
  return {
    expectedUpdatedAt: VERSION,
    competitionFormat: "round-robin",
    leagueMatchesPerTeam: null,
    knockoutCutoff: null,
    ...overrides,
  };
}

function storedColumns(
  format: StoredCompetitionColumns["competitionFormat"],
  matches: number | null = null,
  cutoff: 4 | 8 | null = null,
): StoredCompetitionColumns {
  return {
    competitionFormat: format,
    leagueMatchesPerTeam: matches,
    knockoutCutoff: cutoff,
  };
}

function proved(columns: StoredCompetitionColumns, updatedAt = "2026-11-21T10:00:01.000Z"): ProvedConfigurationRow {
  return { id: "tournament-1", slug: "cup", updatedAt, columns };
}

function attempt(overrides: Partial<ConditionalUpdateAttempt> = {}): ConditionalUpdateAttempt {
  return { error: null, rows: null, reread: null, ...overrides };
}

export function runCompetitionConfigSaveChecks() {
  assert(CHAMPIONS_LEAGUE_CONFIGURATION_SAVE_ACTIVATED === false, "champions league save stays inactive");

  const invalidFormat = evaluateCompetitionConfigurationSave(
    snapshot(),
    request({ competitionFormat: "Gruppenphase und KO" }),
  );
  assert(
    invalidFormat.kind === "reject" && invalidFormat.code === "INVALID_COMPETITION_FORMAT",
    "public display text is rejected",
  );

  const missingIdentity = evaluateCompetitionConfigurationSave(
    snapshot({
      participants: [{ applicationId: "   ", externalTeamId: null }],
    }),
    request({ competitionFormat: "champions-league", leagueMatchesPerTeam: 3, knockoutCutoff: 4 }),
  );
  assert(
    missingIdentity.kind === "reject" && missingIdentity.code === "INVALID_PARTICIPANT_IDENTITY",
    "blank participant identity is rejected",
  );

  const duplicate = evaluateCompetitionConfigurationSave(
    snapshot({
      participants: [
        { applicationId: "same", externalTeamId: null },
        { applicationId: "same", externalTeamId: null },
      ],
    }),
    request({ competitionFormat: "champions-league", leagueMatchesPerTeam: 1, knockoutCutoff: 4 }),
  );
  assert(duplicate.kind === "reject" && duplicate.code === "DUPLICATE_PARTICIPANT", "duplicate participants are rejected");

  const odd = evaluateCompetitionConfigurationSave(
    snapshot({ participants: participants(ids(9)) }),
    request({ competitionFormat: "champions-league", leagueMatchesPerTeam: 3, knockoutCutoff: 4 }),
  );
  assert(odd.kind === "reject" && odd.code === "UNEVEN_MATCH_TOTAL", "odd-team infeasible league is rejected");

  const cutoff = evaluateCompetitionConfigurationSave(
    snapshot(),
    request({ competitionFormat: "champions-league", leagueMatchesPerTeam: 3, knockoutCutoff: 6 }),
  );
  assert(cutoff.kind === "reject" && cutoff.code === "INVALID_KNOCKOUT_CUTOFF", "cutoff 6 is rejected");

  const unplayed = evaluateCompetitionConfigurationSave(
    snapshot({ matches: [{ phase: "group", status: "scheduled", homeScore: null, awayScore: null }] }),
    request(),
  );
  assert(unplayed.kind === "reject" && unplayed.code === "MATCHES_EXIST", "unplayed matches lock a real change");

  const scored = evaluateCompetitionConfigurationSave(
    snapshot({ matches: [{ phase: "group", status: "scheduled", homeScore: 0, awayScore: 0 }] }),
    request(),
  );
  assert(scored.kind === "reject" && scored.code === "RESULTS_EXIST", "a 0:0 result locks a real change");

  const live = evaluateCompetitionConfigurationSave(
    snapshot({ matches: [{ phase: "group", status: "live", homeScore: null, awayScore: null }] }),
    request(),
  );
  assert(live.kind === "reject" && live.code === "LIVE_MATCH", "a live match locks a real change");

  const knockout = evaluateCompetitionConfigurationSave(
    snapshot({ matches: [{ phase: "knockout", status: "scheduled", homeScore: null, awayScore: null }] }),
    request(),
  );
  assert(knockout.kind === "reject" && knockout.code === "KNOCKOUT_MATCHES", "knockout matches lock a real change");

  const completed = evaluateCompetitionConfigurationSave(
    snapshot({ effectiveLifecycle: "completed" }),
    request(),
  );
  assert(completed.kind === "reject" && completed.code === "LIFECYCLE_COMPLETED", "completed tournaments are locked");

  const knockoutStage = evaluateCompetitionConfigurationSave(
    snapshot({ effectiveLifecycle: "knockout_stage" }),
    request(),
  );
  assert(
    knockoutStage.kind === "reject" && knockoutStage.code === "LIFECYCLE_KNOCKOUT",
    "knockout-stage tournaments are locked",
  );

  const legacyGroups = evaluateCompetitionConfigurationSave(
    snapshot({ groupCount: 2 }),
    request({ competitionFormat: "round-robin" }),
  );
  assert(
    legacyGroups.kind === "reject" && legacyGroups.code === "UNSAFE_LEGACY_CONVERSION",
    "a legacy group tournament cannot become round robin",
  );

  const legacyLeague = evaluateCompetitionConfigurationSave(
    snapshot({ groupCount: 1 }),
    request({ competitionFormat: "champions-league", leagueMatchesPerTeam: 3, knockoutCutoff: 4 }),
  );
  assert(
    legacyLeague.kind === "reject" && legacyLeague.code === "UNSAFE_LEGACY_CONVERSION",
    "a legacy group tournament cannot become champions league",
  );

  const manyGroups = evaluateCompetitionConfigurationSave(
    snapshot({
      competitionFormat: "groups-knockout",
      groupCount: 2,
    }),
    request({ competitionFormat: "champions-league", leagueMatchesPerTeam: 3, knockoutCutoff: 4 }),
  );
  assert(
    manyGroups.kind === "reject" && manyGroups.code === "CHAMPIONS_LEAGUE_MULTIPLE_GROUPS",
    "several groups reject champions league",
  );

  const explicitGroups = evaluateCompetitionConfigurationSave(
    snapshot({ groupCount: 2 }),
    request({ competitionFormat: "groups-knockout" }),
  );
  assert(explicitGroups.kind === "write", "recording the existing group mode is a column write");

  const notActivated = evaluateCompetitionConfigurationSave(
    snapshot(),
    request({ competitionFormat: "champions-league", leagueMatchesPerTeam: 3, knockoutCutoff: 4 }),
  );
  assert(
    notActivated.kind === "reject" && notActivated.code === "CHAMPIONS_LEAGUE_SAVE_NOT_ACTIVATED",
    "a valid empty champions league configuration is not written",
  );

  const unchanged = evaluateCompetitionConfigurationSave(snapshot(), request({ competitionFormat: null }));
  assert(unchanged.kind === "unchanged", "an identical legacy configuration is a no-op");

  const stale = evaluateCompetitionConfigurationSave(
    snapshot(),
    request({ competitionFormat: null, expectedUpdatedAt: "2026-11-21T09:00:00.000Z" }),
  );
  assert(stale.kind === "reject" && stale.status === "stale_configuration", "an unchanged request is version-checked");

  const roundRobin = evaluateCompetitionConfigurationSave(snapshot(), request());
  assert(
    roundRobin.kind === "write" && roundRobin.columns.competitionFormat === "round-robin",
    "explicit round robin with no groups can be written",
  );

  const calls: { authorize: number; load: number; update: number; revalidate: number } = {
    authorize: 0,
    load: 0,
    update: 0,
    revalidate: 0,
  };
  const deps = (overrides: Partial<CompetitionConfigurationSaveDeps> = {}): CompetitionConfigurationSaveDeps => ({
    authorize: async () => {
      calls.authorize += 1;
      return "ok";
    },
    load: async () => {
      calls.load += 1;
      return { status: "ok", snapshot: snapshot() };
    },
    updateColumns: async () => {
      calls.update += 1;
      return attempt({ rows: [proved(storedColumns("round-robin"))] });
    },
    revalidate: () => {
      calls.revalidate += 1;
    },
    ...overrides,
  });

  return Promise.resolve()
    .then(async () => {
      let expectedUpdates = 0;
      let expectedRevalidates = 0;

      const forbidden = await executeCompetitionConfigurationSave(
        deps({
          authorize: async () => "forbidden",
          load: async () => {
            throw new Error("load must not run");
          },
          updateColumns: async () => {
            throw new Error("update must not run");
          },
        }),
        { tournamentId: "tournament-1", ...request() },
      );
      assert(forbidden.status === "forbidden" && forbidden.code === "FORBIDDEN", "missing permission fails closed");

      const league = await executeCompetitionConfigurationSave(deps(), {
        tournamentId: "tournament-1",
        ...request({ competitionFormat: "champions-league", leagueMatchesPerTeam: 3, knockoutCutoff: 4 }),
      });
      assert(
        league.status === "not_activated" &&
          calls.update === expectedUpdates &&
          calls.revalidate === expectedRevalidates,
        "inactive league save does not write",
      );

      const same = await executeCompetitionConfigurationSave(deps(), {
        tournamentId: "tournament-1",
        ...request({ competitionFormat: null }),
      });
      assert(same.status === "unchanged" && calls.update === expectedUpdates, "unchanged configuration does not write");

      const locked = await executeCompetitionConfigurationSave(
        deps({
          load: async () => ({
            status: "ok",
            snapshot: snapshot({
              matches: [{ phase: "group", status: "scheduled", homeScore: null, awayScore: null }],
            }),
          }),
        }),
        { tournamentId: "tournament-1", ...request() },
      );
      assert(
        locked.status === "config_locked" && locked.code === "MATCHES_EXIST" && calls.update === expectedUpdates,
        "existing matches do not write",
      );

      const saved = await executeCompetitionConfigurationSave(deps(), {
        tournamentId: "tournament-1",
        ...request(),
      });
      expectedUpdates += 1;
      expectedRevalidates += 1;
      assert(
        saved.status === "success" &&
          saved.updatedAt === "2026-11-21T10:00:01.000Z" &&
          calls.update === expectedUpdates &&
          calls.revalidate === expectedRevalidates,
        "a proved row is success",
      );

      const updatesBeforeMissingColumns = expectedUpdates;
      const missing = await executeCompetitionConfigurationSave(
        deps({
          load: async () => ({ status: "missing_columns" }),
        }),
        { tournamentId: "tournament-1", ...request() },
      );
      assert(
        missing.status === "missing_columns" && calls.update === updatesBeforeMissingColumns,
        "missing columns stop before the write",
      );

      const columnError = interpretConditionalTournamentUpdate({
        tournamentId: "tournament-1",
        expectedUpdatedAt: VERSION,
        columns: storedColumns("round-robin"),
        attempt: attempt({ error: { code: "42703", message: "column competition_format does not exist" } }),
      });
      assert(columnError.status === "missing_columns", "a missing-column write error is not success");

      const raced = interpretConditionalTournamentUpdate({
        tournamentId: "tournament-1",
        expectedUpdatedAt: VERSION,
        columns: storedColumns("round-robin"),
        attempt: attempt({
          rows: [],
          reread: { found: true, updatedAt: "2026-11-21T10:05:00.000Z" },
        }),
      });
      assert(raced.status === "stale_configuration", "a concurrent version change is stale");

      const ambiguous = interpretConditionalTournamentUpdate({
        tournamentId: "tournament-1",
        expectedUpdatedAt: VERSION,
        columns: storedColumns("round-robin"),
        attempt: attempt({ rows: [], reread: { found: true, updatedAt: VERSION } }),
      });
      assert(
        ambiguous.status === "forbidden" && ambiguous.code === "RLS_WRITE_DENIED",
        "zero rows at the same version are forbidden, not success",
      );

      const unreadable = interpretConditionalTournamentUpdate({
        tournamentId: "tournament-1",
        expectedUpdatedAt: VERSION,
        columns: storedColumns("round-robin"),
        attempt: attempt({ rows: [], reread: null }),
      });
      assert(
        unreadable.status === "persistence_error" && unreadable.code === "ZERO_ROW_UPDATE",
        "a zero-row update without a reread is not success",
      );

      const gone = interpretConditionalTournamentUpdate({
        tournamentId: "tournament-1",
        expectedUpdatedAt: VERSION,
        columns: storedColumns("round-robin"),
        attempt: attempt({ rows: [], reread: { found: false, updatedAt: null } }),
      });
      assert(gone.status === "not_found", "a vanished row is not success");

      const unproved = interpretConditionalTournamentUpdate({
        tournamentId: "tournament-1",
        expectedUpdatedAt: VERSION,
        columns: storedColumns("round-robin"),
        attempt: attempt({ rows: [proved(storedColumns("groups-knockout"))] }),
      });
      assert(unproved.status === "persistence_error" && unproved.code === "UPDATE_NOT_PROVED", "a mismatched row is not success");

      const action = read("src/lib/db/competition-config-actions.ts");
      const admin = read("src/lib/db/admin-actions.ts");
      const form = read("src/components/admin/TournamentAdminForm.tsx");
      const board = read("src/components/admin/TournamentScheduleBoard.tsx");
      const prepare = read("src/lib/db/plan-preview-prepare.ts");
      const apply = read("src/lib/db/plan-apply-actions.ts");
      const schedule = read("src/lib/db/schedule-actions.ts");
      const persist = read("src/lib/db/plan-schedule-persist.ts");

      assert(action.includes("requireScheduleManage()") && action.includes("requireTournamentsManage()"), "both permissions are checked");
      assert(action.includes('.eq("updated_at", input.expectedUpdatedAt)'), "the write is conditional on updated_at");
      assert(
        action.includes("competition_format: input.columns.competitionFormat") &&
          action.includes("league_matches_per_team: input.columns.leagueMatchesPerTeam") &&
          action.includes("knockout_cutoff: input.columns.knockoutCutoff"),
        "the write names only the three configuration columns",
      );
      assert(!action.includes(".insert(") && !action.includes(".delete("), "the save action does not insert or delete");
      assert(!action.includes("play_format") && !action.includes("playFormat"), "public display text is not a save input");
      assert(!action.includes("persistPreparedGroupSchedule") && !action.includes("prepareTournamentPlanFromDb"), "generation stays outside the save");
      assert(!form.includes("saveCompetitionConfigurationAction") && !form.includes("competition_format"), "the edit form does not save competition columns");
      assert(!board.includes("saveCompetitionConfigurationAction"), "the schedule board does not call the save");
      assert(admin.includes("play_format: parseOptionalText(input.playFormat)") && admin.includes(".update(parsed.value)"), "tournament edit still writes its own payload");
      assert(!admin.includes("competition_format") && !admin.includes("saveCompetitionConfigurationAction"), "tournament edit does not write competition columns");
      assert(prepare.includes("resolveGenerationMode") && prepare.includes("readStoredCompetitionFormat"), "generation reads the stored competition mode before preview");
      const loaderEnd = prepare.indexOf("export async function prepareTournamentPlanFromDb");
      const loader = prepare.slice(prepare.indexOf("async function loadTournamentForPlanPreview"), loaderEnd);
      assert(!loader.includes("competition_format"), "the legacy tournament read does not require the new column");
      assert(!apply.includes("competition-config-actions") && !schedule.includes("competition-config-actions"), "generate and apply do not call the save");
      assert(persist.includes("group_id: match.groupKey") && !persist.includes("competition-config-actions"), "match persistence is unchanged");

      return "ok";
    });
}

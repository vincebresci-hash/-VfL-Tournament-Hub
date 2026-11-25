import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHAMPIONS_LEAGUE_CONFIGURATION_SAVE_ACTIVATED } from "@/lib/schedule/competition-config-save-policy";
import {
  decidePersistenceGuard,
  isMissingCompetitionFormatColumnError,
  resolveGenerationMode,
} from "@/lib/schedule/competition-format-guard";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`competition-format-guard-checks: ${message}`);
  }
}

const GROUP_A = "11111111-1111-4111-8111-111111111111";
const GROUP_B = "22222222-2222-4222-8222-222222222222";

export function runCompetitionFormatGuardChecks() {
  assert(CHAMPIONS_LEAGUE_CONFIGURATION_SAVE_ACTIVATED === false, "configuration save stays inactive");

  const legacyEmpty = resolveGenerationMode({ competitionFormat: null, groupCount: 0 });
  assert(legacyEmpty.ok && legacyEmpty.mode === "round-robin", "null format with zero groups stays round robin");

  const legacyGroups = resolveGenerationMode({ competitionFormat: null, groupCount: 2 });
  assert(
    legacyGroups.ok && legacyGroups.mode === "groups-knockout",
    "null format with groups stays groups knockout",
  );

  const explicitRobin = resolveGenerationMode({ competitionFormat: "round-robin", groupCount: 0 });
  assert(explicitRobin.ok && explicitRobin.mode === "round-robin", "explicit round robin with zero groups is allowed");

  const incompatibleRobin = resolveGenerationMode({ competitionFormat: "round-robin", groupCount: 1 });
  assert(
    !incompatibleRobin.ok && incompatibleRobin.code === "FORMAT_GROUP_DISAGREEMENT",
    "explicit round robin with groups fails closed",
  );

  const explicitGroups = resolveGenerationMode({ competitionFormat: "groups-knockout", groupCount: 2 });
  assert(
    explicitGroups.ok && explicitGroups.mode === "groups-knockout",
    "explicit groups knockout with groups is allowed",
  );

  const emptyGroups = resolveGenerationMode({ competitionFormat: "groups-knockout", groupCount: 0 });
  assert(
    !emptyGroups.ok && emptyGroups.code === "groups-knockout-awaiting-groups",
    "explicit groups knockout without groups fails closed",
  );

  for (const groupCount of [0, 1]) {
    const league = resolveGenerationMode({ competitionFormat: "champions-league", groupCount });
    assert(
      !league.ok && league.code === "CHAMPIONS_LEAGUE_GENERATION_BLOCKED",
      `champions league with ${groupCount} groups is blocked`,
    );
  }
  const manyGroups = resolveGenerationMode({ competitionFormat: "champions-league", groupCount: 3 });
  assert(
    !manyGroups.ok && manyGroups.code === "CHAMPIONS_LEAGUE_MULTIPLE_GROUPS",
    "champions league with multiple groups fails closed",
  );

  const invalid = resolveGenerationMode({ competitionFormat: "Gruppenphase und KO", groupCount: 0 });
  assert(!invalid.ok && invalid.code === "INVALID_COMPETITION_FORMAT", "an invalid stored token fails closed");

  assert(
    isMissingCompetitionFormatColumnError({
      code: "42703",
      message: 'column "competition_format" of relation "tournaments" does not exist',
    }) &&
      isMissingCompetitionFormatColumnError({
        code: "PGRST204",
        message: "Could not find the 'competition_format' column of 'tournaments' in the schema cache",
      }),
    "only a missing competition_format column uses the legacy fallback",
  );
  assert(
    !isMissingCompetitionFormatColumnError({ code: "42501", message: "permission denied for table tournaments" }) &&
      !isMissingCompetitionFormatColumnError({
        code: "42P01",
        message: 'relation "tournaments" does not exist',
      }) &&
      !isMissingCompetitionFormatColumnError({
        code: "42703",
        message: 'column "slug" does not exist',
      }) &&
      !isMissingCompetitionFormatColumnError({
        code: "PGRST204",
        message: "Could not find the 'slug' column of 'tournaments' in the schema cache",
      }) &&
      !isMissingCompetitionFormatColumnError(null),
    "unrelated database failures are not a missing competition column",
  );

  const preMigration = decidePersistenceGuard({
    previewMode: "groups-knockout",
    groupKeys: [GROUP_A, GROUP_B],
    formatRead: { status: "missing_column" },
    groupCount: 2,
    knownGroupIds: [GROUP_A, GROUP_B],
  });
  assert(preMigration.allowDelete, "a pre-migration groups tournament can still replace its group schedule");

  const legacyReadError = decidePersistenceGuard({
    previewMode: "round-robin",
    groupKeys: [GROUP_A],
    formatRead: { status: "error", message: "permission denied for table tournaments" },
    groupCount: 0,
    knownGroupIds: [],
  });
  assert(
    !legacyReadError.allowDelete && legacyReadError.code === "COMPETITION_FORMAT_READ_FAILED",
    "an unrelated format read failure does not fall back to legacy generation",
  );

  let deleted = false;
  const leaguePreview = decidePersistenceGuard({
    previewMode: "champions-league",
    groupKeys: ["league"],
    formatRead: { status: "ok", competitionFormat: "champions-league" },
    groupCount: 0,
    knownGroupIds: [],
  });
  if (leaguePreview.allowDelete) {
    deleted = true;
  }
  assert(
    !leaguePreview.allowDelete && leaguePreview.code === "CHAMPIONS_LEAGUE_PREVIEW" && !deleted,
    "a champions league preview does not reach delete",
  );

  const virtualKey = decidePersistenceGuard({
    previewMode: "groups-knockout",
    groupKeys: ["league"],
    formatRead: { status: "ok", competitionFormat: null },
    groupCount: 1,
    knownGroupIds: [GROUP_A],
  });
  assert(
    !virtualKey.allowDelete && virtualKey.code === "VIRTUAL_LEAGUE_GROUP",
    "the virtual league key is rejected before delete",
  );

  const syntheticKey = decidePersistenceGuard({
    previewMode: "round-robin",
    groupKeys: ["g1"],
    formatRead: { status: "missing_column" },
    groupCount: 0,
    knownGroupIds: [],
  });
  assert(
    !syntheticKey.allowDelete && syntheticKey.code === "INVALID_GROUP_KEY",
    "a non-uuid group key is rejected before delete",
  );

  const foreignKey = decidePersistenceGuard({
    previewMode: "groups-knockout",
    groupKeys: [GROUP_B],
    formatRead: { status: "ok", competitionFormat: "groups-knockout" },
    groupCount: 1,
    knownGroupIds: [GROUP_A],
  });
  assert(!foreignKey.allowDelete && foreignKey.code === "UNKNOWN_GROUP_KEY", "an unknown group uuid is rejected");

  const storedLeague = decidePersistenceGuard({
    previewMode: "round-robin",
    groupKeys: [GROUP_A],
    formatRead: { status: "ok", competitionFormat: "champions-league" },
    groupCount: 0,
    knownGroupIds: [GROUP_A],
  });
  assert(
    !storedLeague.allowDelete && storedLeague.code === "CHAMPIONS_LEAGUE_GENERATION_BLOCKED",
    "a stored champions league format blocks delete even when the preview mode differs",
  );

  const prepare = read("src/lib/db/plan-preview-prepare.ts");
  const persist = read("src/lib/db/plan-schedule-persist.ts");
  const guard = read("src/lib/schedule/competition-format-guard.ts");
  const apply = read("src/lib/db/plan-apply-actions.ts");
  const schedule = read("src/lib/db/schedule-actions.ts");
  const loader = prepare.slice(
    prepare.indexOf("async function loadTournamentForPlanPreview"),
    prepare.indexOf("export async function prepareTournamentPlanFromDb"),
  );
  assert(!loader.includes("competition_format"), "legacy tournament loading does not require the new column");
  assert(
    prepare.includes('formatRead.status === "missing_column" ? null') &&
      prepare.indexOf("resolveGenerationMode") < prepare.indexOf("buildTournamentPlanPreview"),
    "missing column falls back to null before preview generation",
  );
  assert(
    persist.indexOf("decidePersistenceGuard") >= 0 &&
      persist.indexOf("decidePersistenceGuard") < persist.indexOf(".delete("),
    "persistence guard runs before delete",
  );
  assert(
    !guard.includes(".insert(") && !guard.includes(".update(") && !guard.includes(".delete(") && !guard.includes("supabase"),
    "the pure guard does not write",
  );
  assert(
    apply.includes("prepareTournamentPlanFromDb") &&
      apply.includes("persistPreparedGroupSchedule") &&
      schedule.includes("prepareTournamentPlanFromDb") &&
      schedule.includes("persistPreparedGroupSchedule"),
    "generate and apply still use the guarded prepare and persist path",
  );
  assert(
    !read("src/components/admin/TournamentScheduleBoard.tsx").includes("saveCompetitionConfigurationAction") &&
      !read("src/components/admin/TournamentAdminForm.tsx").includes("saveCompetitionConfigurationAction"),
    "the admin UI still does not call the configuration save",
  );

  return "ok";
}

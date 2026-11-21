import { readFileSync } from "node:fs";
import { join } from "node:path";
import { savedCompetitionMode } from "@/lib/schedule/league-admin-preview";
import {
  inferLegacyCompetitionMode,
  parseCompetitionFormat,
  resolveStoredCompetitionTopology,
  validateChampionsLeagueConfiguration,
  validateConfirmedParticipantIdentities,
  validateStoredCompetitionColumns,
  type ConfirmedParticipantIdentity,
} from "@/lib/schedule/competition-config";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`competition-config-checks: ${message}`);
  }
}

function participants(ids: readonly string[]): ConfirmedParticipantIdentity[] {
  return ids.map((id) => ({ applicationId: id, externalTeamId: null }));
}

function ids(count: number) {
  return Array.from({ length: count }, (_, index) => `team-${index + 1}`);
}

export function runCompetitionConfigChecks() {
  const parsedNull = parseCompetitionFormat(null);
  assert(parsedNull.ok && parsedNull.format === null, "null format stays legacy");
  assert(
    !parseCompetitionFormat("Champions League").ok &&
      !parseCompetitionFormat("Gruppenphase und KO").ok &&
      !parseCompetitionFormat("round robin").ok,
    "public display text is not a competition format",
  );
  assert(
    parseCompetitionFormat("round-robin").ok &&
      parseCompetitionFormat("groups-knockout").ok &&
      parseCompetitionFormat("champions-league").ok,
    "explicit stored formats parse",
  );

  assert(inferLegacyCompetitionMode(0) === "round-robin", "no groups stay round robin");
  assert(inferLegacyCompetitionMode(1) === "groups-knockout", "one group stays groups-knockout");
  assert(inferLegacyCompetitionMode(4) === "groups-knockout", "several groups stay groups-knockout");
  assert(
    inferLegacyCompetitionMode(0) === savedCompetitionMode(0) &&
      inferLegacyCompetitionMode(3) === savedCompetitionMode(3),
    "legacy inference matches the current scheduler",
  );

  const legacyRoundRobin = resolveStoredCompetitionTopology({ competitionFormat: null, groupCount: 0 });
  assert(
    legacyRoundRobin.ok &&
      legacyRoundRobin.state === "legacy-round-robin" &&
      legacyRoundRobin.effectiveMode === "round-robin" &&
      legacyRoundRobin.generationReady &&
      legacyRoundRobin.leagueGroupVerified === false,
    "null format with no groups is legacy round robin",
  );
  const legacyGroups = resolveStoredCompetitionTopology({ competitionFormat: null, groupCount: 2 });
  assert(
    legacyGroups.ok &&
      legacyGroups.state === "legacy-groups-knockout" &&
      legacyGroups.effectiveMode === "groups-knockout" &&
      legacyGroups.generationReady,
    "null format with groups is legacy groups-knockout",
  );
  const explicitRoundRobin = resolveStoredCompetitionTopology({
    competitionFormat: "round-robin",
    groupCount: 0,
  });
  assert(
    explicitRoundRobin.ok && explicitRoundRobin.state === "explicit-round-robin" && explicitRoundRobin.generationReady,
    "explicit round robin without groups is ready",
  );
  const roundRobinWithGroups = resolveStoredCompetitionTopology({
    competitionFormat: "round-robin",
    groupCount: 1,
  });
  assert(
    !roundRobinWithGroups.ok && roundRobinWithGroups.code === "FORMAT_GROUP_DISAGREEMENT",
    "explicit round robin disagrees with existing groups",
  );
  const awaitingGroups = resolveStoredCompetitionTopology({
    competitionFormat: "groups-knockout",
    groupCount: 0,
  });
  assert(
    awaitingGroups.ok &&
      awaitingGroups.state === "groups-knockout-awaiting-groups" &&
      awaitingGroups.effectiveMode === "groups-knockout" &&
      !awaitingGroups.generationReady,
    "explicit groups-knockout without groups is not ready to generate",
  );
  const explicitGroups = resolveStoredCompetitionTopology({
    competitionFormat: "groups-knockout",
    groupCount: 2,
  });
  assert(
    explicitGroups.ok && explicitGroups.state === "explicit-groups-knockout" && explicitGroups.generationReady,
    "explicit groups-knockout with groups stays ready",
  );
  const configurationOnly = resolveStoredCompetitionTopology({
    competitionFormat: "champions-league",
    groupCount: 0,
  });
  assert(
    configurationOnly.ok &&
      configurationOnly.state === "champions-league-configuration-only" &&
      !configurationOnly.generationReady &&
      configurationOnly.leagueGroupVerified === false,
    "champions league without a group is configuration only",
  );
  const unverifiedGroup = resolveStoredCompetitionTopology({
    competitionFormat: "champions-league",
    groupCount: 1,
  });
  assert(
    unverifiedGroup.ok &&
      unverifiedGroup.state === "champions-league-unverified-group" &&
      !unverifiedGroup.generationReady &&
      unverifiedGroup.leagueGroupVerified === false,
    "one group is not treated as a verified league group",
  );
  const multipleGroups = resolveStoredCompetitionTopology({
    competitionFormat: "champions-league",
    groupCount: 2,
  });
  assert(
    !multipleGroups.ok && multipleGroups.code === "CHAMPIONS_LEAGUE_MULTIPLE_GROUPS",
    "champions league disagrees with several groups",
  );
  assert(
    !resolveStoredCompetitionTopology({ competitionFormat: null, groupCount: -1 }).ok &&
      !resolveStoredCompetitionTopology({ competitionFormat: "champions-league", groupCount: 1.5 }).ok,
    "fractional or negative group counts are rejected",
  );

  const legacyColumns = validateStoredCompetitionColumns({
    competitionFormat: null,
    leagueMatchesPerTeam: null,
    knockoutCutoff: null,
  });
  assert(legacyColumns.ok && legacyColumns.columns.competitionFormat === null, "legacy columns stay empty");
  const championsColumns = validateStoredCompetitionColumns({
    competitionFormat: "champions-league",
    leagueMatchesPerTeam: 3,
    knockoutCutoff: 4,
  });
  assert(championsColumns.ok, "complete champions league columns are accepted");
  assert(
    !validateStoredCompetitionColumns({
      competitionFormat: "champions-league",
      leagueMatchesPerTeam: null,
      knockoutCutoff: 4,
    }).ok,
    "champions league rejects a missing parameter",
  );
  assert(
    !validateStoredCompetitionColumns({
      competitionFormat: "round-robin",
      leagueMatchesPerTeam: 3,
      knockoutCutoff: null,
    }).ok,
    "round robin rejects league parameters",
  );
  const zeroMatches = validateStoredCompetitionColumns({
    competitionFormat: "champions-league",
    leagueMatchesPerTeam: 0,
    knockoutCutoff: 4,
  });
  const cutoffSix = validateStoredCompetitionColumns({
    competitionFormat: "champions-league",
    leagueMatchesPerTeam: 3,
    knockoutCutoff: 6,
  });
  assert(
    !zeroMatches.ok &&
      zeroMatches.code === "INVALID_LEAGUE_MATCHES_PER_TEAM" &&
      !cutoffSix.ok &&
      cutoffSix.code === "INVALID_KNOCKOUT_CUTOFF",
    "column bounds reject out-of-range numbers",
  );

  const duplicate = validateConfirmedParticipantIdentities([
    { applicationId: "a", externalTeamId: null },
    { applicationId: "a", externalTeamId: null },
  ]);
  assert(!duplicate.ok && duplicate.code === "DUPLICATE_PARTICIPANT", "duplicate participants are rejected");
  const bothIdentities = validateConfirmedParticipantIdentities([
    { applicationId: "a", externalTeamId: "ext" },
  ]);
  assert(!bothIdentities.ok && bothIdentities.code === "INVALID_PARTICIPANT_IDENTITY", "mixed identities are rejected");
  const neitherIdentity = validateConfirmedParticipantIdentities([
    { applicationId: null, externalTeamId: "   " },
  ]);
  assert(!neitherIdentity.ok && neitherIdentity.code === "INVALID_PARTICIPANT_IDENTITY", "blank identities are rejected");
  const ordered = validateConfirmedParticipantIdentities([
    { applicationId: null, externalTeamId: "b" },
    { applicationId: "a", externalTeamId: null },
  ]);
  assert(ordered.ok && ordered.participantIds.join(",") === "a,b", "valid identities stay explicit and ordered");

  const missing = validateChampionsLeagueConfiguration({
    matchesPerTeam: null,
    knockoutCutoff: 4,
    participants: participants(ids(8)),
  });
  assert(!missing.ok && missing.code === "MISSING_LEAGUE_PARAMETERS", "missing league parameters are rejected");
  const badCutoff = validateChampionsLeagueConfiguration({
    matchesPerTeam: 3,
    knockoutCutoff: 6,
    participants: participants(ids(8)),
  });
  assert(!badCutoff.ok && badCutoff.code === "INVALID_KNOCKOUT_CUTOFF", "cutoff 6 is rejected");
  const uneven = validateChampionsLeagueConfiguration({
    matchesPerTeam: 3,
    knockoutCutoff: 4,
    participants: participants(ids(9)),
  });
  assert(!uneven.ok && uneven.code === "UNEVEN_MATCH_TOTAL", "9 x 3 is rejected");
  const tooSmall = validateChampionsLeagueConfiguration({
    matchesPerTeam: 2,
    knockoutCutoff: 8,
    participants: participants(ids(6)),
  });
  assert(!tooSmall.ok && tooSmall.code === "CUTOFF_EXCEEDS_TEAMS", "six teams cannot fill top 8");
  const eight = validateChampionsLeagueConfiguration({
    matchesPerTeam: 3,
    knockoutCutoff: 4,
    participants: participants(ids(8)),
  });
  const twelve = validateChampionsLeagueConfiguration({
    matchesPerTeam: 5,
    knockoutCutoff: 8,
    participants: participants(ids(12)),
  });
  const nine = validateChampionsLeagueConfiguration({
    matchesPerTeam: 4,
    knockoutCutoff: 4,
    participants: participants(ids(9)),
  });
  assert(
    eight.ok && eight.config.expectedLeagueMatchCount === 12 &&
      twelve.ok && twelve.config.expectedLeagueMatchCount === 30 &&
      nine.ok && nine.config.expectedLeagueMatchCount === 18,
    "8 x 3, 12 x 5 and 9 x 4 stay valid",
  );
  const invalidIdentity = validateChampionsLeagueConfiguration({
    matchesPerTeam: 3,
    knockoutCutoff: 4,
    participants: [{ applicationId: "a", externalTeamId: "ext" }],
  });
  assert(!invalidIdentity.ok && invalidIdentity.code === "INVALID_PARTICIPANT_IDENTITY", "league validation rejects a mixed identity");

  const migration = read("supabase/migrations/20261121121000_champions_league_competition_config.sql");
  assert(
    migration.includes("ADD COLUMN IF NOT EXISTS competition_format text") &&
      migration.includes("ADD COLUMN IF NOT EXISTS league_matches_per_team integer") &&
      migration.includes("ADD COLUMN IF NOT EXISTS knockout_cutoff integer") &&
      migration.includes("'round-robin', 'groups-knockout', 'champions-league'") &&
      migration.includes("league_matches_per_team >= 1 AND league_matches_per_team <= 64") &&
      migration.includes("knockout_cutoff IS NULL OR knockout_cutoff IN (4, 8)") &&
      migration.includes("competition_format IS DISTINCT FROM 'champions-league'") &&
      migration.includes("COMMENT ON COLUMN public.tournaments.competition_format") &&
      !migration.includes("DEFAULT") &&
      !migration.includes("UPDATE") &&
      !migration.includes("CREATE TYPE") &&
      !migration.includes("play_format") &&
      !migration.includes("tournament_matches") &&
      !migration.includes("tournament_groups"),
    "migration is additive, nullable, and does not touch existing rows or play_format",
  );

  const configSource = read("src/lib/schedule/competition-config.ts");
  assert(
    !configSource.includes("play_format") &&
      !configSource.includes("playFormat") &&
      !configSource.includes("supabase") &&
      !configSource.includes("use server") &&
      !configSource.includes(".insert(") &&
      !configSource.includes(".update(") &&
      !configSource.includes(".delete("),
    "configuration helper does not read play_format and does not write",
  );

  const prepare = read("src/lib/db/plan-preview-prepare.ts");
  const persist = read("src/lib/db/plan-schedule-persist.ts");
  const apply = read("src/lib/db/plan-apply-actions.ts");
  const scheduleActions = read("src/lib/db/schedule-actions.ts");
  const adminActions = read("src/lib/db/admin-actions.ts");
  assert(
    prepare.includes('mode: groups.length > 0 ? "groups-knockout" : "round-robin"') &&
      !prepare.includes("champions-league") &&
      !prepare.includes("competition_format") &&
      !prepare.includes("competition-config"),
    "saved preview inference is unchanged",
  );
  assert(
    persist.includes("group_id: match.groupKey") &&
      !persist.includes("champions-league") &&
      !persist.includes("competition-config") &&
      !persist.includes('groupKey === "league"') &&
      !persist.includes("groupKey !== \"league\""),
    "existing persist still copies groupKey and does not know a virtual league key",
  );
  assert(
    apply.includes("persistPreparedGroupSchedule") &&
      apply.includes("prepareTournamentPlanFromDb") &&
      !apply.includes("competition-config") &&
      !apply.includes("buildChampionsLeagueAdminPreview") &&
      scheduleActions.includes("prepareTournamentPlanFromDb") &&
      scheduleActions.includes("persistPreparedGroupSchedule") &&
      !scheduleActions.includes("competition-config") &&
      !scheduleActions.includes("buildChampionsLeagueAdminPreview"),
    "generate and apply still persist only the server-prepared legacy plan",
  );
  assert(
    adminActions.includes("play_format: parseOptionalText(input.playFormat)") &&
      adminActions.includes(".update(parsed.value)") &&
      !adminActions.includes("competition_format") &&
      !adminActions.includes("league_matches_per_team") &&
      !adminActions.includes("knockout_cutoff"),
    "public tournament edit does not write the new columns",
  );
  assert(
    !read("src/components/admin/TournamentAdminForm.tsx").includes("competition_format") &&
      !read("src/components/admin/TournamentScheduleBoard.tsx").includes("competition-config") &&
      !read("src/lib/schedule/standings.ts").includes("competition-config") &&
      !read("src/lib/schedule/knockout.ts").includes("competition-config") &&
      !read("src/lib/schedule/tournament-lifecycle.ts").includes("competition-config"),
    "forms, standings, knockout and lifecycle do not read the new configuration module",
  );

  return "ok";
}

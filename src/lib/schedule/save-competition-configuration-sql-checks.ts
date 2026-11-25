/**
 * Static checks for the unapplied configuration-save migration and the
 * disposable PostgreSQL runner. This file does not open a database connection.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHAMPIONS_LEAGUE_CONFIGURATION_SAVE_ACTIVATED } from "@/lib/schedule/competition-config-save-policy";

function read(path: string) {
  return readFileSync(path, "utf8");
}

export function runSaveCompetitionConfigurationSqlChecks() {
  const migration = read("supabase/migrations/20261121124500_save_competition_configuration.sql");
  const columns = read("supabase/migrations/20261121121000_champions_league_competition_config.sql");
  const remediation = read(
    "supabase/migrations/20261125190218_champions_league_release_blocker_remediation.sql",
  );
  const tests = read("supabase/tests/save_competition_configuration.sql");
  const action = read("src/lib/db/competition-config-actions.ts");
  const board = read("src/components/admin/TournamentScheduleBoard.tsx");
  const prepare = read("src/lib/db/plan-preview-prepare.ts");
  const persist = read("src/lib/db/plan-schedule-persist.ts");
  const saveFunction = migration.slice(
    migration.indexOf("FUNCTION public.save_competition_configuration"),
    migration.indexOf("REVOKE ALL ON FUNCTION public.competition_config_result"),
  );

  assert(columns.includes("ADD COLUMN IF NOT EXISTS competition_format text"), "column migration remains additive");
  assert(!columns.includes("save_competition_configuration"), "column migration does not gain the save function");
  assert(
    migration.includes("20261121121000_champions_league_competition_config.sql"),
    "application order names the column migration",
  );
  assert(migration.includes("competition columns are not present"), "missing columns fail the migration");
  assert(migration.includes("SECURITY DEFINER"), "definer rights are explicit");
  assert(migration.includes("SET search_path = public"), "search_path is pinned");
  assert(migration.includes("auth.uid() IS NULL"), "anonymous callers are rejected");
  assert(
    migration.includes("public.has_rbac_permission('tournaments.manage')") &&
      migration.includes("public.has_rbac_permission('schedule.manage')"),
    "both permissions are required",
  );
  assert(
    migration.indexOf("auth.uid() IS NULL") < migration.indexOf("FROM public.applications"),
    "authorization happens before application reads",
  );
  assert(migration.includes("FOR UPDATE"), "the tournament row is locked");
  assert(saveFunction.includes("not_activated"), "champions-league is rejected in the database");
  assert(saveFunction.includes("CHAMPIONS_LEAGUE_SAVE_NOT_ACTIVATED"), "kill switch has a stable code");
  assert(!saveFunction.includes("DELETE FROM public.tournament_matches"), "the save does not delete matches");
  assert(!saveFunction.includes("INSERT INTO public.tournament_matches"), "the save does not insert matches");
  assert(!saveFunction.includes("DELETE FROM public.tournament_groups"), "the save does not delete groups");
  assert(saveFunction.includes("competition_format = v_requested_format"), "only competition columns are assigned");
  assert(!saveFunction.includes("contact_email"), "application contact data is not selected");
  assert(migration.includes("DUPLICATE_PARTICIPANT"), "duplicate identities fail");
  assert(migration.includes("INVALID_PARTICIPANT_IDENTITY"), "malformed identities fail");
  assert(migration.includes("ARCHIVED"), "archived tournaments are rejected");
  assert(migration.includes("UNSAFE_LEGACY_CONVERSION"), "legacy group tournaments stay protected");
  assert(migration.includes("BEFORE INSERT OR DELETE OR UPDATE OF status, tournament_id"), "application writes coordinate");
  assert(
    migration.includes("BEFORE INSERT OR DELETE OR UPDATE OF participation_status, external_active, application_id, tournament_id"),
    "external-team writes coordinate",
  );
  assert(migration.includes("BEFORE INSERT OR DELETE OR UPDATE OF tournament_id"), "group moves coordinate");
  assert(
    migration.includes("BEFORE INSERT OR DELETE OR UPDATE OF group_id, application_id, external_team_id"),
    "membership writes coordinate",
  );
  assert(
    migration.includes("CREATE TRIGGER competition_config_lock_match") &&
      migration.includes("ON public.tournament_matches"),
    "match writes coordinate",
  );
  assert(migration.includes("p_first < p_second"), "cross-tournament locks use a fixed order");
  assert(
    migration.includes("REVOKE ALL ON FUNCTION public.competition_config_lock_tournaments(uuid, uuid) FROM PUBLIC"),
    "the lock helper is not granted to API roles",
  );
  assert(
    migration.includes("GRANT EXECUTE ON FUNCTION public.save_competition_configuration(uuid, timestamptz, text, integer, integer) TO authenticated"),
    "the save function is granted only to authenticated users",
  );
  assert(!migration.includes("TO anon, authenticated;"), "the save function is not granted to anon");
  assert(
    remediation.includes("a.attrelid = 'public.tournaments'::regclass") &&
      remediation.includes("v_type <> 'text'::regtype") &&
      remediation.includes("v_type <> 'integer'::regtype") &&
      remediation.includes("v_type <> 'boolean'::regtype") &&
      remediation.includes("v_default IS NOT NULL"),
    "the additive remediation checks exact column type, nullability and defaults",
  );
  assert(
    remediation.includes("conrelid = 'public.tournaments'::regclass") &&
      remediation.includes("conname = 'tournaments_competition_format_check'"),
    "constraint checks are table-qualified instead of conname-only",
  );
  assert(
    remediation.includes("UPDATE OF status, tournament_id, club_id") &&
      remediation.includes(
        "UPDATE OF participation_status, external_active, application_id, tournament_id, club_id",
      ),
    "club identity changes participate in the parent tournament lock contract",
  );
  assert(
    remediation.includes("MISSING_CLUB_IDENTITY") &&
      remediation.indexOf("MISSING_CLUB_IDENTITY") <
        remediation.indexOf(
          "RETURN public.apply_champions_league_league_phase_validated_core_v1",
        ),
    "missing club identities fail before the private mutation core",
  );
  assert(
    remediation.includes("aclexplode") &&
      remediation.includes("REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I") &&
      remediation.includes("TO authenticated"),
    "retained RPC ACLs are removed before the intended authenticated-only grant",
  );
  assert(
    remediation.includes("SET lock_timeout = '5s'") &&
      remediation.includes("The production application state") &&
      !remediation.includes("db push"),
    "the migration bounds lock waits and records the unknown production application state",
  );
  assert(CHAMPIONS_LEAGUE_CONFIGURATION_SAVE_ACTIVATED === false, "the TypeScript kill switch stays off");
  assert(!action.includes("save_competition_configuration"), "the live save action does not call the RPC");
  assert(!board.includes("save_competition_configuration"), "the admin UI does not call the RPC");
  assert(!prepare.includes("save_competition_configuration"), "preview generation does not call the RPC");
  assert(!persist.includes("save_competition_configuration"), "schedule persistence does not call the RPC");
  assert(tests.includes("app.disposable_competition_test"), "database tests refuse a normal session");
  assert(tests.includes("RAISE EXCEPTION"), "database tests fail closed");
  assert(tests.includes("INSERT INTO public.test_results"), "database tests record executable results");
  const contractNames = [
    "RPC installation and grants",
    "Authorization",
    "Missing permissions",
    "Both required permissions",
    "Archived tournaments",
    "Invalid configuration",
    "Legacy compatibility",
    "No-op and stale versions",
    "No unintended group or match mutation",
    "Champions League database kill switch",
    "Accepted applications",
    "Confirmed external teams",
    "Linked non-accepted applications",
    "Duplicate identities",
    "Existing matches and results",
  ];
  for (const scenario of contractNames) {
    assert(tests.includes(`'${scenario}'`), `contract test executes ${scenario}`);
  }
  const runner = read("scripts/competition-postgres/concurrency.mjs");
  const cluster = read("scripts/competition-postgres/cluster.mjs");
  const apply = read("scripts/competition-postgres/apply.mjs");
  for (const scenario of [
    "Two simultaneous configuration saves",
    "Application acceptance",
    "Application acceptance revocation",
    "External-team confirmation",
    "External-team deactivation",
    "External-team application linking",
    "Group creation",
    "Group deletion",
    "Group membership changes",
    "Match insertion",
    "Match deletion",
    "Result update including 0:0",
    "Tournament archive",
    "Tournament slug update",
    "Schedule replacement",
    "Tournament deletion",
    "Multi-row match update",
    "Cross-tournament match move",
    "Opposite-order cross-tournament deadlock",
    "Lock timeout and safe retry",
  ]) {
    assert(runner.includes(scenario), `concurrency runner executes ${scenario}`);
  }
  assert(runner.includes("40P01"), "deadlock test expects SQLSTATE 40P01");
  assert(runner.includes("55P03"), "lock-timeout test expects SQLSTATE 55P03");
  assert(runner.includes("pg_sleep"), "concurrency tests hold locks with pg_sleep");
  assert(runner.includes("client.query"), "concurrency tests use database queries");
  assert(cluster.includes("127.0.0.1"), "the disposable server listens on localhost");
  assert(cluster.includes("data_directory"), "isolation checks the data directory");
  assert(apply.includes("DROP FUNCTION public.tournament_public_roster(text);"), "roster replay drop is explicit");
  assert(apply.includes("FUNCTION_RETURN_COMPAT_MIGRATIONS"), "roster replay drop is fingerprint-pinned");

  return "ok";
}

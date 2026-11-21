/**
 * Static checks for the unapplied configuration-save migration.
 * These checks do not open a database connection and are not concurrency tests.
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
  assert(CHAMPIONS_LEAGUE_CONFIGURATION_SAVE_ACTIVATED === false, "the TypeScript kill switch stays off");
  assert(!action.includes("save_competition_configuration"), "the live save action does not call the RPC");
  assert(!board.includes("save_competition_configuration"), "the admin UI does not call the RPC");
  assert(!prepare.includes("save_competition_configuration"), "preview generation does not call the RPC");
  assert(!persist.includes("save_competition_configuration"), "schedule persistence does not call the RPC");
  assert(tests.includes("app.disposable_competition_test"), "database tests refuse a normal session");
  for (const scenario of [
    "Authorization",
    "Missing permissions",
    "Archived tournaments",
    "Invalid configuration",
    "Legacy compatibility",
    "Champions League database kill switch",
    "Accepted applications",
    "Confirmed external teams",
    "Linked non-accepted applications",
    "Duplicate identities",
    "Existing matches and results",
    "No-op and stale versions",
    "Concurrent configuration saves",
    "Concurrent application decisions",
    "Concurrent external-team updates",
    "Concurrent group and membership edits",
    "Concurrent match inserts",
    "Concurrent result updates",
    "Deadlock behavior",
    "No unintended group or match mutation",
  ]) {
    assert(tests.includes(scenario), `database test script lists ${scenario}`);
  }

  return "ok";
}

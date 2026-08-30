import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260831210000_rbac_domain_rls_enforcement.sql"),
    "utf8",
  );
}

function readClubActions() {
  return readFileSync(join(process.cwd(), "src/lib/club/actions.ts"), "utf8");
}

export function runRbacDomainRlsChecks() {
  const migration = readMigration();
  const clubActions = readClubActions();

  assert(migration.includes("has_platform_rbac_access"), "platform rbac helper");
  assert(migration.includes("REVOKE ALL ON FUNCTION public.has_rbac_permission"), "revoke anon on has_rbac_permission");
  assert(
    migration.includes("GRANT EXECUTE ON FUNCTION public.has_rbac_permission(text, uuid, uuid) TO authenticated"),
    "grant authenticated on has_rbac_permission",
  );
  assert(
    !migration.includes("GRANT EXECUTE ON FUNCTION public.has_rbac_permission(text, uuid, uuid) TO anon"),
    "has_rbac_permission not granted to anon",
  );

  assert(migration.includes("INSERT INTO public.rbac_user_roles"), "legacy admin backfill");
  assert(migration.includes("r.key = 'ADMIN'"), "admin backfill role");
  assert(migration.includes("r.key = 'SUPER_ADMIN'"), "super admin backfill role");
  assert(migration.includes("ON CONFLICT DO NOTHING"), "idempotent backfill");

  assert(migration.includes("tournaments_write_admin"), "tournaments policy");
  assert(migration.includes("has_rbac_permission('tournaments.manage')"), "tournaments manage permission");
  assert(migration.includes("has_rbac_permission('applications.view'"), "applications view permission");
  assert(migration.includes("has_rbac_permission('payments.manage')"), "payments manage permission");
  assert(migration.includes("has_rbac_permission('communications.manage')"), "communications manage permission");
  assert(migration.includes("has_rbac_permission('schedule.manage')"), "schedule manage permission");
  assert(migration.includes("has_rbac_permission('teams.manage'"), "teams manage permission");
  assert(migration.includes("has_rbac_permission('cancellations.view')"), "cancellations view permission");
  assert(migration.includes("has_rbac_permission('news.manage')"), "news manage permission");
  assert(migration.includes("has_rbac_permission('users.manage')"), "users manage permission");

  assert(migration.includes("guard_application_payment_fields"), "payment field trigger");
  assert(migration.includes("protect_profile_columns"), "profile protection trigger");

  assert(migration.includes("preview_communication_recipients"), "communication preview rpc");
  assert(migration.includes("communications.send required"), "communication send rpc guard");

  assert(clubActions.includes("requireClubTeamManage"), "club team manage guard");
  assert(clubActions.includes('requirePermission("teams.manage"'), "teams.manage required for mutations");
  assert(clubActions.includes("createClubTeamAction"), "create team action");
  assert(clubActions.includes("deleteClubTeamAction"), "delete team action");

  return "ok";
}

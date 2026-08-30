import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolvePermissionAccess } from "@/lib/rbac/permissions";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260831220000_rbac_security_definer_hardening.sql",
    ),
    "utf8",
  );
}

function listLatestSecurityDefinerFunctionsWithIsAdmin() {
  const migrationsDir = join(process.cwd(), "supabase/migrations");
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const latest = new Map<string, { file: string; usesIsAdmin: boolean }>();
  const blockPattern = /CREATE OR REPLACE FUNCTION public\.([a-z_0-9]+)\([\s\S]*?\$\$;/g;

  for (const file of files) {
    const source = readFileSync(join(migrationsDir, file), "utf8");
    let match: RegExpExecArray | null;
    while ((match = blockPattern.exec(source)) !== null) {
      const block = match[0];
      if (!block.includes("SECURITY DEFINER")) {
        continue;
      }
      const functionName = match[1] ?? "unknown";
      latest.set(functionName, {
        file,
        usesIsAdmin: block.includes("is_admin()"),
      });
    }
  }

  return [...latest.entries()]
    .filter(([, value]) => value.usesIsAdmin)
    .map(([functionName, value]) => ({ functionName, file: value.file }));
}

const ALLOWED_IS_ADMIN_SECURITY_DEFINER = new Set([
  "is_admin",
  "is_profile_active",
  "is_super_admin",
  "has_platform_rbac_access",
]);

export function runRbacSecurityDefinerChecks() {
  const migration = readMigration();

  assert(
    migration.includes("sync_mein_turnierplan_tournament"),
    "MeinTurnierplan sync RPC hardened",
  );
  assert(
    migration.includes("has_rbac_permission('tournaments.manage')") &&
      migration.includes("has_rbac_permission('schedule.manage')") &&
      migration.includes("has_rbac_permission('results.manage')"),
    "MeinTurnierplan sync requires tournament/schedule/results manage",
  );
  assert(
    !migration.includes("is_admin()"),
    "hardening migration must not use is_admin()",
  );

  assert(
    migration.includes("reserve_application_status_email_send") &&
      migration.includes("applications.decide") &&
      migration.includes("applications.manage"),
    "status email reserve uses application permissions",
  );
  assert(
    migration.includes("release_application_status_email_send"),
    "status email release hardened",
  );

  const leaseMigration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260831250000_status_email_reservation_lease.sql",
    ),
    "utf8",
  );
  assert(
    leaseMigration.includes("claim_application_status_email_send_v2") &&
      leaseMigration.includes("applications.decide") &&
      leaseMigration.includes("applications.manage"),
    "status email v2 claim uses application permissions",
  );
  assert(
    leaseMigration.includes("reserve_application_status_email_send_v2") &&
      leaseMigration.includes("release_application_status_email_send_v2"),
    "status email v2 reserve/release present",
  );
  assert(
    leaseMigration.includes("provider_message_id IS NULL"),
    "release/lease must not delete claimed reservations",
  );
  assert(
    leaseMigration.includes("reservation_id = p_reservation_id"),
    "v2 claim/release must require reservation ownership",
  );
  assert(
    !leaseMigration.includes(
      "CREATE OR REPLACE FUNCTION public.reserve_application_status_email_send(",
    ),
    "lease migration must not alter v1 reserve RPC",
  );

  assert(
    migration.includes("store_secure_access_token") &&
      migration.includes("cancellations.manage") &&
      migration.includes("applications.decide"),
    "cancellation token store scoped to cancellation/application workflow",
  );
  assert(
    migration.includes("decide_cancellation_request") &&
      migration.includes("cancellations.decide"),
    "cancellation decide RPC hardened",
  );
  assert(
    migration.includes("reserve_cancellation_email_send") &&
      migration.includes("current_club_id()"),
    "cancellation email reserve keeps club path",
  );

  assert(
    migration.includes("issue_communication_confirmation_token") &&
      migration.includes("communications.send required"),
    "communication receipt token issuance hardened",
  );
  assert(
    migration.includes("p_require_confirmation") &&
      migration.includes("communications.send required"),
    "C2 initiate_communication_send overload hardened",
  );
  assert(
    migration.includes("communication_confirmation_tokens_admin_select") &&
      migration.includes("communications.view"),
    "confirmation token admin read policy hardened",
  );

  assert(
    migration.includes("REVOKE ALL ON FUNCTION public.sync_mein_turnierplan_tournament") &&
      migration.includes("FROM anon"),
    "sync RPC not granted to anon",
  );
  assert(
    migration.includes("GRANT EXECUTE ON FUNCTION public.reserve_external_cancellation_email_send") ===
      false,
    "external cancellation RPC left untouched in this migration",
  );

  // Negative matrix (app-layer parity with SQL guards)
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["FINANCE_MANAGER"],
      overrides: [],
      permission: "schedule.manage",
    }),
    "FINANCE_MANAGER cannot sync tournaments (schedule.manage blocked)",
  );
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["COMMUNICATION_MANAGER"],
      overrides: [],
      permission: "applications.decide",
    }),
    "COMMUNICATION_MANAGER cannot reserve status emails (applications.decide blocked)",
  );
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["TOURNAMENT_MANAGER"],
      overrides: [],
      permission: "payments.manage",
    }),
    "TOURNAMENT_MANAGER cannot run payment RPCs",
  );
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["APPLICATION_MANAGER"],
      overrides: [],
      permission: "communications.send",
    }),
    "APPLICATION_MANAGER cannot send arbitrary communications",
  );
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["TOURNAMENT_MANAGER"],
      overrides: [],
      permission: "schedule.manage",
    }),
    "TOURNAMENT_MANAGER can sync schedule",
  );
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["APPLICATION_MANAGER"],
      overrides: [],
      permission: "applications.decide",
    }),
    "APPLICATION_MANAGER can reserve status emails",
  );
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["COMMUNICATION_MANAGER"],
      overrides: [],
      permission: "communications.send",
    }),
    "COMMUNICATION_MANAGER can send communications",
  );

  const remainingIsAdminSecurityDefiner = listLatestSecurityDefinerFunctionsWithIsAdmin().filter(
    (hit) => !ALLOWED_IS_ADMIN_SECURITY_DEFINER.has(hit.functionName),
  );

  assert(
    remainingIsAdminSecurityDefiner.length === 0,
    `SECURITY DEFINER functions still using is_admin(): ${remainingIsAdminSecurityDefiner
      .map((hit) => `${hit.functionName} (${hit.file})`)
      .join(", ")}`,
  );

  return "ok";
}

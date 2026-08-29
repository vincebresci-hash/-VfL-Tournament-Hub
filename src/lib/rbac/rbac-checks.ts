import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mergePermissions,
  resolvePermissionAccess,
  ROLE_PERMISSIONS,
} from "@/lib/rbac/permissions";
import { RBAC_PERMISSIONS } from "@/types/rbac";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260831160000_user_profiles_rbac.sql"),
    "utf8",
  );
}

function readGuards() {
  return readFileSync(join(process.cwd(), "src/lib/auth/guards.ts"), "utf8");
}

function readActions() {
  return readFileSync(join(process.cwd(), "src/lib/rbac/actions.ts"), "utf8");
}

function readPaymentsActions() {
  return readFileSync(join(process.cwd(), "src/lib/payments/actions.ts"), "utf8");
}

export function runRbacChecks() {
  const migration = readMigration();
  const guards = readGuards();
  const actions = readActions();
  const paymentsActions = readPaymentsActions();

  assert(migration.includes("rbac_roles"), "rbac_roles table");
  assert(migration.includes("rbac_permissions"), "rbac_permissions table");
  assert(migration.includes("rbac_user_roles"), "rbac_user_roles table");
  assert(migration.includes("rbac_user_team_assignments"), "rbac_user_team_assignments table");
  assert(migration.includes("has_rbac_permission"), "has_rbac_permission function");
  assert(migration.includes("rbac_assign_user_role"), "rbac_assign_user_role RPC");
  assert(migration.includes("cannot self-assign super admin"), "self escalation blocked");
  assert(migration.includes("cannot remove last super admin"), "last super admin protected");
  assert(migration.includes("is_active boolean"), "profile active flag");
  assert(
    migration.includes("WHERE p.role = 'super-admin'"),
    "existing super-admin migrated from profiles.role",
  );
  assert(
    migration.includes("WHERE p.role = 'admin'"),
    "existing admin migrated from profiles.role",
  );
  assert(
    migration.includes("WHERE p.role = 'club'"),
    "existing club users migrated to CLUB_ADMIN",
  );

  assert(guards.includes("requirePermission"), "central requirePermission guard");
  assert(guards.includes("requireSuperAdminSession"), "super admin guard");
  assert(guards.includes("requireClubAccess"), "club access guard");
  assert(guards.includes("requireTeamAccess"), "team access guard");
  assert(actions.includes("requireSuperAdminSession"), "role assignment super-admin only");
  assert(paymentsActions.includes('requirePermission("payments.manage")'), "payments server guard");

  // SUPER_ADMIN
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "super-admin",
      roleKeys: ["SUPER_ADMIN"],
      overrides: [],
      permission: "roles.manage",
    }),
    "SUPER_ADMIN: roles.manage PASS",
  );
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "super-admin",
      roleKeys: ["SUPER_ADMIN"],
      overrides: [],
      permission: "users.manage",
    }),
    "SUPER_ADMIN: users.manage PASS",
  );

  // ADMIN legacy full access except roles.manage
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: [],
      overrides: [],
      permission: "payments.manage",
    }),
    "legacy ADMIN: payments PASS",
  );
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: [],
      overrides: [],
      permission: "roles.manage",
    }),
    "legacy ADMIN: roles.manage BLOCKED",
  );

  // FINANCE_MANAGER
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "club",
      roleKeys: ["FINANCE_MANAGER"],
      overrides: [],
      permission: "payments.manage",
    }),
    "FINANCE_MANAGER: payments PASS",
  );
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "club",
      roleKeys: ["FINANCE_MANAGER"],
      overrides: [],
      permission: "users.manage",
    }),
    "FINANCE_MANAGER: users.manage BLOCKED",
  );

  // APPLICATION_MANAGER
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "club",
      roleKeys: ["APPLICATION_MANAGER"],
      overrides: [],
      permission: "applications.decide",
    }),
    "APPLICATION_MANAGER: applications PASS",
  );
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "club",
      roleKeys: ["APPLICATION_MANAGER"],
      overrides: [],
      permission: "payments.manage",
    }),
    "APPLICATION_MANAGER: finance BLOCKED",
  );

  // CLUB_ADMIN
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "club",
      roleKeys: ["CLUB_ADMIN"],
      overrides: [],
      permission: "teams.view",
      clubId: "club-a",
      userClubId: "club-a",
    }),
    "CLUB_ADMIN: own club PASS",
  );
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "club",
      roleKeys: ["CLUB_ADMIN"],
      overrides: [],
      permission: "teams.view",
      clubId: "club-b",
      userClubId: "club-a",
    }),
    "CLUB_ADMIN: foreign club BLOCKED",
  );

  // TEAM_MANAGER
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "club",
      roleKeys: ["TEAM_MANAGER"],
      overrides: [],
      permission: "teams.view",
      clubId: "club-a",
      userClubId: "club-a",
      teamId: "team-1",
      assignedTeamIds: ["team-1"],
    }),
    "TEAM_MANAGER: assigned team PASS",
  );
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "club",
      roleKeys: ["TEAM_MANAGER"],
      overrides: [],
      permission: "teams.view",
      clubId: "club-a",
      userClubId: "club-a",
      teamId: "team-2",
      assignedTeamIds: ["team-1"],
    }),
    "TEAM_MANAGER: unassigned team BLOCKED",
  );

  // inactive privileged user
  assert(
    !resolvePermissionAccess({
      isActive: false,
      profileRole: "super-admin",
      roleKeys: ["SUPER_ADMIN"],
      overrides: [],
      permission: "users.manage",
    }),
    "inactive privileged user BLOCKED",
  );

  // privilege escalation via overrides still needs explicit grant
  const financeOnly = mergePermissions(["FINANCE_MANAGER"], []);
  assert(financeOnly.has("payments.manage"), "finance role permissions seeded");
  assert(!financeOnly.has("roles.manage"), "finance cannot manage roles");

  assert(RBAC_PERMISSIONS.length >= 24, "permission catalog complete");
  assert(ROLE_PERMISSIONS.SUPER_ADMIN.length === RBAC_PERMISSIONS.length, "super admin all perms");
  assert(
    ROLE_PERMISSIONS.ADMIN.length === RBAC_PERMISSIONS.length - 1,
    "admin role excludes roles.manage",
  );

  return "ok";
}

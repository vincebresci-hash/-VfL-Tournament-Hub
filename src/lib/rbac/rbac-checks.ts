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

function readEnforcementMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260831170000_rbac_enforcement_aliases.sql"),
    "utf8",
  );
}

function readGuards() {
  return readFileSync(join(process.cwd(), "src/lib/auth/guards.ts"), "utf8");
}

function readActions() {
  return readFileSync(join(process.cwd(), "src/lib/rbac/actions.ts"), "utf8");
}

function readAuthActions() {
  return readFileSync(join(process.cwd(), "src/lib/auth/actions.ts"), "utf8");
}

function readPaymentsActions() {
  return readFileSync(join(process.cwd(), "src/lib/payments/actions.ts"), "utf8");
}

function readAdminActions() {
  return readFileSync(join(process.cwd(), "src/lib/db/admin-actions.ts"), "utf8");
}

function readClubProfileForm() {
  return readFileSync(join(process.cwd(), "src/components/club/ClubProfileForm.tsx"), "utf8");
}

function readAdminShell() {
  return readFileSync(join(process.cwd(), "src/components/admin/AdminShell.tsx"), "utf8");
}

function readAdminSidebar() {
  return readFileSync(join(process.cwd(), "src/components/admin/AdminSidebar.tsx"), "utf8");
}

function readAdminAccess() {
  return readFileSync(join(process.cwd(), "src/lib/rbac/admin-access.ts"), "utf8");
}

function readPaymentsQueries() {
  return readFileSync(join(process.cwd(), "src/lib/payments/queries.ts"), "utf8");
}

export function runRbacChecks() {
  const migration = readMigration();
  const enforcementMigration = readEnforcementMigration();
  const guards = readGuards();
  const actions = readActions();
  const authActions = readAuthActions();
  const paymentsActions = readPaymentsActions();
  const adminActions = readAdminActions();
  const clubProfileForm = readClubProfileForm();
  const adminShell = readAdminShell();
  const adminSidebar = readAdminSidebar();
  const adminAccess = readAdminAccess();
  const paymentsQueries = readPaymentsQueries();

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
    enforcementMigration.includes("communications.manage"),
    "communications.manage permission added",
  );
  assert(
    enforcementMigration.includes("cancellations.manage"),
    "cancellations.manage permission added",
  );

  assert(guards.includes("requirePermission"), "central requirePermission guard");
  assert(guards.includes("requireSuperAdminSession"), "super admin guard");
  assert(guards.includes("requireClubAccess"), "club access guard");
  assert(guards.includes("requireTeamAccess"), "team access guard");
  assert(actions.includes("requireSuperAdminSession"), "role assignment super-admin only");
  assert(actions.includes("rbac_assign_user_role"), "multi-role assign RPC used");
  assert(actions.includes("rbac_revoke_user_role"), "multi-role revoke RPC used");
  assert(paymentsActions.includes("requirePaymentsManage"), "payments manage guard");
  assert(paymentsActions.includes("requirePaymentsView"), "payments view guard");
  assert(paymentsActions.includes("loadAdminPaymentRecordsAction"), "standalone payment read action");
  assert(adminAccess.includes('"/admin/zahlungen"'), "payments admin route registered");
  assert(paymentsQueries.includes("listAdminPaymentRecords"), "payment list query");
  assert(paymentsQueries.includes("getAdminPaymentRecord"), "payment detail query");
  assert(adminActions.includes("requireApplicationsView"), "applications view guard");
  assert(adminActions.includes("requireApplicationsManage"), "applications manage guard");
  assert(adminActions.includes("requireTournamentsManage"), "tournaments manage guard");
  assert(authActions.includes("updatePersonalProfileAction"), "personal profile action");
  assert(authActions.includes("display_name"), "personal profile allowlist fields");
  assert(authActions.includes('.eq("id", user.id)'), "personal profile scoped to own user");
  assert(clubProfileForm.includes("Mein Profil"), "club profile page personal section");
  assert(clubProfileForm.includes("updatePersonalProfileAction"), "club personal profile wired");
  assert(adminShell.includes("getAdminRoutePermissions"), "admin route permission gate");
  assert(adminSidebar.includes("canSeeAdminNavItem"), "permission-based admin navigation");

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
      permission: "payments.view",
    }),
    "SUPER_ADMIN: payments.view PASS",
  );
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "super-admin",
      roleKeys: ["SUPER_ADMIN"],
      overrides: [],
      permission: "payments.manage",
    }),
    "SUPER_ADMIN: payments.manage PASS",
  );

  // Legacy ADMIN without RBAC rows (pre-migration)
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: [],
      overrides: [],
      permission: "payments.manage",
    }),
    "legacy ADMIN without RBAC rows: payments PASS",
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

  // Granular RBAC: profile admin + FINANCE_MANAGER must not inherit legacy full access
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["FINANCE_MANAGER"],
      overrides: [],
      permission: "applications.manage",
    }),
    "granular FINANCE_MANAGER: applications.manage BLOCKED",
  );

  // FINANCE_MANAGER
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["FINANCE_MANAGER"],
      overrides: [],
      permission: "payments.view",
    }),
    "FINANCE_MANAGER: payments.view PASS",
  );
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["FINANCE_MANAGER"],
      overrides: [],
      permission: "payments.manage",
    }),
    "FINANCE_MANAGER: payments.manage PASS",
  );
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["FINANCE_MANAGER"],
      overrides: [],
      permission: "roles.manage",
    }),
    "FINANCE_MANAGER: roles.manage BLOCKED",
  );

  // READ-ONLY PAYMENT USER (payments.view without payments.manage)
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["APPLICATION_MANAGER"],
      overrides: [{ permission: "payments.view", granted: true }],
      permission: "payments.view",
    }),
    "read-only payment user: payments.view PASS",
  );
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["APPLICATION_MANAGER"],
      overrides: [{ permission: "payments.view", granted: true }],
      permission: "payments.manage",
    }),
    "read-only payment user: payments.manage BLOCKED",
  );

  // APPLICATION_MANAGER
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["APPLICATION_MANAGER"],
      overrides: [],
      permission: "applications.manage",
    }),
    "APPLICATION_MANAGER: applications.manage PASS",
  );
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["APPLICATION_MANAGER"],
      overrides: [],
      permission: "payments.view",
    }),
    "APPLICATION_MANAGER: payments.view BLOCKED",
  );
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["APPLICATION_MANAGER"],
      overrides: [],
      permission: "payments.manage",
    }),
    "APPLICATION_MANAGER: payments.manage BLOCKED",
  );

  // COMMUNICATION_MANAGER
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["COMMUNICATION_MANAGER"],
      overrides: [],
      permission: "communications.manage",
    }),
    "COMMUNICATION_MANAGER: communications.manage PASS",
  );
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["COMMUNICATION_MANAGER"],
      overrides: [],
      permission: "payments.manage",
    }),
    "COMMUNICATION_MANAGER: payments.manage BLOCKED",
  );

  // Multi-role
  const multiRole = mergePermissions(["APPLICATION_MANAGER", "COMMUNICATION_MANAGER"], []);
  assert(multiRole.has("applications.manage"), "multi-role applications PASS");
  assert(multiRole.has("communications.manage"), "multi-role communications PASS");
  assert(!multiRole.has("payments.manage"), "multi-role finance BLOCKED");

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

  assert(RBAC_PERMISSIONS.length >= 26, "permission catalog complete");
  assert(ROLE_PERMISSIONS.SUPER_ADMIN.length === RBAC_PERMISSIONS.length, "super admin all perms");

  // TOURNAMENT_MANAGER
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["TOURNAMENT_MANAGER"],
      overrides: [],
      permission: "tournaments.manage",
    }),
    "TOURNAMENT_MANAGER: tournaments.manage PASS",
  );
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["TOURNAMENT_MANAGER"],
      overrides: [],
      permission: "payments.manage",
    }),
    "TOURNAMENT_MANAGER: payments.manage BLOCKED",
  );
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["TOURNAMENT_MANAGER"],
      overrides: [],
      permission: "users.manage",
    }),
    "TOURNAMENT_MANAGER: users.manage BLOCKED",
  );

  // ADMIN
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["ADMIN"],
      overrides: [],
      permission: "users.manage",
    }),
    "ADMIN: users.manage PASS",
  );
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["ADMIN"],
      overrides: [],
      permission: "roles.manage",
    }),
    "ADMIN: roles.manage BLOCKED",
  );

  return "ok";
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mergePermissions,
  resolvePermissionAccess,
} from "@/lib/rbac/permissions";
import { resolveLoginDestination } from "@/lib/auth/login-destination";
import { ROLE_EXPLANATIONS } from "@/lib/rbac/role-labels";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260831180000_user_management_invitations.sql"),
    "utf8",
  );
}

function readInvitationActions() {
  return readFileSync(join(process.cwd(), "src/lib/rbac/invitation-actions.ts"), "utf8");
}

function readAudit() {
  return readFileSync(join(process.cwd(), "src/lib/rbac/audit.ts"), "utf8");
}

function readAvatars() {
  return readFileSync(join(process.cwd(), "src/lib/storage/avatars.ts"), "utf8");
}

function readLoginDestination() {
  return readFileSync(join(process.cwd(), "src/lib/auth/login-destination.ts"), "utf8");
}

function readUsersBoard() {
  return readFileSync(join(process.cwd(), "src/components/admin/AdminUsersBoard.tsx"), "utf8");
}

export function runUserManagementChecks() {
  const migration = readMigration();
  const invitationActions = readInvitationActions();
  const audit = readAudit();
  const avatars = readAvatars();
  const loginDestination = readLoginDestination();
  const usersBoard = readUsersBoard();

  assert(migration.includes("user_invitations"), "user_invitations table");
  assert(migration.includes("admin_audit_log"), "admin_audit_log table");
  assert(migration.includes("'avatars'"), "avatars storage bucket");
  assert(migration.includes("is_super_admin()"), "invitation RLS super admin only");

  assert(invitationActions.includes("requireSuperAdminSession"), "invite super admin only");
  assert(invitationActions.includes("inviteUserAction"), "invite user action");
  assert(invitationActions.includes("resendInvitationAction"), "resend invitation");
  assert(invitationActions.includes("cancelInvitationAction"), "cancel invitation");
  assert(invitationActions.includes("auth.admin.inviteUserByEmail"), "supabase auth invite");

  assert(audit.includes("USER_INVITED"), "audit USER_INVITED");
  assert(audit.includes("ROLE_ASSIGNED"), "audit ROLE_ASSIGNED");
  assert(audit.includes("TEAM_ASSIGNED"), "audit TEAM_ASSIGNED");

  assert(avatars.includes("AVATARS_BUCKET"), "avatar bucket constant");
  assert(avatars.includes("buildAvatarObjectPath"), "avatar path scoped to user");

  assert(loginDestination.includes("resolveLoginDestination"), "role-aware redirect helper");
  assert(loginDestination.includes("/admin"), "admin redirect path");
  assert(loginDestination.includes("/verein"), "club redirect path");

  assert(usersBoard.includes("invitation_pending"), "invitation status filter");
  assert(usersBoard.includes("Suche"), "user search");

  assert(ROLE_EXPLANATIONS.FINANCE_MANAGER.description.includes("Zahlungen"), "finance role label");
  assert(ROLE_EXPLANATIONS.APPLICATION_MANAGER.description.includes("Bewerbungen"), "application role label");

  // FINANCE_MANAGER redirect
  const financeAdmin = resolveLoginDestination({
    profileRole: "admin",
    roleKeys: ["FINANCE_MANAGER"],
    permissions: Array.from(mergePermissions(["FINANCE_MANAGER"], [])),
  });
  assert(financeAdmin.startsWith("/admin"), "FINANCE_MANAGER admin redirect");

  // TEAM_MANAGER redirect
  const teamManager = resolveLoginDestination({
    profileRole: "club",
    roleKeys: ["TEAM_MANAGER"],
    permissions: Array.from(mergePermissions(["TEAM_MANAGER"], [])),
  });
  assert(teamManager === "/verein/teams", "TEAM_MANAGER team redirect");

  // Permission matrix snippets
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["FINANCE_MANAGER"],
      overrides: [],
      permission: "users.view",
    }),
    "FINANCE_MANAGER users.view DENY",
  );

  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["APPLICATION_MANAGER"],
      overrides: [],
      permission: "applications.manage",
    }),
    "APPLICATION_MANAGER applications PASS",
  );

  return "ok";
}

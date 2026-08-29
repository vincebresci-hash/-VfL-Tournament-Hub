import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

export function runUserDeleteChecks() {
  const actions = read("src/lib/rbac/actions.ts");
  const userDelete = read("src/lib/rbac/user-delete.ts");
  const audit = read("src/lib/rbac/audit.ts");
  const detail = read("src/components/admin/AdminUserDetail.tsx");
  const serviceRole = read("src/lib/supabase/service-role.ts");

  assert(actions.includes("deleteManagedUserAction"), "delete action exported");
  assert(actions.includes("requireSuperAdminSession"), "delete requires super admin session");
  assert(actions.includes('requirePermission("users.manage")'), "delete requires users.manage");
  assert(actions.includes("Du kannst dein eigenes Konto nicht löschen"), "self-delete blocked");
  assert(
    actions.includes("Der letzte aktive Super-Admin kann nicht gelöscht werden"),
    "last super admin blocked",
  );
  assert(actions.includes("count_active_super_admins"), "last super admin count rpc");
  assert(actions.includes("deleteManagedUserRecords"), "delete delegates to server module");

  assert(userDelete.includes('import "server-only"'), "user delete module is server-only");
  assert(userDelete.includes("auth.admin.deleteUser"), "auth user deleted");
  assert(
    userDelete.indexOf("auth.admin.deleteUser") > userDelete.indexOf("user_invitations"),
    "auth user deleted after invitation cleanup",
  );
  assert(userDelete.includes("rbac_user_roles"), "role assignments removed");
  assert(userDelete.includes("rbac_user_team_assignments"), "team assignments removed");
  assert(userDelete.includes("rbac_user_permission_overrides"), "permission overrides removed");
  assert(userDelete.includes("redactInvitationSecrets"), "delete logs sanitized");
  assert(!userDelete.includes("applications"), "delete does not touch applications");
  assert(!userDelete.includes("tournaments"), "delete does not touch tournaments");

  assert(audit.includes("USER_DELETED"), "audit action for delete");

  assert(detail.includes("deleteManagedUserAction"), "detail page wired to delete action");
  assert(detail.includes("ConfirmModal"), "delete confirmation modal");
  assert(detail.includes("Benutzer wirklich löschen?"), "delete warning copy");
  assert(detail.includes("Benutzer endgültig löschen"), "explicit second confirmation");
  assert(detail.includes("canDeleteUser"), "delete button gated");

  const detailPage = read("src/app/admin/benutzer/[id]/page.tsx");
  assert(detailPage.includes("users.manage"), "delete ui requires users.manage");
  assert(detailPage.includes("canManageSystem"), "delete ui requires super admin");
  assert(detail.includes("currentUserId"), "self-delete hidden in ui");

  assert(serviceRole.includes('import "server-only"'), "service role server-only");
  assert(!detail.includes("createServiceRoleClient"), "client detail has no service role");

  return "ok";
}

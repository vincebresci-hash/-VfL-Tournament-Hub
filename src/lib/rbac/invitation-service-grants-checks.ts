import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260831190000_invitation_service_role_grants.sql"),
    "utf8",
  );
}

function readInvitationActions() {
  return readFileSync(join(process.cwd(), "src/lib/rbac/invitation-actions.ts"), "utf8");
}

export function runInvitationServiceGrantsChecks() {
  const migration = readMigration();
  const actions = readInvitationActions();

  assert(migration.includes("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_invitations TO service_role"), "user_invitations service_role grants");
  assert(migration.includes("GRANT SELECT, INSERT ON TABLE public.admin_audit_log TO service_role"), "admin_audit_log service_role grants");
  assert(migration.includes("GRANT SELECT, UPDATE ON TABLE public.profiles TO service_role"), "profiles service_role grants");
  assert(migration.includes("IF auth.uid() IS NULL THEN"), "service-side profile trigger bypass");
  assert(!migration.includes("DISABLE ROW LEVEL SECURITY"), "RLS stays enabled");
  assert(!migration.includes("TO anon"), "no anon table grants");

  assert(actions.includes("existingProfileError"), "profile duplicate check handles errors");
  assert(actions.includes("pendingInviteError"), "invitation duplicate check handles errors");
  assert(actions.includes("cleanupPendingAuthUser(service, userId)"), "post-invite cleanup scoped to known user id");
  assert(!actions.includes("cleanupPendingAuthUser(service, inviteData"), "no cleanup on inviteUserByEmail error");

  return "ok";
}

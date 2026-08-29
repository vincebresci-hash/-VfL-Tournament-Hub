import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260831200000_rbac_accept_pending_invitation.sql"),
    "utf8",
  );
}

export function runInvitationAcceptanceRpcChecks() {
  const migration = readMigration();

  assert(migration.includes("CREATE OR REPLACE FUNCTION public.rbac_accept_pending_invitation"), "acceptance rpc defined");
  assert(migration.includes("SECURITY DEFINER"), "acceptance rpc is security definer");
  assert(migration.includes("SET search_path = public"), "acceptance rpc pins search_path");
  assert(migration.includes("auth.uid()"), "acceptance rpc uses auth.uid");
  assert(migration.includes("FROM auth.users"), "acceptance rpc reads verified auth email");
  assert(migration.includes("status = 'pending'"), "acceptance rpc targets pending invitations");
  assert(migration.includes("status = 'accepted'"), "acceptance rpc sets accepted status");
  assert(migration.includes("accepted_at = COALESCE(accepted_at, now())"), "acceptance rpc sets accepted_at");
  assert(migration.includes("FOR UPDATE"), "acceptance rpc locks pending row");
  assert(migration.includes("'already_accepted'"), "acceptance rpc is idempotent");
  assert(migration.includes("GRANT EXECUTE ON FUNCTION public.rbac_accept_pending_invitation() TO authenticated"), "authenticated execute grant");
  assert(migration.includes("REVOKE ALL ON FUNCTION public.rbac_accept_pending_invitation() FROM PUBLIC"), "public execute revoked");
  assert(!migration.includes("TO service_role"), "acceptance rpc not granted to service_role");
  assert(!migration.includes("TO anon"), "acceptance rpc not granted to anon");
  assert(!migration.includes("DISABLE ROW LEVEL SECURITY"), "acceptance rpc keeps RLS enabled");

  return "ok";
}

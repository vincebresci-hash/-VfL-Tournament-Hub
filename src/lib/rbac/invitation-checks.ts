import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readInvitationActions() {
  return readFileSync(join(process.cwd(), "src/lib/rbac/invitation-actions.ts"), "utf8");
}

function readInviteForm() {
  return readFileSync(join(process.cwd(), "src/components/admin/AdminInviteUserForm.tsx"), "utf8");
}

function readInvitationAcceptance() {
  return readFileSync(join(process.cwd(), "src/lib/rbac/invitation-acceptance.ts"), "utf8");
}

function readServiceRole() {
  return readFileSync(join(process.cwd(), "src/lib/supabase/service-role.ts"), "utf8");
}

export function runInvitationChecks() {
  const actions = readInvitationActions();
  const form = readInviteForm();
  const acceptance = readInvitationAcceptance();
  const serviceRole = readServiceRole();

  assert(actions.includes("isValidEmail"), "email validation");
  assert(actions.includes("pendingInvite"), "duplicate invitation protection");
  assert(actions.includes("existingProfile"), "existing user protection");
  assert(actions.includes("RESEND_COOLDOWN_MS"), "resend rate limit");
  assert(actions.includes("status !== \"pending\""), "resend pending only");
  assert(actions.includes("reconcileAcceptedInvitationIfNeeded"), "resend/cancel reconcile accepted invitations");
  assert(actions.includes("markInvitationAcceptedForAuthUser"), "invitation actions sync acceptance");
  assert(actions.includes(".eq(\"status\", \"pending\")"), "cancel uses conditional pending update");
  assert(actions.includes("deleteUser"), "cancel removes pending auth user");
  assert(actions.includes("getInviteRedirectSiteUrl"), "invite uses stable redirect site url");
  assert(actions.includes("resolveInvitationAuthUserMessage"), "invite auth user messages");
  assert(actions.includes("logInvitationAuthFailure"), "invite auth server logging");
  assert(!actions.includes("formatInvitationAuthFailure"), "no verbose auth failure formatting in UI");
  assert(actions.includes("roleKeys"), "multi-role invite support");
  assert(actions.includes("teamIds"), "team invite support");
  assert(actions.includes("gehört nicht zum ausgewählten Verein"), "team club mapping validation");
  assert(actions.includes("cleanupPendingAuthUser"), "post-auth invite failure cleanup only");
  assert(!actions.includes("markInvitationAcceptedAction"), "acceptance not exposed as server action");

  assert(acceptance.includes("normalizeEmail"), "acceptance email normalization");
  assert(acceptance.includes("invitation.email) !== normalizedEmail"), "acceptance identity verification");

  assert(serviceRole.includes('import "server-only"'), "service role module is server-only");

  assert(form.includes("inviteUserAction"), "invite form wired");
  assert(form.includes("ROLE_EXPLANATIONS"), "role explanations in invite UI");
  assert(!form.includes("password"), "no password in invite form");

  return "ok";
}

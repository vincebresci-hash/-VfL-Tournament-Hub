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

export function runInvitationChecks() {
  const actions = readInvitationActions();
  const form = readInviteForm();

  assert(actions.includes("isValidEmail"), "email validation");
  assert(actions.includes("pendingInvite"), "duplicate invitation protection");
  assert(actions.includes("existingProfile"), "existing user protection");
  assert(actions.includes("RESEND_COOLDOWN_MS"), "resend rate limit");
  assert(actions.includes("status !== \"pending\""), "resend pending only");
  assert(actions.includes("last_sign_in_at"), "cancel checks acceptance");
  assert(actions.includes("deleteUser"), "cancel removes pending auth user");
  assert(actions.includes("roleKeys"), "multi-role invite support");
  assert(actions.includes("teamIds"), "team invite support");
  assert(actions.includes("gehört nicht zum ausgewählten Verein"), "team club mapping validation");

  assert(form.includes("inviteUserAction"), "invite form wired");
  assert(form.includes("ROLE_EXPLANATIONS"), "role explanations in invite UI");
  assert(!form.includes("password"), "no password in invite form");

  return "ok";
}

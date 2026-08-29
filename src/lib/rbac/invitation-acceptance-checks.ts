import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readInvitationAcceptance() {
  return readFileSync(join(process.cwd(), "src/lib/rbac/invitation-acceptance.ts"), "utf8");
}

function readLoginDestinationAction() {
  return readFileSync(join(process.cwd(), "src/lib/auth/login-destination-action.ts"), "utf8");
}

function readCallbackRoute() {
  return readFileSync(join(process.cwd(), "src/app/auth/callback/route.ts"), "utf8");
}

function readPasswordSetupPage() {
  return readFileSync(join(process.cwd(), "src/app/passwort-zuruecksetzen/page.tsx"), "utf8");
}

function readResetPasswordForm() {
  return readFileSync(join(process.cwd(), "src/components/auth/ResetPasswordForm.tsx"), "utf8");
}

function readInvitationActions() {
  return readFileSync(join(process.cwd(), "src/lib/rbac/invitation-actions.ts"), "utf8");
}

export function runInvitationAcceptanceChecks() {
  const acceptanceSource = readInvitationAcceptance();
  const loginDestinationAction = readLoginDestinationAction();
  const callbackRoute = readCallbackRoute();
  const passwordSetupPage = readPasswordSetupPage();
  const resetPasswordForm = readResetPasswordForm();
  const invitationActions = readInvitationActions();

  assert(acceptanceSource.includes("InvitationAcceptanceResult"), "acceptance exports result type");
  assert(acceptanceSource.includes("lookup_failed"), "acceptance handles lookup errors");
  assert(acceptanceSource.includes("update_failed"), "acceptance handles update errors");
  assert(acceptanceSource.includes("no_rows_updated"), "acceptance handles zero-row updates");
  assert(acceptanceSource.includes(".select(\"id\")"), "acceptance verifies updated rows");
  assert(acceptanceSource.includes("auth_user_id"), "acceptance falls back to auth_user_id lookup");
  assert(acceptanceSource.includes(".ilike(\"email\""), "acceptance falls back to email lookup");
  assert(acceptanceSource.includes("rbac_accept_pending_invitation"), "acceptance uses rpc first");
  assert(acceptanceSource.includes("logInvitationAcceptance"), "acceptance logs diagnostics");
  assert(!acceptanceSource.includes("} catch {\n    return;"), "acceptance no longer swallows service errors silently");

  assert(callbackRoute.includes('source: "auth_callback"'), "callback tags acceptance source");
  assert(callbackRoute.includes("exchangeCodeForSession"), "callback handles pkce code");
  assert(callbackRoute.includes("verifyOtp"), "callback handles token_hash invite flow");
  assert(callbackRoute.includes("INVITE_PASSWORD_SETUP_PATH"), "callback routes invitees to password setup");

  assert(loginDestinationAction.includes("markInvitationAcceptedForAuthUser"), "login path triggers acceptance");
  assert(loginDestinationAction.includes('source: "login_destination"'), "login path tags acceptance source");

  assert(passwordSetupPage.includes('source: "password_setup"'), "password setup page triggers acceptance");
  assert(resetPasswordForm.includes("getLoginDestinationAction"), "password form uses role-aware redirect");

  assert(invitationActions.includes("reconcileAcceptedInvitationIfNeeded"), "resend/cancel reconcile stale pending rows");
  assert(invitationActions.includes('source: "invitation_reconcile"'), "reconcile tags acceptance source");

  return "ok";
}

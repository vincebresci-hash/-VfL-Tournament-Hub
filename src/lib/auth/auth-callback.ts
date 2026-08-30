import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";
import { INVITE_PASSWORD_SETUP_PATH } from "@/lib/rbac/invitation-auth-errors";
import type { Database } from "@/lib/supabase/database";

export function isInviteAuthType(type: string | null) {
  return type === "invite" || type === "signup";
}

export function isInviteCallback(input: {
  authType: string | null;
  next: string;
}) {
  return isInviteAuthType(input.authType) || input.next === INVITE_PASSWORD_SETUP_PATH;
}

/**
 * Remove any existing browser session before exchanging an invite/recovery code.
 * Without this, a logged-in foreign account can keep its cookies when the code
 * exchange fails and the user is bounced to /login with an active session.
 */
export async function clearSessionBeforeAuthExchange(
  supabase: SupabaseClient<Database>,
) {
  await supabase.auth.signOut({ scope: "local" });
}

export async function establishAuthSessionFromCallback(
  supabase: SupabaseClient<Database>,
  input: {
    code: string | null;
    tokenHash: string | null;
    authType: string | null;
  },
) {
  if (input.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(input.code);
    if (!error && data.user) {
      return data.user;
    }
    return null;
  }

  if (input.tokenHash && input.authType) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: input.tokenHash,
      type: input.authType as EmailOtpType,
    });
    if (!error && data.user) {
      return data.user;
    }
  }

  return null;
}

export function resolveAuthCallbackDestination(input: {
  isInvite: boolean;
  next: string;
}) {
  if (input.isInvite) {
    return INVITE_PASSWORD_SETUP_PATH;
  }

  return input.next;
}

export function authCallbackFailurePath(isInvite: boolean) {
  return isInvite ? "/login?error=invite_auth" : "/login?error=auth";
}

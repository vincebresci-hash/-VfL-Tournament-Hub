import {
  isAuthError,
  type AuthError,
  type EmailOtpType,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import {
  INVITE_PASSWORD_SETUP_PATH,
  redactInvitationSecrets,
} from "@/lib/rbac/invitation-auth-errors";
import type { Database } from "@/lib/supabase/database";

export function isInviteAuthType(type: string | null) {
  return type === "invite" || type === "signup";
}

export function isInviteTokenHashCallback(input: {
  tokenHash: string | null;
  authType: string | null;
}) {
  return Boolean(input.tokenHash && input.authType === "invite");
}

export function isInviteCallback(input: {
  authType: string | null;
  next: string;
  tokenHash: string | null;
}) {
  return (
    isInviteTokenHashCallback({ tokenHash: input.tokenHash, authType: input.authType }) ||
    isInviteAuthType(input.authType) ||
    input.next === INVITE_PASSWORD_SETUP_PATH
  );
}

export type AuthCallbackFlow = "invite_token_hash" | "pkce_code" | "token_hash_otp";

export type AuthCallbackEstablishmentResult = {
  user: User | null;
  error: AuthError | null;
  flow: AuthCallbackFlow | null;
};

export type AuthCallbackFailureDiagnostic = {
  flow: AuthCallbackFlow | "unknown";
  code?: string;
  status?: number;
  message: string;
  hasCode: boolean;
  hasTokenHash: boolean;
  authType: string | null;
};

/**
 * Clear the local auth session after a failed callback exchange.
 *
 * Must NOT run before `exchangeCodeForSession`: Supabase `signOut` tears down
 * storage via `_removeSession`, which calls `removeAllPKCEVerifiers` and
 * deletes the PKCE `code_verifier` cookie required for the callback.
 */
export async function clearLocalAuthSessionOnFailure(
  supabase: SupabaseClient<Database>,
) {
  await supabase.auth.signOut({ scope: "local" });
}

export async function establishInviteSessionFromTokenHash(
  supabase: SupabaseClient<Database>,
  tokenHash: string,
): Promise<AuthCallbackEstablishmentResult> {
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "invite",
  });

  if (error) {
    return { user: null, error, flow: "invite_token_hash" };
  }

  if (!data.user) {
    return { user: null, error: null, flow: "invite_token_hash" };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { user: null, error: sessionError, flow: "invite_token_hash" };
  }

  if (!sessionData.session) {
    return { user: null, error: null, flow: "invite_token_hash" };
  }

  const { data: userData, error: getUserError } = await supabase.auth.getUser();
  if (getUserError) {
    return { user: null, error: getUserError, flow: "invite_token_hash" };
  }

  if (!userData.user || userData.user.id !== data.user.id) {
    return { user: null, error: null, flow: "invite_token_hash" };
  }

  return { user: userData.user, error: null, flow: "invite_token_hash" };
}

export async function establishAuthSessionFromCallback(
  supabase: SupabaseClient<Database>,
  input: {
    code: string | null;
    tokenHash: string | null;
    authType: string | null;
  },
): Promise<AuthCallbackEstablishmentResult> {
  if (input.code && input.authType !== "invite") {
    const { data, error } = await supabase.auth.exchangeCodeForSession(input.code);
    if (!error && data.user) {
      return { user: data.user, error: null, flow: "pkce_code" };
    }
    return { user: null, error: error ?? null, flow: "pkce_code" };
  }

  if (input.tokenHash && input.authType && input.authType !== "invite") {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: input.tokenHash,
      type: input.authType as EmailOtpType,
    });
    if (!error && data.user) {
      return { user: data.user, error: null, flow: "token_hash_otp" };
    }
    return { user: null, error: error ?? null, flow: "token_hash_otp" };
  }

  return { user: null, error: null, flow: null };
}

export function sanitizeAuthCallbackError(error: unknown) {
  const status = isAuthError(error) ? error.status : undefined;
  const code = isAuthError(error) ? error.code : undefined;
  const rawMessage =
    isAuthError(error) && error.message
      ? error.message
      : error instanceof Error
        ? error.message
        : "unknown_error";

  return {
    status,
    code,
    message: redactInvitationSecrets(rawMessage),
  };
}

export function logAuthCallbackFailure(input: {
  flow: AuthCallbackFlow | "unknown";
  error: unknown;
  hasCode: boolean;
  hasTokenHash: boolean;
  authType: string | null;
}) {
  const sanitized = sanitizeAuthCallbackError(input.error);
  const diagnostic: AuthCallbackFailureDiagnostic = {
    flow: input.flow,
    ...sanitized,
    hasCode: input.hasCode,
    hasTokenHash: input.hasTokenHash,
    authType: input.authType,
  };

  console.error("[auth/callback] session establishment failed", diagnostic);
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

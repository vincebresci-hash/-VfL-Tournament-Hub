import { NextResponse } from "next/server";
import { getSafeRedirect } from "@/lib/auth/redirects";
import {
  authCallbackFailurePath,
  clearLocalAuthSessionOnFailure,
  establishAuthSessionFromCallback,
  isInviteAuthType,
  isInviteCallback,
  resolveAuthCallbackDestination,
} from "@/lib/auth/auth-callback";
import { INVITE_PASSWORD_SETUP_PATH } from "@/lib/rbac/invitation-auth-errors";
import { markInvitationAcceptedForAuthUser } from "@/lib/rbac/invitation-acceptance";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const authType = searchParams.get("type");
  const inviteFlow = isInviteAuthType(authType);
  const next = getSafeRedirect(
    searchParams.get("next") ?? searchParams.get("redirect"),
    inviteFlow ? INVITE_PASSWORD_SETUP_PATH : "/verein/dashboard",
  );
  const inviteCallback = isInviteCallback({ authType, next });

  const supabase = await createClient();

  const user = await establishAuthSessionFromCallback(supabase, {
    code,
    tokenHash,
    authType,
  });

  if (!user) {
    await clearLocalAuthSessionOnFailure(supabase);
    return NextResponse.redirect(new URL(authCallbackFailurePath(inviteCallback), origin));
  }

  await markInvitationAcceptedForAuthUser({
    userId: user.id,
    email: user.email,
    source: "auth_callback",
  });

  const destination = resolveAuthCallbackDestination({
    isInvite: inviteCallback,
    next,
  });

  return NextResponse.redirect(new URL(destination, origin));
}

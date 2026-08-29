import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSafeRedirect } from "@/lib/auth/redirects";
import { INVITE_PASSWORD_SETUP_PATH } from "@/lib/rbac/invitation-auth-errors";
import { markInvitationAcceptedForAuthUser } from "@/lib/rbac/invitation-acceptance";
import { createClient } from "@/lib/supabase/server";

function isInviteAuthType(type: string | null) {
  return type === "invite" || type === "signup";
}

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

  const supabase = await createClient();
  let user: { id: string; email?: string } | null = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      user = data.user;
    }
  } else if (tokenHash && authType) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: authType as EmailOtpType,
    });
    if (!error && data.user) {
      user = data.user;
    }
  }

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=auth", origin));
  }

  await markInvitationAcceptedForAuthUser({
    userId: user.id,
    email: user.email,
    source: "auth_callback",
  });

  const destination =
    inviteFlow || next === INVITE_PASSWORD_SETUP_PATH ? INVITE_PASSWORD_SETUP_PATH : next;

  return NextResponse.redirect(new URL(destination, origin));
}

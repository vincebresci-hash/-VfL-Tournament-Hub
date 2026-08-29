import { NextResponse } from "next/server";
import { getSafeRedirect } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";
import { markInvitationAcceptedForAuthUser } from "@/lib/rbac/invitation-acceptance";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = getSafeRedirect(
    searchParams.get("next") ?? searchParams.get("redirect"),
    "/verein/dashboard",
  );

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      await markInvitationAcceptedForAuthUser({
        userId: data.user.id,
        email: data.user.email,
      });
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", origin));
}

import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_HOME,
  ADMIN_LOGIN,
  canAccessAdmin,
  canAccessClub,
  CLUB_HOME,
  isAdminAccessReady,
} from "@/lib/auth/roles";
import {
  buildAdminLoginHref,
  buildLoginHref,
  isAdminPath,
  isApplyPath,
  isClubPath,
} from "@/lib/auth/redirects";
import {
  copySessionCookies,
  updateSession,
} from "@/lib/supabase/update-session";

export async function proxy(request: NextRequest) {
  const { supabaseResponse, user, role } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (pathname === ADMIN_LOGIN) {
    if (user && canAccessAdmin(role) && isAdminAccessReady()) {
      return redirectWithSession(
        request,
        supabaseResponse,
        ADMIN_HOME,
      );
    }

    return supabaseResponse;
  }

  if (isAdminPath(pathname)) {
    if (!user) {
      return redirectWithSession(
        request,
        supabaseResponse,
        buildAdminLoginHref(pathname + search),
      );
    }

    if (!canAccessAdmin(role) || !isAdminAccessReady()) {
      return redirectWithSession(
        request,
        supabaseResponse,
        canAccessClub(role) ? CLUB_HOME : "/",
      );
    }

    return supabaseResponse;
  }

  if (isClubPath(pathname)) {
    if (!user) {
      return redirectWithSession(
        request,
        supabaseResponse,
        buildLoginHref(pathname + search),
      );
    }

    if (!canAccessClub(role)) {
      return redirectWithSession(
        request,
        supabaseResponse,
        canAccessAdmin(role) ? ADMIN_HOME : "/",
      );
    }

    return supabaseResponse;
  }

  if (isApplyPath(pathname)) {
    if (user && canAccessClub(role)) {
      return supabaseResponse;
    }

    if (user && canAccessAdmin(role)) {
      return redirectWithSession(request, supabaseResponse, ADMIN_HOME);
    }

    return redirectWithSession(
      request,
      supabaseResponse,
      buildLoginHref(pathname + search),
    );
  }

  return supabaseResponse;
}

function redirectWithSession(
  request: NextRequest,
  supabaseResponse: NextResponse,
  location: string,
) {
  const redirectResponse = NextResponse.redirect(new URL(location, request.url));
  return copySessionCookies(supabaseResponse, redirectResponse);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

import {
  ADMIN_HOME,
  ADMIN_LOGIN,
  canAccessAdmin,
  canAccessClub,
  CLUB_HOME,
  CLUB_LOGIN,
  homePathForRole,
} from "@/lib/auth/roles";
import type { UserRole } from "@/types/auth";

export function readRedirectParam(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function isSafeInternalPath(path: string) {
  if (!path.startsWith("/")) {
    return false;
  }

  if (path.startsWith("//") || path.startsWith("/\\")) {
    return false;
  }

  if (path.includes("://") || path.includes("\\")) {
    return false;
  }

  return true;
}

export function getSafeRedirect(
  raw: string | null | undefined,
  fallback: string,
) {
  if (!raw || !isSafeInternalPath(raw)) {
    return fallback;
  }

  if (
    raw === CLUB_LOGIN ||
    raw.startsWith(`${CLUB_LOGIN}?`) ||
    raw === ADMIN_LOGIN ||
    raw.startsWith(`${ADMIN_LOGIN}?`) ||
    raw === "/registrieren" ||
    raw.startsWith("/registrieren?") ||
    raw === "/passwort-vergessen" ||
    raw.startsWith("/passwort-vergessen?") ||
    raw === "/auth/callback" ||
    raw.startsWith("/auth/callback?")
  ) {
    return fallback;
  }

  return raw;
}

export function getPostLoginRedirect(
  role: UserRole,
  raw: string | null | undefined,
) {
  const fallback = homePathForRole(role);
  const candidate = getSafeRedirect(raw, fallback);

  if (canAccessClub(role) && isAdminPath(candidate)) {
    return CLUB_HOME;
  }

  if (canAccessAdmin(role) && isClubPath(candidate)) {
    return ADMIN_HOME;
  }

  return candidate;
}

export function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function isClubPath(pathname: string) {
  return pathname === "/verein" || pathname.startsWith("/verein/");
}

export function isApplyPath(pathname: string) {
  return /^\/turniere\/[^/]+\/bewerben\/?$/.test(pathname);
}

export function buildLoginHref(redirectPath?: string | null) {
  if (!redirectPath || !isSafeInternalPath(redirectPath)) {
    return CLUB_LOGIN;
  }

  const params = new URLSearchParams();
  params.set("redirect", redirectPath);
  return `${CLUB_LOGIN}?${params.toString()}`;
}

export function buildAdminLoginHref(redirectPath?: string | null) {
  if (!redirectPath || !isSafeInternalPath(redirectPath)) {
    return ADMIN_LOGIN;
  }

  const params = new URLSearchParams();
  params.set("redirect", redirectPath);
  return `${ADMIN_LOGIN}?${params.toString()}`;
}

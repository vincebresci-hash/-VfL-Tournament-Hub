import type { UserRole } from "@/types/auth";
import { USER_ROLES } from "@/types/auth";

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.includes(value as UserRole);
}

export function canAccessAdmin(role: UserRole | null | undefined) {
  return role === "admin" || role === "super-admin";
}

export function canAccessClub(role: UserRole | null | undefined) {
  return role === "club";
}

export function canManageSystem(role: UserRole | null | undefined) {
  return role === "super-admin";
}

export function resolveAuthenticatedRole(role?: UserRole | null): UserRole {
  return isUserRole(role) ? role : "club";
}

export function isAdminAccessReady() {
  return true;
}

export const ADMIN_HOME = "/admin";
export const ADMIN_LOGIN = "/admin/login";
export const CLUB_HOME = "/verein/dashboard";
export const CLUB_LOGIN = "/login";

export function homePathForRole(role: UserRole) {
  if (canAccessClub(role)) {
    return CLUB_HOME;
  }

  return ADMIN_HOME;
}

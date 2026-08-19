import { createClient } from "@/lib/supabase/server";
import { toAuthSessionFromProfile, toAuthSessionFromUser } from "@/lib/auth/user";
import { isMissingRelationError } from "@/lib/db/errors";
import type { ClubRow, ProfileRow } from "@/lib/supabase/database";
import type { AuthSession, UserRole } from "@/types/auth";
import { isUserRole } from "@/lib/auth/roles";

export const AUTH_MODE = "supabase" as const;

type ProfileWithClub = ProfileRow & {
  clubs: ClubRow | ClubRow[] | null;
};

function unwrapClub(value: ClubRow | ClubRow[] | null): ClubRow | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

/**
 * Verified session via Supabase Auth (`getUser`) plus `profiles.role`.
 * user_metadata is never used for admin elevation.
 */
export async function getAuthSession(): Promise<AuthSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*, clubs:club_id(*)")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      return toAuthSessionFromUser(user);
    }

    return toAuthSessionFromUser(user);
  }

  if (!data) {
    return toAuthSessionFromUser(user);
  }

  const profile = data as ProfileWithClub;
  return toAuthSessionFromProfile(user, profile, unwrapClub(profile.clubs));
}

export async function getProfileRole(userId: string): Promise<UserRole | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data || !isUserRole(data.role)) {
    return null;
  }

  return data.role;
}

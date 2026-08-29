import { CLUB_CONTACT_ROLES } from "@/types/auth";
import type {
  AuthSession,
  ClubContactRole,
  ClubProfile,
  UserProfile,
  UserRole,
} from "@/types/auth";
import type { User } from "@supabase/supabase-js";
import { resolveAuthenticatedRole } from "@/lib/auth/roles";
import { toClubProfile } from "@/lib/db/mappers";
import type { ClubRow, ProfileRow } from "@/lib/supabase/database";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toContactRole(value: unknown): ClubContactRole | null {
  const text = asString(value);
  if (CLUB_CONTACT_ROLES.includes(text as ClubContactRole)) {
    return text as ClubContactRole;
  }
  return null;
}

export function readUserMetadata(user: User) {
  const metadata = user.user_metadata ?? {};

  return {
    firstName: asString(metadata.first_name || metadata.firstName),
    lastName: asString(metadata.last_name || metadata.lastName),
    clubName: asString(metadata.club_name || metadata.clubName),
    clubCity: asString(metadata.club_city || metadata.clubCity),
    clubWebsite: asString(metadata.club_website || metadata.clubWebsite) || null,
    contactRole: toContactRole(metadata.contact_role || metadata.contactRole),
  };
}

export function toAuthSessionFromUser(user: User): AuthSession | null {
  if (!user.email) {
    return null;
  }

  const metadata = readUserMetadata(user);
  const createdAt = user.created_at;

  const userProfile: UserProfile = {
    id: user.id,
    firstName: metadata.firstName || "Verein",
    lastName: metadata.lastName,
    displayName: null,
    email: user.email,
    phone: null,
    jobTitle: null,
    avatarUrl: null,
    role: resolveAuthenticatedRole(),
    clubId: null,
    isActive: true,
    contactRole: metadata.contactRole,
    createdAt,
    lastSignInAt: user.last_sign_in_at ?? null,
  };

  const club: ClubProfile | null = metadata.clubName
    ? {
        id: user.id,
        name: metadata.clubName,
        city: metadata.clubCity,
        website: metadata.clubWebsite,
        logo: null,
        contactPhone: null,
        createdAt,
      }
    : null;

  return {
    source: "supabase",
    user: userProfile,
    club,
  };
}

export function toAuthSessionFromProfile(
  user: User,
  profile: ProfileRow,
  club: ClubRow | null,
): AuthSession | null {
  if (!user.email && !profile.email) {
    return null;
  }

  const metadata = readUserMetadata(user);
  const role: UserRole = resolveAuthenticatedRole(profile.role);

  return {
    source: "supabase",
    user: {
      id: profile.id,
      firstName: profile.first_name || metadata.firstName || "Verein",
      lastName: profile.last_name || metadata.lastName,
      displayName: profile.display_name,
      email: profile.email || user.email || "",
      phone: profile.phone,
      jobTitle: profile.job_title,
      avatarUrl: profile.avatar_url,
      role,
      clubId: profile.club_id,
      isActive: profile.is_active ?? true,
      contactRole: metadata.contactRole,
      createdAt: profile.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
    },
    club: club ? toClubProfile(club) : null,
  };
}

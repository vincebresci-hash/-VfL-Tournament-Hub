import type { TeamStrength } from "@/types/application";
import type { AgeGroup } from "@/types/tournament";

export const USER_ROLES = ["club", "admin", "super-admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const CLUB_CONTACT_ROLES = [
  "Trainer",
  "Jugendleiter",
  "Jugendkoordinator",
  "Vorstand",
  "Sonstiges",
] as const;

export type ClubContactRole = (typeof CLUB_CONTACT_ROLES)[number];

export type UserProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  clubId: string | null;
  contactRole?: ClubContactRole | null;
  createdAt: string;
};

export type ClubProfile = {
  id: string;
  name: string;
  city: string;
  website: string | null;
  logo: string | null;
  contactPhone: string | null;
  createdAt: string;
};

export type Team = {
  id: string;
  clubId: string;
  name: string;
  ageGroup: AgeGroup;
  birthYear: number;
  league: string;
  division?: string | null;
  strength: TeamStrength;
  coach: string;
};

export type AuthSource = "demo" | "supabase";

export type AuthSession = {
  source: AuthSource;
  user: UserProfile;
  club: ClubProfile | null;
};

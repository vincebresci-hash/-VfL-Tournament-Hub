import type { AgeGroup } from "@/types/tournament";
import type { ApplicationPayment } from "@/types/payment";

export const APPLICATION_STATUSES = [
  "new",
  "under-review",
  "accepted",
  "waiting-list",
  "rejected",
  "cancelled",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const MANUAL_ADMIN_APPLICATION_STATUSES = [
  "new",
  "under-review",
  "accepted",
  "waiting-list",
  "rejected",
] as const satisfies ReadonlyArray<ApplicationStatus>;

export type ManualAdminApplicationStatus =
  (typeof MANUAL_ADMIN_APPLICATION_STATUSES)[number];

export function isManualAdminApplicationStatus(
  status: ApplicationStatus,
): status is ManualAdminApplicationStatus {
  return (MANUAL_ADMIN_APPLICATION_STATUSES as readonly ApplicationStatus[]).includes(
    status,
  );
}

export const CLUB_TYPES = [
  "amateur",
  "performance",
  "youth-academy",
  "other",
] as const;

export type ClubType = (typeof CLUB_TYPES)[number];

export const TEAM_STRENGTHS = [1, 2, 3, 4, 5] as const;

export type TeamStrength = (typeof TEAM_STRENGTHS)[number];

export type TournamentApplication = {
  id: string;
  tournamentId: string;
  clubName: string;
  clubCity: string;
  website: string | null;
  teamName: string;
  ageGroup: AgeGroup;
  birthYear: number;
  league: string;
  division: string | null;
  selfRatedStrength: TeamStrength;
  teamDescription: string | null;
  clubType: ClubType | null;
  contactFirstName: string;
  contactLastName: string;
  contactRole: string;
  contactEmail: string;
  contactPhone: string;
  alternativePhone: string | null;
  staffCount: number | null;
  notes: string | null;
  applicationStatus: ApplicationStatus;
  createdAt: string;
} & ApplicationPayment;

export const INTERNAL_CATEGORIES = ["S", "A", "B", "C"] as const;

export type InternalCategory = (typeof INTERNAL_CATEGORIES)[number];

export type AdminApplication = TournamentApplication & {
  internalCategory: InternalCategory | null;
  internalStrength: TeamStrength | null;
  internalNotes: string | null;
} & ApplicationPayment;

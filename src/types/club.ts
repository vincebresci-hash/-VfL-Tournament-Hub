import type { ClubType, TeamStrength } from "@/types/application";
import type { ApplicationStatus } from "@/types/application";
import type { AgeGroup } from "@/types/tournament";
import type { ApplicationPayment } from "@/types/payment";

/**
 * Club-facing application DTO.
 * Internal VfL fields (category, strength, notes, rankings) must never appear here.
 */
export type ClubApplicationView = {
  id: string;
  clubId: string;
  tournamentId: string;
  tournamentName: string;
  tournamentSlug: string;
  tournamentDate: string;
  tournamentLocation: string;
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

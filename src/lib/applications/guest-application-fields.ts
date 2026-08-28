import { clubTypeOptions } from "@/lib/application";
import type { ClubType } from "@/types/application";

export function optionalApplicationText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeClubType(value: string): ClubType | null {
  return clubTypeOptions.some((option) => option.value === value)
    ? (value as ClubType)
    : null;
}

export function guestApplicationFieldSnapshot(input: {
  website: string;
  clubType: string;
  alternativePhone: string;
}) {
  return {
    website: optionalApplicationText(input.website),
    club_type: normalizeClubType(input.clubType),
    alternative_phone: optionalApplicationText(input.alternativePhone),
  };
}

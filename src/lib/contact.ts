import {
  CLUB_LEGAL_NAME,
  CLUB_PHONE,
  OFFICIAL_TOURNAMENT_EMAIL,
} from "@/data/club";
import { nonempty } from "@/lib/text";
import type { AppSettings } from "@/types/admin";

/**
 * Öffentliche Kontaktdaten für den Tournament Hub.
 *
 * Reihenfolge:
 * 1. `app_settings` (`contact_email`, `contact_phone`, `organizer_name`)
 * 2. Offizielle Vereinsangaben aus `src/data/club.ts` als Fallback
 *
 * `app_settings` wird dabei nicht überschrieben.
 */
export function organizerDisplayName(settings?: AppSettings | null) {
  return nonempty(settings?.organizerName) ?? CLUB_LEGAL_NAME;
}

export function publicContactEmail(settings?: AppSettings | null) {
  return nonempty(settings?.contactEmail) ?? OFFICIAL_TOURNAMENT_EMAIL;
}

export function publicContactPhone(settings?: AppSettings | null) {
  return nonempty(settings?.contactPhone) ?? CLUB_PHONE;
}

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

import { CLUB_NAME } from "@/lib/constants";
import { nonempty } from "@/lib/text";
import type { AppSettings } from "@/types/admin";

export function organizerDisplayName(settings: AppSettings) {
  return nonempty(settings.organizerName) ?? CLUB_NAME;
}

export function publicContactEmail(settings: AppSettings) {
  return nonempty(settings.contactEmail);
}

export function publicContactPhone(settings: AppSettings) {
  return nonempty(settings.contactPhone);
}

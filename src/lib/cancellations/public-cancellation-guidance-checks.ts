import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readKontaktPage() {
  return readFileSync(join(process.cwd(), "src/app/kontakt/page.tsx"), "utf8");
}

/**
 * Narrow source check for public cancellation guidance on /kontakt.
 * Ensures guidance copy exists and no insecure public cancellation surface.
 */
export function runPublicCancellationGuidanceChecks() {
  const page = readKontaktPage();

  assert(page.includes("Teilnahme absagen"), "cancellation guidance heading");
  assert(page.includes("Über die Zusage-E-Mail"), "zusage email path");
  assert(page.includes("Über euer Vereinskonto"), "club account path");
  assert(
    page.includes('href="/verein/bewerbungen"'),
    "club applications overview link",
  );
  assert(
    page.includes("Zu meinen Bewerbungen"),
    "club applications CTA label",
  );
  assert(
    page.includes("storniert die Teilnahme nicht automatisch"),
    "pending request explanation",
  );
  assert(
    page.includes("weniger als 14 Tage vor dem Turnier"),
    "14-day rule information",
  );
  assert(
    page.includes("persönlichen Link nicht mehr zur Hand"),
    "lost-link help note",
  );
  assert(page.includes("Absage anfragen"), "recovery CTA label");
  assert(
    page.includes('href="/kontakt/absage"'),
    "recovery CTA points to /kontakt/absage",
  );
  assert(
    page.includes("mailto:${email}") || page.includes("mailto:${email}?"),
    "reuses existing contact mailto",
  );

  // Security: /kontakt itself remains form-free; recovery form is on /kontakt/absage
  assert(!page.includes("<form"), "no public cancellation form on /kontakt");
  assert(!page.includes("application_id"), "no application_id input");
  assert(!page.includes("action="), "no form action");
  assert(
    !page.includes("requestGuestCancellationRecoveryAction"),
    "no recovery action wiring on /kontakt",
  );
  assert(
    !page.includes('href="/teilnahme"') &&
      !page.includes("href='/teilnahme'") &&
      !page.includes('href="/teilnahme/'),
    "no generic /teilnahme link",
  );
  assert(
    !/teilnahme\/[0-9a-fA-F-]{8,}/.test(page),
    "no hard-coded participation token",
  );
  assert(
    !page.includes("submit_cancellation_request") &&
      !page.includes("submitCancellationRequest"),
    "no cancellation submit wiring on kontakt",
  );
  assert(
    page.includes("nicht über eine öffentliche"),
    "explains no public team search for cancellation",
  );

  return "ok";
}

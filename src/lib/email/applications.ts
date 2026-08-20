import { APP_NAME } from "@/lib/constants";
import {
  getEmailProvider,
  renderEmailTemplate,
  type SendEmailResult,
} from "@/lib/email/provider";
import type { ApplicationStatus } from "@/types/application";

/**
 * Alle bewerbungsbezogenen E-Mails gehen IMMER an die im Formular angegebene
 * Kontakt-E-Mail (`contact_email`) — unabhängig davon, ob die Bewerbung von
 * einem Gast oder einem eingeloggten Vereinsnutzer stammt.
 *
 * Aktuell ist nur der Noop-Provider angebunden (siehe `getEmailProvider`).
 * Der Versand schlägt daher bewusst "skipped" fehl und blockiert die
 * Bewerbung nicht. Sobald ein echter Provider (z. B. Resend) konfiguriert ist,
 * werden diese E-Mails ohne weitere Änderungen an den Aufrufstellen versendet.
 */

type ApplicationEmailContext = {
  contactEmail: string;
  clubName: string;
  teamName: string;
  tournamentName: string;
};

const CONFIRMATION_SUBJECT = "Eure Bewerbung ist eingegangen";

const CONFIRMATION_BODY = `Hallo {{club_name}},

vielen Dank für die Bewerbung von {{team_name}} für {{tournament_name}}.

Eine Bestätigung wurde an diese E-Mail-Adresse gesendet. Wir prüfen eure Angaben und melden uns anschließend bei euch.

Wichtig: Die Bewerbung stellt noch keine Teilnahmebestätigung dar.

Sportliche Grüße
${APP_NAME}`;

const STATUS_SUBJECTS: Record<ApplicationStatus, string> = {
  new: "Eure Bewerbung ist eingegangen",
  "under-review": "Eure Bewerbung wird geprüft",
  accepted: "Bewerbung angenommen",
  "waiting-list": "Ihr steht auf der Warteliste",
  rejected: "Rückmeldung zu eurer Bewerbung",
};

const STATUS_BODIES: Record<ApplicationStatus, string> = {
  new: CONFIRMATION_BODY,
  "under-review": `Hallo {{club_name}},

die Bewerbung von {{team_name}} für {{tournament_name}} befindet sich aktuell in Prüfung.

Sportliche Grüße
${APP_NAME}`,
  accepted: `Hallo {{club_name}},

wir freuen uns, {{team_name}} für {{tournament_name}} im Teilnehmerfeld begrüßen zu dürfen.

Weitere organisatorische Hinweise folgen rechtzeitig vor dem Turniertag.

Sportliche Grüße
${APP_NAME}`,
  "waiting-list": `Hallo {{club_name}},

{{team_name}} steht für {{tournament_name}} aktuell auf der Warteliste.

Sobald ein Platz frei wird, melden wir uns. Bitte betrachtet das noch nicht als Zusage.

Sportliche Grüße
${APP_NAME}`,
  rejected: `Hallo {{club_name}},

vielen Dank für das Interesse an {{tournament_name}}. Leider können wir {{team_name}} in diesem Teilnehmerfeld nicht berücksichtigen.

Sportliche Grüße
${APP_NAME}`,
};

function buildVariables(context: ApplicationEmailContext) {
  return {
    club_name: context.clubName || "Verein",
    team_name: context.teamName || "eure Mannschaft",
    tournament_name: context.tournamentName || "unser Turnier",
  };
}

export async function sendApplicationReceivedEmail(
  context: ApplicationEmailContext,
): Promise<SendEmailResult> {
  const provider = getEmailProvider();
  const variables = buildVariables(context);

  return provider.send({
    to: context.contactEmail,
    subject: renderEmailTemplate(CONFIRMATION_SUBJECT, variables),
    text: renderEmailTemplate(CONFIRMATION_BODY, variables),
    templateId: "application-received",
  });
}

export async function sendApplicationStatusEmail(
  status: ApplicationStatus,
  context: ApplicationEmailContext,
): Promise<SendEmailResult> {
  const provider = getEmailProvider();
  const variables = buildVariables(context);

  return provider.send({
    to: context.contactEmail,
    subject: renderEmailTemplate(STATUS_SUBJECTS[status], variables),
    text: renderEmailTemplate(STATUS_BODIES[status], variables),
    templateId: `application-${status}`,
  });
}

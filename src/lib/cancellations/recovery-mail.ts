import "server-only";

import { getEmailProvider } from "@/lib/email/provider";
import { buildTournamentHubEmail } from "@/lib/email/tournament-hub-email";
import { formatDateDe } from "@/lib/format";

export type GuestCancellationRecoveryMailInput = {
  to: string;
  contactFirstName?: string | null;
  tournamentName?: string | null;
  tournamentDate?: string | null;
  teamName?: string | null;
  clubName?: string | null;
  participationUrl: string;
};

/**
 * Narrow recovery email — not a cancellation confirmation.
 * Recipient must be the stored applications.contact_email (enforced by caller).
 */
export async function sendGuestCancellationRecoveryEmail(
  input: GuestCancellationRecoveryMailInput,
) {
  const firstName = input.contactFirstName?.trim() || undefined;
  const tournamentName = input.tournamentName?.trim() || "";
  const teamName = input.teamName?.trim() || "";
  const clubName = input.clubName?.trim() || "";
  const tournamentDate = input.tournamentDate
    ? formatDateDe(input.tournamentDate)
    : "";

  const subject = "Zugang zur Turnierteilnahme verwalten";
  const bodyLines = [
    "ihr habt den Zugang zur Verwaltung eurer Turnierteilnahme angefordert.",
    "",
    teamName
      ? `Mannschaft: ${teamName}${clubName ? ` (${clubName})` : ""}`
      : "",
    teamName ? "" : "",
    "Über den persönlichen Link unten könnt ihr eine Absageanfrage stellen.",
    "Die Absage wird erst wirksam, nachdem der VfL Kirchheim die Anfrage geprüft und bestätigt hat.",
    "",
    "Wenn ihr diese Anfrage nicht gestellt habt, könnt ihr diese E-Mail ignorieren.",
  ].filter((line, index, all) => {
    // drop accidental double blanks from optional team line
    if (line === "" && all[index - 1] === "") {
      return false;
    }
    return true;
  });

  const emailContent = buildTournamentHubEmail({
    title: subject,
    bodyText: bodyLines.join("\n"),
    recipientFirstName: firstName,
    tournament: {
      name: tournamentName || undefined,
      date: tournamentDate || undefined,
    },
    cta: {
      label: "Teilnahme verwalten",
      url: input.participationUrl,
    },
  });

  return getEmailProvider().send({
    to: input.to,
    subject,
    text: emailContent.text,
    html: emailContent.html,
  });
}

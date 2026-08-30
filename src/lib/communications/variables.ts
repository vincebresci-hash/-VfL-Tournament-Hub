import { getEmailSiteUrl } from "@/lib/site";
import { formatCurrencyEur } from "@/lib/payments/format";
import { paymentStatusLabel } from "@/lib/payments/labels";
import type { PaymentStatus } from "@/types/payment";

export type CommunicationVariableContext = {
  contactFirstName: string;
  teamName: string;
  clubName: string;
  tournamentName: string;
  tournamentSlug: string;
  meinTurnierplanUrl: string | null;
  participationFee: number | null;
  paymentStatus: PaymentStatus | null;
  confirmationUrl?: string;
};

function cleanOptional(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "";
}

export function buildCommunicationVariables(
  context: CommunicationVariableContext,
): Record<string, string> {
  const siteUrl = getEmailSiteUrl();
  const tournamentUrl = context.tournamentSlug
    ? `${siteUrl}/turniere/${encodeURIComponent(context.tournamentSlug)}`
    : "";
  const scheduleUrl = context.tournamentSlug
    ? `${siteUrl}/turniere/${encodeURIComponent(context.tournamentSlug)}?tab=spielplan`
    : "";
  const liveUrl = `${siteUrl}/live`;
  const meinTurnierplanUrl = cleanOptional(context.meinTurnierplanUrl);

  return {
    contact_first_name: cleanOptional(context.contactFirstName) || "Team",
    team_name: cleanOptional(context.teamName) || "Mannschaft",
    club_name: cleanOptional(context.clubName) || "Verein",
    tournament_name: cleanOptional(context.tournamentName) || "Turnier",
    tournament_url: tournamentUrl,
    schedule_url: scheduleUrl,
    live_url: liveUrl,
    meinturnierplan_url: meinTurnierplanUrl,
    participation_fee:
      context.participationFee != null
        ? formatCurrencyEur(context.participationFee)
        : "",
    payment_status_label: context.paymentStatus
      ? paymentStatusLabel[context.paymentStatus]
      : "",
    confirmation_url: cleanOptional(context.confirmationUrl),
  };
}

export function stripUnresolvedPlaceholders(text: string) {
  return text.replace(/\{\{\s*[a-z0-9_]+\s*\}\}/gi, "").replace(/[ \t]+\n/g, "\n");
}

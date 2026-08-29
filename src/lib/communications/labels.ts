import type { CommunicationType, CommunicationRecipientFilter } from "@/types/communication";
import { formatDateTimeDe } from "@/lib/format";

export function communicationTypeLabel(type: CommunicationType): string {
  const labels: Record<CommunicationType, string> = {
    "tournament-info": "Turnierinformation",
    schedule: "Spielplan",
    "important-change": "Wichtige Änderung",
    "payment-reminder": "Zahlungserinnerung",
    general: "Allgemeine Nachricht",
  };

  return labels[type];
}

export function communicationRecipientFilterLabel(
  filter: CommunicationRecipientFilter,
): string {
  const labels: Record<CommunicationRecipientFilter, string> = {
    accepted: "Angenommene Teams",
    "payment-paid": "Zahlung eingegangen",
    "payment-pending": "Zahlung ausstehend",
    waitlist: "Warteliste",
    custom: "Individuelle Auswahl",
  };

  return labels[filter];
}

export function communicationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Entwurf",
    sending: "Wird gesendet",
    sent: "Versendet",
    partially_sent: "Teilweise versendet",
    failed: "Fehlgeschlagen",
    cancelled: "Abgebrochen",
  };

  return labels[status] ?? status;
}

export function communicationRecipientSendStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Ausstehend",
    sending: "Wird gesendet",
    sent: "Versendet",
    failed: "Fehlgeschlagen",
    skipped: "Übersprungen",
  };

  return labels[status] ?? status;
}

export function communicationRecipientConfirmationStatusLabel(
  confirmedAt: string | null,
): string {
  if (!confirmedAt) {
    return "Ausstehend";
  }

  return `Bestätigt am ${formatDateTimeDe(confirmedAt)}`;
}

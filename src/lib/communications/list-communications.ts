import type {
  CommunicationListItem,
  CommunicationRecipientFilter,
  CommunicationRecipientSource,
  CommunicationType,
} from "@/types/communication";

export type CommunicationListRow = {
  id: string;
  tournament_id: string;
  recipient_source: string | null;
  type: string;
  subject: string;
  important: boolean;
  require_confirmation: boolean | null;
  recipient_filter: string;
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  sent_at: string | null;
};

export type TournamentLookup = {
  id: string;
  name: string;
  slug: string;
};

export type CommunicationRecipientConfirmationRow = {
  communication_id: string;
  confirmed_at: string | null;
};

function asCommunicationType(value: string): CommunicationType {
  const allowed: CommunicationType[] = [
    "tournament-info",
    "schedule",
    "important-change",
    "payment-reminder",
    "general",
  ];

  return allowed.includes(value as CommunicationType)
    ? (value as CommunicationType)
    : "general";
}

function asRecipientFilter(value: string): CommunicationRecipientFilter {
  const allowed: CommunicationRecipientFilter[] = [
    "accepted",
    "payment-paid",
    "payment-pending",
    "waitlist",
    "custom",
  ];

  return allowed.includes(value as CommunicationRecipientFilter)
    ? (value as CommunicationRecipientFilter)
    : "accepted";
}

function asRecipientSource(value: string): CommunicationRecipientSource {
  return value === "team-directory" ? "team-directory" : "tournament-applications";
}

export function aggregateConfirmedCounts(
  rows: CommunicationRecipientConfirmationRow[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (row.confirmed_at == null) {
      continue;
    }

    counts.set(row.communication_id, (counts.get(row.communication_id) ?? 0) + 1);
  }

  return counts;
}

export function buildCommunicationListItems(input: {
  rows: CommunicationListRow[];
  tournamentsById: Map<string, TournamentLookup>;
  confirmedCountsByCommunicationId: Map<string, number>;
}): CommunicationListItem[] {
  return input.rows.map((row) => {
    const tournament = input.tournamentsById.get(row.tournament_id);

    return {
      id: row.id,
      tournamentId: row.tournament_id,
      tournamentName: tournament?.name ?? "Turnier",
      tournamentSlug: tournament?.slug ?? "",
      recipientSource: asRecipientSource(row.recipient_source ?? "tournament-applications"),
      type: asCommunicationType(row.type),
      subject: row.subject,
      important: row.important,
      requireConfirmation: row.require_confirmation ?? false,
      recipientFilter: asRecipientFilter(row.recipient_filter),
      status: row.status as CommunicationListItem["status"],
      recipientCount: row.recipient_count,
      sentCount: row.sent_count,
      failedCount: row.failed_count,
      confirmedCount: input.confirmedCountsByCommunicationId.get(row.id) ?? 0,
      createdAt: row.created_at,
      sentAt: row.sent_at,
    };
  });
}

export const COMMUNICATION_LIST_USER_ERROR =
  "Kommunikationen konnten nicht geladen werden. Bitte später erneut versuchen.";

"use server";

import { revalidatePath } from "next/cache";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import {
  COMMUNICATION_RECIPIENT_FILTERS,
  COMMUNICATION_TYPES,
  type CommunicationComposeInput,
  type CommunicationRecipientFilter,
  type CommunicationType,
} from "@/types/communication";
import {
  isRecipientFilterAllowed,
  requiresCustomApplicationIds,
} from "@/lib/communications/recipient-filters";
import {
  previewCommunicationRecipients,
  listCommunications,
  getCommunicationDetail,
  listEligibleApplicationsForTournament,
} from "@/lib/communications/queries";
import { sendTournamentCommunication } from "@/lib/communications/communication-mail";

export type CommunicationActionResult = {
  error: string | null;
  notice?: string | null;
  communicationId?: string | null;
};

function parseCommunicationType(value: string): CommunicationType | null {
  return COMMUNICATION_TYPES.includes(value as CommunicationType)
    ? (value as CommunicationType)
    : null;
}

function parseRecipientFilter(value: string): CommunicationRecipientFilter | null {
  return COMMUNICATION_RECIPIENT_FILTERS.includes(value as CommunicationRecipientFilter)
    ? (value as CommunicationRecipientFilter)
    : null;
}

async function requireAdmin() {
  const session = await getAuthSession();
  if (!session || !canAccessAdmin(session.user.role)) {
    return { session: null, error: "Kein Adminzugang." };
  }

  return { session, error: null };
}

export async function previewCommunicationRecipientsAction(input: {
  tournamentId: string;
  type: string;
  recipientFilter: string;
  applicationIds?: string[];
}): Promise<{
  recipients: Awaited<ReturnType<typeof previewCommunicationRecipients>>["recipients"];
  error: string | null;
}> {
  const access = await requireAdmin();
  if (access.error) {
    return { recipients: [], error: access.error };
  }

  const type = parseCommunicationType(input.type);
  const recipientFilter = parseRecipientFilter(input.recipientFilter);

  if (!type || !recipientFilter) {
    return { recipients: [], error: "Ungültige Auswahl." };
  }

  if (!isRecipientFilterAllowed({ type, filter: recipientFilter })) {
    return {
      recipients: [],
      error:
        "Zahlungserinnerungen sind nur für ausstehende Zahlungen oder eine individuelle Auswahl erlaubt.",
    };
  }

  if (requiresCustomApplicationIds(recipientFilter)) {
    if (!input.applicationIds?.length) {
      return { recipients: [], error: "Bitte mindestens ein Team auswählen." };
    }
  }

  const result = await previewCommunicationRecipients({
    tournamentId: input.tournamentId,
    type,
    recipientFilter,
    applicationIds: input.applicationIds,
  });

  if (!result.ready) {
    return {
      recipients: [],
      error: "Kommunikationsmodul ist noch nicht migriert.",
    };
  }

  return { recipients: result.recipients, error: null };
}

export async function sendCommunicationAction(
  input: CommunicationComposeInput,
): Promise<CommunicationActionResult> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const type = parseCommunicationType(input.type);
  const recipientFilter = parseRecipientFilter(input.recipientFilter);

  if (!type || !recipientFilter) {
    return { error: "Ungültige Auswahl." };
  }

  if (!input.tournamentId?.trim()) {
    return { error: "Bitte ein Turnier auswählen." };
  }

  if (!input.subject.trim() || !input.body.trim()) {
    return { error: "Betreff und Nachricht sind erforderlich." };
  }

  if (!input.idempotencyKey.trim()) {
    return { error: "Sende-Vorgang konnte nicht eindeutig identifiziert werden." };
  }

  if (!isRecipientFilterAllowed({ type, filter: recipientFilter })) {
    return {
      error:
        "Zahlungserinnerungen sind nur für ausstehende Zahlungen oder eine individuelle Auswahl erlaubt.",
    };
  }

  if (requiresCustomApplicationIds(recipientFilter) && !input.applicationIds?.length) {
    return { error: "Bitte mindestens ein Team auswählen." };
  }

  const preview = await previewCommunicationRecipients({
    tournamentId: input.tournamentId,
    type,
    recipientFilter,
    applicationIds: input.applicationIds,
  });

  if (!preview.ready) {
    return { error: "Kommunikationsmodul ist noch nicht migriert." };
  }

  if (preview.recipients.length === 0) {
    return { error: "Keine berechtigten Empfänger gefunden." };
  }

  const result = await sendTournamentCommunication({
    compose: {
      ...input,
      type,
      recipientFilter,
    },
    actorId: access.session.user.id,
  });

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath("/admin/kommunikation");
  if (result.communicationId) {
    revalidatePath(`/admin/kommunikation/${result.communicationId}`);
  }

  return {
    error: null,
    communicationId: result.communicationId,
    notice:
      result.failedCount > 0
        ? `${result.sentCount} versendet, ${result.failedCount} fehlgeschlagen.`
        : `${result.sentCount} E-Mail${result.sentCount === 1 ? "" : "s"} versendet.`,
  };
}

export async function loadCommunicationsAction() {
  const access = await requireAdmin();
  if (access.error) {
    return { communications: [], ready: false, error: access.error };
  }

  const result = await listCommunications();
  return { ...result, error: null };
}

export async function loadCommunicationDetailAction(communicationId: string) {
  const access = await requireAdmin();
  if (access.error) {
    return { communication: null, error: access.error };
  }

  const communication = await getCommunicationDetail(communicationId);
  if (!communication) {
    return { communication: null, error: "Kommunikation nicht gefunden." };
  }

  return { communication, error: null };
}

export async function loadEligibleCommunicationApplicationsAction(tournamentId: string) {
  const access = await requireAdmin();
  if (access.error) {
    return { applications: [], error: access.error };
  }

  if (!tournamentId) {
    return { applications: [], error: null };
  }

  const applications = await listEligibleApplicationsForTournament(tournamentId);
  return { applications, error: null };
}

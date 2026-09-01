"use server";

import { revalidatePath } from "next/cache";
import {
  requireCommunicationsManage,
  requireCommunicationsView,
  requireTeamsView,
} from "@/lib/rbac/action-access";
import { getCommunicationTeamDirectoryAccess } from "@/lib/communications/access";
import {
  COMMUNICATION_RECIPIENT_SOURCES,
  COMMUNICATION_TYPES,
  type CommunicationComposeInput,
  type CommunicationRecipientFilter,
  type CommunicationRecipientSource,
  type CommunicationType,
} from "@/types/communication";
import {
  isRecipientFilterAllowed,
  isTypeAllowedForRecipientSource,
  requiresCustomApplicationIds,
  requiresCustomDirectoryEntryIds,
} from "@/lib/communications/recipient-filters";
import {
  previewCommunicationRecipients,
  listCommunications,
  getCommunicationDetail,
  listEligibleApplicationsForTournament,
  listEligibleDirectoryEntriesForCommunication,
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
  return ["accepted", "payment-paid", "payment-pending", "waitlist", "custom"].includes(
    value,
  )
    ? (value as CommunicationRecipientFilter)
    : null;
}

function parseRecipientSource(value: string): CommunicationRecipientSource | null {
  return COMMUNICATION_RECIPIENT_SOURCES.includes(value as CommunicationRecipientSource)
    ? (value as CommunicationRecipientSource)
    : null;
}

function paymentReminderDirectoryError() {
  return "Zahlungserinnerungen sind für die Team-Datenbank nicht verfügbar.";
}

export async function previewCommunicationRecipientsAction(input: {
  tournamentId: string;
  type: string;
  recipientFilter: string;
  recipientSource: string;
  applicationIds?: string[];
  teamDirectoryEntryIds?: string[];
}): Promise<{
  recipients: Awaited<ReturnType<typeof previewCommunicationRecipients>>["recipients"];
  error: string | null;
}> {
  const access = await requireCommunicationsView();
  if (access.error) {
    return { recipients: [], error: access.error };
  }

  const type = parseCommunicationType(input.type);
  const recipientFilter = parseRecipientFilter(input.recipientFilter);
  const recipientSource = parseRecipientSource(input.recipientSource);

  if (!type || !recipientFilter || !recipientSource) {
    return { recipients: [], error: "Ungültige Auswahl." };
  }

  if (!isTypeAllowedForRecipientSource({ type, recipientSource })) {
    return { recipients: [], error: paymentReminderDirectoryError() };
  }

  if (recipientSource === "team-directory") {
    const directoryAccess = await getCommunicationTeamDirectoryAccess();
    if (!directoryAccess.canUseTeamDirectorySource) {
      return { recipients: [], error: "Keine Berechtigung für die Team-Datenbank." };
    }

    if (!requiresCustomDirectoryEntryIds(recipientSource)) {
      return { recipients: [], error: "Ungültige Empfängerquelle." };
    }

    if (!input.teamDirectoryEntryIds?.length) {
      return { recipients: [], error: "Bitte mindestens ein Team auswählen." };
    }
  } else if (!isRecipientFilterAllowed({ type, filter: recipientFilter })) {
    return {
      recipients: [],
      error:
        "Zahlungserinnerungen sind nur für ausstehende Zahlungen oder eine individuelle Auswahl erlaubt.",
    };
  } else if (requiresCustomApplicationIds(recipientFilter)) {
    if (!input.applicationIds?.length) {
      return { recipients: [], error: "Bitte mindestens ein Team auswählen." };
    }
  }

  const result = await previewCommunicationRecipients({
    tournamentId: input.tournamentId,
    type,
    recipientFilter,
    recipientSource,
    applicationIds: input.applicationIds,
    teamDirectoryEntryIds: input.teamDirectoryEntryIds,
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
  const access = await requireCommunicationsManage();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const type = parseCommunicationType(input.type);
  const recipientFilter = parseRecipientFilter(input.recipientFilter);
  const recipientSource = parseRecipientSource(input.recipientSource);

  if (!type || !recipientFilter || !recipientSource) {
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

  if (!isTypeAllowedForRecipientSource({ type, recipientSource })) {
    return { error: paymentReminderDirectoryError() };
  }

  if (recipientSource === "team-directory") {
    const directoryAccess = await getCommunicationTeamDirectoryAccess();
    if (!directoryAccess.canUseTeamDirectorySource) {
      return { error: "Keine Berechtigung für die Team-Datenbank." };
    }

    if (!input.teamDirectoryEntryIds?.length) {
      return { error: "Bitte mindestens ein Team auswählen." };
    }
  } else {
    if (!isRecipientFilterAllowed({ type, filter: recipientFilter })) {
      return {
        error:
          "Zahlungserinnerungen sind nur für ausstehende Zahlungen oder eine individuelle Auswahl erlaubt.",
      };
    }

    if (requiresCustomApplicationIds(recipientFilter) && !input.applicationIds?.length) {
      return { error: "Bitte mindestens ein Team auswählen." };
    }
  }

  const preview = await previewCommunicationRecipients({
    tournamentId: input.tournamentId,
    type,
    recipientFilter,
    recipientSource,
    applicationIds: input.applicationIds,
    teamDirectoryEntryIds: input.teamDirectoryEntryIds,
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
      recipientSource,
    },
    actorId: access.session.user.id,
  });

  if (result.error) {
    return {
      error: result.error,
      communicationId: result.communicationId,
      notice: result.notice,
    };
  }

  revalidatePath("/admin/kommunikation");
  if (result.communicationId) {
    revalidatePath(`/admin/kommunikation/${result.communicationId}`);
  }

  return {
    error: null,
    communicationId: result.communicationId,
    notice: result.notice,
  };
}

export async function loadCommunicationsAction() {
  const access = await requireCommunicationsView();
  if (access.error) {
    return { communications: [], ready: false, error: access.error };
  }

  const result = await listCommunications();
  return { ...result, error: result.error };
}

export async function loadCommunicationDetailAction(communicationId: string) {
  const access = await requireCommunicationsView();
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
  const access = await requireCommunicationsView();
  if (access.error) {
    return { applications: [], error: access.error };
  }

  if (!tournamentId) {
    return { applications: [], error: null };
  }

  const applications = await listEligibleApplicationsForTournament(tournamentId);
  return { applications, error: null };
}

export async function loadEligibleCommunicationDirectoryEntriesAction() {
  const viewAccess = await requireCommunicationsView();
  if (viewAccess.error) {
    return { entries: [], ready: false, error: viewAccess.error };
  }

  const teamsAccess = await requireTeamsView();
  if (teamsAccess.error) {
    return { entries: [], ready: false, error: teamsAccess.error };
  }

  const directoryAccess = await getCommunicationTeamDirectoryAccess();
  if (!directoryAccess.canUseTeamDirectorySource) {
    return { entries: [], ready: true, error: "Keine Berechtigung für die Team-Datenbank." };
  }

  const result = await listEligibleDirectoryEntriesForCommunication();
  return { entries: result.entries, ready: result.ready, error: null };
}

export async function loadCommunicationTeamDirectoryAccessAction() {
  const viewAccess = await requireCommunicationsView();
  if (viewAccess.error) {
    return { canUseTeamDirectorySource: false, error: viewAccess.error };
  }

  const directoryAccess = await getCommunicationTeamDirectoryAccess();
  return {
    canUseTeamDirectorySource: directoryAccess.canUseTeamDirectorySource,
    error: null,
  };
}

"use server";

import { revalidatePath } from "next/cache";
import {
  requireCommunicationsManage,
  requireCommunicationsView,
  requirePermissionAccess,
  requireTeamsView,
} from "@/lib/rbac/action-access";
import { createClient } from "@/lib/supabase/server";
import { toUserFacingDbError } from "@/lib/db/errors";
import { getCommunicationTeamDirectoryAccess } from "@/lib/communications/access";
import {
  COMMUNICATION_RECIPIENT_SOURCES,
  COMMUNICATION_TYPES,
  type CommunicationArchiveFilter,
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

export async function archiveCommunicationAction(
  communicationId: string,
): Promise<CommunicationActionResult> {
  const access = await requirePermissionAccess("communications.manage");
  if (access.error || !access.session) {
    return { error: access.error ?? "Keine Berechtigung für diese Aktion." };
  }

  const id = communicationId.trim();
  if (!id) {
    return { error: "Kommunikation nicht gefunden." };
  }

  const supabase = await createClient();
  const { data: current, error: loadError } = await supabase
    .from("tournament_communications")
    .select("id, status, archived_at")
    .eq("id", id)
    .maybeSingle();

  if (loadError || !current) {
    return {
      error: toUserFacingDbError("Die Nachricht wurde nicht gefunden.", loadError),
    };
  }

  if (current.status === "sending") {
    return {
      error: "Laufende Versände können nicht archiviert werden.",
    };
  }

  if (current.archived_at) {
    return {
      error: null,
      notice: "Die Nachricht ist bereits archiviert.",
      communicationId: current.id,
    };
  }

  const { data: updated, error } = await supabase
    .from("tournament_communications")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null)
    .neq("status", "sending")
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      error: toUserFacingDbError("Die Nachricht konnte nicht archiviert werden.", error),
    };
  }

  if (!updated) {
    const { data: latest, error: latestError } = await supabase
      .from("tournament_communications")
      .select("id, status, archived_at")
      .eq("id", id)
      .maybeSingle();

    if (latestError || !latest) {
      return {
        error: toUserFacingDbError(
          "Die Nachricht wurde nicht gefunden.",
          latestError,
        ),
      };
    }

    if (latest.archived_at) {
      return {
        error: null,
        notice: "Die Nachricht ist bereits archiviert.",
        communicationId: latest.id,
      };
    }

    if (latest.status === "sending") {
      return {
        error: "Laufende Versände können nicht archiviert werden.",
      };
    }

    return {
      error: "Die Nachricht konnte nicht archiviert werden.",
    };
  }

  revalidatePath("/admin/kommunikation");
  revalidatePath(`/admin/kommunikation/${id}`);

  return {
    error: null,
    notice: "Nachricht archiviert.",
    communicationId: updated.id,
  };
}

export async function deleteArchivedCommunicationAction(
  communicationId: string,
): Promise<CommunicationActionResult> {
  const access = await requirePermissionAccess("communications.manage");
  if (access.error || !access.session) {
    return { error: access.error ?? "Keine Berechtigung für diese Aktion." };
  }

  const id = communicationId.trim();
  if (!id) {
    return { error: "Kommunikation nicht gefunden." };
  }

  const supabase = await createClient();
  const { data: current, error: loadError } = await supabase
    .from("tournament_communications")
    .select("id, status, archived_at")
    .eq("id", id)
    .maybeSingle();

  if (loadError || !current) {
    return {
      error: toUserFacingDbError("Die Nachricht wurde nicht gefunden.", loadError),
    };
  }

  if (!current.archived_at) {
    return {
      error: "Nur archivierte Nachrichten können endgültig gelöscht werden.",
    };
  }

  if (current.status === "sending") {
    return {
      error: "Laufende Versände können nicht gelöscht werden.",
    };
  }

  const { data: outcome, error } = await supabase.rpc(
    "hard_delete_archived_communication",
    { p_communication_id: id },
  );

  if (error) {
    return {
      error: toUserFacingDbError(
        "Die Nachricht konnte nicht gelöscht werden.",
        error,
      ),
    };
  }

  if (outcome === "deleted") {
    revalidatePath("/admin/kommunikation");
    revalidatePath("/admin/kommunikation?archive=archived");
    revalidatePath(`/admin/kommunikation/${id}`);

    return {
      error: null,
      notice: "Nachricht endgültig gelöscht.",
      communicationId: id,
    };
  }

  if (outcome === "not_found") {
    return { error: "Die Nachricht wurde nicht gefunden." };
  }

  if (outcome === "sending") {
    return { error: "Laufende Versände können nicht gelöscht werden." };
  }

  if (outcome === "not_archived") {
    return {
      error: "Nur archivierte Nachrichten können endgültig gelöscht werden.",
    };
  }

  return { error: "Die Nachricht konnte nicht gelöscht werden." };
}

export async function restoreCommunicationAction(
  communicationId: string,
): Promise<CommunicationActionResult> {
  const access = await requirePermissionAccess("communications.manage");
  if (access.error || !access.session) {
    return { error: access.error ?? "Keine Berechtigung für diese Aktion." };
  }

  const id = communicationId.trim();
  if (!id) {
    return { error: "Kommunikation nicht gefunden." };
  }

  const supabase = await createClient();
  const { data: current, error: loadError } = await supabase
    .from("tournament_communications")
    .select("id, archived_at")
    .eq("id", id)
    .maybeSingle();

  if (loadError || !current) {
    return {
      error: toUserFacingDbError("Die Nachricht wurde nicht gefunden.", loadError),
    };
  }

  if (!current.archived_at) {
    return {
      error: null,
      notice: "Die Nachricht ist nicht archiviert.",
      communicationId: current.id,
    };
  }

  const { error } = await supabase
    .from("tournament_communications")
    .update({ archived_at: null })
    .eq("id", id);

  if (error) {
    return {
      error: toUserFacingDbError(
        "Die Nachricht konnte nicht wiederhergestellt werden.",
        error,
      ),
    };
  }

  revalidatePath("/admin/kommunikation");
  revalidatePath(`/admin/kommunikation/${id}`);

  return {
    error: null,
    notice: "Nachricht wiederhergestellt.",
    communicationId: id,
  };
}

export async function loadCommunicationsAction(input?: {
  archive?: CommunicationArchiveFilter;
}) {
  const access = await requireCommunicationsView();
  if (access.error) {
    return { communications: [], ready: false, error: access.error };
  }

  const result = await listCommunications({ archive: input?.archive ?? "active" });
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

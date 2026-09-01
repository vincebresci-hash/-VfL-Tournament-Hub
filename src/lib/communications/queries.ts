import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import {
  aggregateConfirmedCounts,
  buildCommunicationListItems,
  COMMUNICATION_LIST_USER_ERROR,
  type CommunicationListRow,
  type TournamentLookup,
} from "@/lib/communications/list-communications";
import { toTeamDirectoryEntry } from "@/lib/team-directory/mappers";
import type { CommunicationEligibleApplication } from "@/lib/communications/recipient-picker";
import type { CommunicationEligibleDirectoryEntry } from "@/lib/communications/team-directory-recipient-picker";
import type {
  CommunicationDetail,
  CommunicationListItem,
  CommunicationRecipientPreview,
  CommunicationRecipientFilter,
  CommunicationRecipientSource,
  CommunicationType,
} from "@/types/communication";

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

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

const DIRECTORY_ENTRY_SELECT = `
  id,
  club_name,
  team_name,
  age_group,
  contact_first_name,
  contact_last_name,
  contact_role,
  contact_email,
  contact_phone,
  website,
  league,
  birth_year,
  division,
  self_rated_strength,
  internal_category,
  internal_strength,
  internal_notes,
  source,
  source_application_id,
  club_id,
  team_id,
  archived_at,
  created_at,
  updated_at
`;

export async function previewCommunicationRecipients(input: {
  tournamentId: string;
  type: CommunicationType;
  recipientFilter: CommunicationRecipientFilter;
  recipientSource: CommunicationRecipientSource;
  applicationIds?: string[];
  teamDirectoryEntryIds?: string[];
}): Promise<{ recipients: CommunicationRecipientPreview[]; ready: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_communication_recipients", {
    p_tournament_id: input.tournamentId,
    p_communication_type: input.type,
    p_recipient_filter: input.recipientFilter,
    p_application_ids:
      input.applicationIds && input.applicationIds.length > 0
        ? input.applicationIds
        : null,
    p_recipient_source: input.recipientSource,
    p_team_directory_entry_ids:
      input.teamDirectoryEntryIds && input.teamDirectoryEntryIds.length > 0
        ? input.teamDirectoryEntryIds
        : null,
  });

  if (error || !data) {
    return { recipients: [], ready: !isMissingRelationError(error) };
  }

  return {
    ready: true,
    recipients: data.map((row) => ({
      applicationId: row.application_id,
      teamDirectoryEntryId: row.team_directory_entry_id,
      recipientEmail: row.recipient_email,
      recipientTeamName: row.recipient_team_name,
      recipientClubName: row.recipient_club_name,
      recipientContactFirstName: row.recipient_contact_first_name,
    })),
  };
}

function logCommunicationListQueryError(
  scope: string,
  error: { code?: string; message?: string } | null,
) {
  console.error(`[communications.list] ${scope}`, {
    code: error?.code ?? "unknown",
    message: error?.message ?? "unknown",
  });
}

async function loadTournamentsById(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournamentIds: string[],
): Promise<Map<string, TournamentLookup>> {
  const tournamentsById = new Map<string, TournamentLookup>();

  if (tournamentIds.length === 0) {
    return tournamentsById;
  }

  const { data, error } = await supabase
    .from("tournaments")
    .select("id, name, slug")
    .in("id", tournamentIds);

  if (error) {
    logCommunicationListQueryError("tournament lookup failed", error);
    return tournamentsById;
  }

  for (const tournament of data ?? []) {
    tournamentsById.set(tournament.id, tournament);
  }

  return tournamentsById;
}

async function loadConfirmedCountsByCommunicationId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  communicationIds: string[],
): Promise<Map<string, number>> {
  if (communicationIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("communication_recipients")
    .select("communication_id, confirmed_at")
    .in("communication_id", communicationIds);

  if (error) {
    logCommunicationListQueryError("confirmation lookup failed", error);
    return new Map();
  }

  return aggregateConfirmedCounts(data ?? []);
}

export async function listCommunications(): Promise<{
  communications: CommunicationListItem[];
  ready: boolean;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournament_communications")
    .select(
      "id, tournament_id, recipient_source, type, subject, important, require_confirmation, recipient_filter, status, recipient_count, sent_count, failed_count, created_at, sent_at",
    )
    .neq("status", "draft")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingRelationError(error)) {
      return { communications: [], ready: false, error: null };
    }

    logCommunicationListQueryError("list query failed", error);
    return {
      communications: [],
      ready: true,
      error: COMMUNICATION_LIST_USER_ERROR,
    };
  }

  const rows = (data ?? []) as CommunicationListRow[];
  const tournamentIds = [...new Set(rows.map((row) => row.tournament_id))];
  const communicationIds = rows.map((row) => row.id);

  const [tournamentsById, confirmedCountsByCommunicationId] = await Promise.all([
    loadTournamentsById(supabase, tournamentIds),
    loadConfirmedCountsByCommunicationId(supabase, communicationIds),
  ]);

  return {
    ready: true,
    error: null,
    communications: buildCommunicationListItems({
      rows,
      tournamentsById,
      confirmedCountsByCommunicationId,
    }),
  };
}

export async function getCommunicationDetail(
  communicationId: string,
): Promise<CommunicationDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournament_communications")
    .select(
      "id, tournament_id, recipient_source, type, subject, body, important, require_confirmation, recipient_filter, status, recipient_count, sent_count, failed_count, created_at, sent_at, tournaments (id, name, slug), communication_recipients (id, application_id, team_directory_entry_id, recipient_email, recipient_team_name, recipient_club_name, send_status, sent_at, confirmed_at, error_message)",
    )
    .eq("id", communicationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const tournament = firstRelation(
    data.tournaments as
      | { id: string; name: string; slug: string }
      | { id: string; name: string; slug: string }[]
      | null,
  );
  const recipients = (data.communication_recipients ?? []) as Array<{
    id: string;
    application_id: string | null;
    team_directory_entry_id: string | null;
    recipient_email: string;
    recipient_team_name: string;
    recipient_club_name: string | null;
    send_status: string;
    sent_at: string | null;
    confirmed_at: string | null;
    error_message: string | null;
  }>;

  const confirmedCount = recipients.filter((recipient) => recipient.confirmed_at != null).length;

  return {
    id: data.id,
    tournamentId: data.tournament_id,
    tournamentName: tournament?.name ?? "Turnier",
    tournamentSlug: tournament?.slug ?? "",
    recipientSource: asRecipientSource(data.recipient_source ?? "tournament-applications"),
    type: asCommunicationType(data.type),
    subject: data.subject,
    body: data.body,
    important: data.important,
    requireConfirmation: data.require_confirmation ?? false,
    recipientFilter: asRecipientFilter(data.recipient_filter),
    status: data.status as CommunicationListItem["status"],
    recipientCount: data.recipient_count,
    sentCount: data.sent_count,
    failedCount: data.failed_count,
    confirmedCount,
    createdAt: data.created_at,
    sentAt: data.sent_at,
    recipients: recipients
      .map((recipient) => ({
        id: recipient.id,
        applicationId: recipient.application_id,
        teamDirectoryEntryId: recipient.team_directory_entry_id,
        recipientEmail: recipient.recipient_email,
        recipientTeamName: recipient.recipient_team_name,
        recipientClubName: recipient.recipient_club_name,
        sendStatus: recipient.send_status as CommunicationDetail["recipients"][number]["sendStatus"],
        sentAt: recipient.sent_at,
        confirmedAt: recipient.confirmed_at,
        errorMessage: recipient.error_message,
      }))
      .sort((a, b) => a.recipientTeamName.localeCompare(b.recipientTeamName, "de")),
  };
}

export async function listEligibleApplicationsForTournament(
  tournamentId: string,
): Promise<CommunicationEligibleApplication[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select(
      "id, status, contact_email, team_name, club_name, payment_status, participation_fee, age_group, club_id, team_id",
    )
    .eq("tournament_id", tournamentId)
    .not("status", "in", '("cancelled","rejected")')
    .order("team_name", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data
    .filter((row) => row.contact_email?.trim())
    .map((row) => ({
      id: row.id,
      status: row.status,
      contactEmail: row.contact_email!.trim(),
      teamName: row.team_name?.trim() || "Mannschaft",
      clubName: row.club_name?.trim() || null,
      ageGroup: row.age_group?.trim() || null,
      isHubTeam: row.club_id != null && row.team_id != null,
      paymentStatus: row.payment_status,
      participationFee: row.participation_fee,
    }));
}

export async function listEligibleDirectoryEntriesForCommunication(): Promise<{
  entries: CommunicationEligibleDirectoryEntry[];
  ready: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_directory_entries")
    .select(DIRECTORY_ENTRY_SELECT)
    .is("archived_at", null)
    .order("club_name", { ascending: true })
    .order("team_name", { ascending: true });

  if (error) {
    if (isMissingRelationError(error)) {
      return { entries: [], ready: false };
    }

    throw error;
  }

  return {
    ready: true,
    entries: (data ?? []).map((row) => toTeamDirectoryEntry(row)),
  };
}

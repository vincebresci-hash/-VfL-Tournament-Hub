import { createClient } from "@/lib/supabase/server";
import {
  confirmedExternalTeamIsActive,
  interpretConfirmedParticipantRead,
  type ConfirmedExternalIdentityRow,
  type ConfirmedParticipantReadResult,
} from "@/lib/schedule/confirmed-participant-identities";

/**
 * Server-authoritative confirmed participant identities.
 *
 * Accepted applications for a visible, non-archived tournament come from
 * tournament_public_roster. That existing function reads every accepted
 * application for the slug and returns only public roster columns. A direct
 * applications SELECT is not used: applications.view is club-scoped, and
 * TOURNAMENT_MANAGER does not have it, so a successful SELECT can be partial.
 *
 * Confirmed external teams come from tournament_external_teams. Their SELECT
 * policy is tournament visibility, not club membership.
 *
 * Archived tournaments are omitted by tournament_public_roster. Completeness
 * cannot be proved for them under current policies, so this reader fails
 * closed. The minimum later database change is a narrowly scoped read of
 * accepted application ids for one tournament, available to tournaments.manage,
 * returning only the application id. It must not grant applications.view and
 * is intentionally not added here.
 *
 * This reader uses the signed-in server client. It does not use the service
 * role and does not add a SECURITY DEFINER function.
 */
export async function readConfirmedParticipantIdentities(
  tournamentId: string,
): Promise<ConfirmedParticipantReadResult> {
  const supabase = await createClient();
  const tournament = await supabase
    .from("tournaments")
    .select("id, slug, archived_at")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tournament.error) {
    return interpretConfirmedParticipantRead({
      tournamentFound: true,
      archived: false,
      rosterError: true,
      rosterRows: null,
      externalError: true,
      externalRows: null,
    });
  }
  if (!tournament.data) {
    return interpretConfirmedParticipantRead({
      tournamentFound: false,
      archived: false,
      rosterError: false,
      rosterRows: null,
      externalError: false,
      externalRows: null,
    });
  }
  if (!tournament.data.slug) {
    return interpretConfirmedParticipantRead({
      tournamentFound: true,
      archived: false,
      rosterError: true,
      rosterRows: null,
      externalError: false,
      externalRows: null,
    });
  }
  if (tournament.data.archived_at) {
    return interpretConfirmedParticipantRead({
      tournamentFound: true,
      archived: true,
      rosterError: false,
      rosterRows: null,
      externalError: false,
      externalRows: null,
    });
  }

  const [roster, external] = await Promise.all([
    supabase.rpc("tournament_public_roster", { p_slug: tournament.data.slug }),
    supabase
      .from("tournament_external_teams")
      .select("id, application_id, participation_status, external_active")
      .eq("tournament_id", tournamentId),
  ]);

  const externalRows: ConfirmedExternalIdentityRow[] | null = external.data
    ? external.data.map((row) => ({
        id: String(row.id),
        applicationId: row.application_id ? String(row.application_id) : null,
        participationStatus: String(row.participation_status ?? "detected"),
        externalActive: confirmedExternalTeamIsActive(row.external_active),
      }))
    : null;

  return interpretConfirmedParticipantRead({
    tournamentFound: true,
    archived: false,
    rosterError: Boolean(roster.error),
    rosterRows: roster.data
      ? roster.data.map((row) => ({ applicationId: String(row.application_id ?? "") }))
      : null,
    externalError: Boolean(external.error),
    externalRows,
  });
}

import { createClient } from "@/lib/supabase/server";
import { toUserFacingDbError } from "@/lib/db/errors";
import {
  PARTICIPANT_MEMBERSHIP_CLEANUP_FAILED_MESSAGE,
  PARTICIPANT_MEMBERSHIP_MISSING_MESSAGE,
  PARTICIPANT_NOT_FOUND_MESSAGE,
  canMutateParticipantMembership,
  type MembershipCleanupResult,
} from "@/lib/tournament-participant-membership";

export type TournamentMetaForParticipantMutation = {
  id: string;
  slug: string;
  status: string | null;
};

export async function loadTournamentForParticipantMutation(
  tournamentId: string,
): Promise<{ tournament: TournamentMetaForParticipantMutation | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, slug, status")
    .eq("id", tournamentId)
    .maybeSingle();

  if (error || !data) {
    return {
      tournament: null,
      error: toUserFacingDbError("Das Turnier wurde nicht gefunden.", error),
    };
  }

  return {
    tournament: {
      id: String(data.id),
      slug: String(data.slug),
      status: data.status ? String(data.status) : null,
    },
    error: null,
  };
}

/** Server reread: any tournament_matches row blocks participant/group mutations. */
export async function loadTournamentMatchCount(tournamentId: string): Promise<{
  matchCount: number;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournament_matches")
    .select("id")
    .eq("tournament_id", tournamentId);

  if (error) {
    return {
      matchCount: -1,
      error: toUserFacingDbError("Der Spielplan konnte nicht geprüft werden.", error),
    };
  }

  return { matchCount: (data ?? []).length, error: null };
}

export async function assertParticipantMembershipMutationAllowed(tournamentId: string): Promise<{
  tournament: TournamentMetaForParticipantMutation | null;
  error: string | null;
}> {
  const loaded = await loadTournamentForParticipantMutation(tournamentId);
  if (!loaded.tournament) {
    return loaded;
  }

  const matches = await loadTournamentMatchCount(tournamentId);
  if (matches.error) {
    return { tournament: null, error: matches.error };
  }

  const gate = canMutateParticipantMembership({
    matchCount: matches.matchCount,
    tournamentStatus: loaded.tournament.status,
  });

  if (!gate.allowed) {
    return { tournament: null, error: gate.reason ?? "Aktion nicht erlaubt." };
  }

  return { tournament: loaded.tournament, error: null };
}

export type GroupMembershipRef = {
  tournamentId: string;
  applicationId?: string | null;
  externalTeamId?: string | null;
};

function normalizeMembershipRef(input: GroupMembershipRef): {
  applicationId: string | null;
  externalTeamId: string | null;
  error: string | null;
} {
  const applicationId = input.applicationId?.trim() || null;
  const externalTeamId = input.externalTeamId?.trim() || null;

  if (!applicationId && !externalTeamId) {
    return { applicationId: null, externalTeamId: null, error: "Teilnehmerreferenz fehlt." };
  }

  if (applicationId && externalTeamId) {
    return {
      applicationId: null,
      externalTeamId: null,
      error: "Ambige Teilnehmerreferenz.",
    };
  }

  return { applicationId, externalTeamId, error: null };
}

async function loadTournamentOwnedMembershipIds(input: {
  tournamentId: string;
  applicationId: string | null;
  externalTeamId: string | null;
}): Promise<{ memberIds: string[]; error: string | null }> {
  const supabase = await createClient();
  const { data: groups, error: groupsError } = await supabase
    .from("tournament_groups")
    .select("id")
    .eq("tournament_id", input.tournamentId);

  if (groupsError) {
    return {
      memberIds: [],
      error: toUserFacingDbError("Die Gruppen konnten nicht geladen werden.", groupsError),
    };
  }

  const groupIds = (groups ?? []).map((group) => String(group.id));
  if (groupIds.length === 0) {
    return { memberIds: [], error: null };
  }

  let memberQuery = supabase
    .from("tournament_group_members")
    .select("id")
    .in("group_id", groupIds);

  memberQuery = input.applicationId
    ? memberQuery.eq("application_id", input.applicationId)
    : memberQuery.eq("external_team_id", input.externalTeamId!);

  const { data: members, error: membersError } = await memberQuery;

  if (membersError) {
    return {
      memberIds: [],
      error: toUserFacingDbError("Die Gruppenzuordnung konnte nicht geladen werden.", membersError),
    };
  }

  return {
    memberIds: (members ?? []).map((row) => String(row.id)),
    error: null,
  };
}

/**
 * Deletes tournament_group_members for a tournament-owned participant.
 * Does not require the confirmed participant set (supports stale cleanup).
 *
 * Success for exit paths requires post-delete authoritative reread showing absence.
 * DELETE error===null alone is never treated as success when membership still exists.
 */
export async function deleteTournamentOwnedGroupMembership(
  input: GroupMembershipRef,
): Promise<MembershipCleanupResult> {
  const normalized = normalizeMembershipRef(input);
  if (normalized.error) {
    return { error: normalized.error, hadMembership: false, verifiedAbsent: false };
  }

  const before = await loadTournamentOwnedMembershipIds({
    tournamentId: input.tournamentId,
    applicationId: normalized.applicationId,
    externalTeamId: normalized.externalTeamId,
  });

  if (before.error) {
    return { error: before.error, hadMembership: false, verifiedAbsent: false };
  }

  if (before.memberIds.length === 0) {
    // A) no membership existed — safe for participant exit
    return { error: null, hadMembership: false, verifiedAbsent: true };
  }

  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from("tournament_group_members")
    .delete()
    .in("id", before.memberIds);

  if (deleteError) {
    return {
      error: toUserFacingDbError(
        PARTICIPANT_MEMBERSHIP_CLEANUP_FAILED_MESSAGE,
        deleteError,
      ),
      hadMembership: true,
      verifiedAbsent: false,
    };
  }

  // Authoritative post-delete reread — never trust pre-delete counts / error===null alone.
  const after = await loadTournamentOwnedMembershipIds({
    tournamentId: input.tournamentId,
    applicationId: normalized.applicationId,
    externalTeamId: normalized.externalTeamId,
  });

  if (after.error) {
    return {
      error: after.error,
      hadMembership: true,
      verifiedAbsent: false,
    };
  }

  if (after.memberIds.length > 0) {
    // B) membership still present (e.g. RLS false-success DELETE) — block exit
    return {
      error: PARTICIPANT_MEMBERSHIP_CLEANUP_FAILED_MESSAGE,
      hadMembership: true,
      verifiedAbsent: false,
    };
  }

  // C) verified absent
  return { error: null, hadMembership: true, verifiedAbsent: true };
}

export async function requireTournamentOwnedApplication(input: {
  tournamentId: string;
  applicationId: string;
}): Promise<{
  application: { id: string; status: string; clubName: string; teamName: string } | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("id, status, club_name, team_name, tournament_id")
    .eq("id", input.applicationId)
    .eq("tournament_id", input.tournamentId)
    .maybeSingle();

  if (error || !data) {
    return { application: null, error: PARTICIPANT_NOT_FOUND_MESSAGE };
  }

  return {
    application: {
      id: String(data.id),
      status: String(data.status),
      clubName: String(data.club_name ?? "Verein"),
      teamName: String(data.team_name ?? "Mannschaft"),
    },
    error: null,
  };
}

export async function requireTournamentOwnedExternalTeam(input: {
  tournamentId: string;
  externalTeamId: string;
}): Promise<{
  team: {
    id: string;
    name: string;
    externalSource: string;
    participationStatus: string;
    externalActive: boolean;
  } | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournament_external_teams")
    .select(
      "id, name, external_source, participation_status, external_active, tournament_id",
    )
    .eq("id", input.externalTeamId)
    .eq("tournament_id", input.tournamentId)
    .maybeSingle();

  if (error || !data) {
    return { team: null, error: PARTICIPANT_NOT_FOUND_MESSAGE };
  }

  return {
    team: {
      id: String(data.id),
      name: String(data.name),
      externalSource: String(data.external_source ?? "mein-turnierplan"),
      participationStatus: String(data.participation_status ?? "detected"),
      externalActive: data.external_active !== false,
    },
    error: null,
  };
}

export {
  PARTICIPANT_MEMBERSHIP_CLEANUP_FAILED_MESSAGE,
  PARTICIPANT_MEMBERSHIP_MISSING_MESSAGE,
  PARTICIPANT_NOT_FOUND_MESSAGE,
};

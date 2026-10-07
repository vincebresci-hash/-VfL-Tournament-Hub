"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  requireApplicationsManage,
  requireScheduleManage,
  requireTeamsManage,
} from "@/lib/rbac/action-access";
import {
  assertParticipantMembershipMutationAllowed,
  deleteTournamentOwnedGroupMembership,
  requireTournamentOwnedApplication,
  requireTournamentOwnedExternalTeam,
} from "@/lib/db/tournament-participant-membership";
import {
  PARTICIPANT_MEMBERSHIP_MISSING_MESSAGE,
  canProceedParticipantExitAfterMembershipCleanup,
  resolveParticipantExitTransition,
} from "@/lib/tournament-participant-membership";
import { toUserFacingDbError } from "@/lib/db/errors";
import type { ApplicationStatus } from "@/types/application";
import type { ExternalTeamParticipationStatus } from "@/lib/mein-turnierplan-participants";

function revalidateParticipantPaths(slug: string, tournamentId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/turniere");
  revalidatePath(`/admin/turniere/${tournamentId}`);
  revalidatePath(`/admin/turniere/${tournamentId}/gruppen`);
  revalidatePath(`/admin/turniere/${tournamentId}/spielplan`);
  revalidatePath(`/admin/bewerbungen`);
  revalidatePath(`/turniere/${slug}`);
  revalidatePath("/turniere");
}

/**
 * AUS GRUPPE ENTFERNEN
 * Direct tournament_group_members mutation — requires schedule.manage (same as Groups UI / RLS).
 * Supports confirmed and stale rejected/inactive members (no confirmed-set requirement).
 */
export async function removeParticipantFromGroupAction(input: {
  tournamentId: string;
  applicationId?: string | null;
  externalTeamId?: string | null;
}): Promise<{ error: string | null; notice: string | null }> {
  const access = await requireScheduleManage();
  if (access.error) {
    return { error: access.error, notice: null };
  }

  const applicationId = input.applicationId?.trim() || null;
  const externalTeamId = input.externalTeamId?.trim() || null;
  if ((!applicationId && !externalTeamId) || (applicationId && externalTeamId)) {
    return { error: "Teilnehmerreferenz fehlt oder ist ungültig.", notice: null };
  }

  const gate = await assertParticipantMembershipMutationAllowed(input.tournamentId);
  if (!gate.tournament) {
    return { error: gate.error, notice: null };
  }

  if (applicationId) {
    const owned = await requireTournamentOwnedApplication({
      tournamentId: input.tournamentId,
      applicationId,
    });
    if (!owned.application) {
      return { error: owned.error, notice: null };
    }
  } else {
    const owned = await requireTournamentOwnedExternalTeam({
      tournamentId: input.tournamentId,
      externalTeamId: externalTeamId!,
    });
    if (!owned.team) {
      return { error: owned.error, notice: null };
    }
  }

  const membership = await deleteTournamentOwnedGroupMembership({
    tournamentId: input.tournamentId,
    applicationId,
    externalTeamId,
  });

  if (membership.error) {
    return { error: membership.error, notice: null };
  }

  if (!membership.hadMembership || !membership.verifiedAbsent) {
    return { error: PARTICIPANT_MEMBERSHIP_MISSING_MESSAGE, notice: null };
  }

  revalidateParticipantPaths(gate.tournament.slug, gate.tournament.id);
  return { error: null, notice: "Gruppenzuordnung wurde entfernt." };
}

/**
 * TEILNEHMER ENTFERNEN
 * Membership cleanup FIRST (verified absent), then existing exit transition. Row preserved.
 * Ungrouped participants may exit with source permission only.
 */
export async function removeTournamentParticipantAction(input: {
  tournamentId: string;
  applicationId?: string | null;
  externalTeamId?: string | null;
}): Promise<{ error: string | null; notice: string | null }> {
  const applicationId = input.applicationId?.trim() || null;
  const externalTeamId = input.externalTeamId?.trim() || null;
  if ((!applicationId && !externalTeamId) || (applicationId && externalTeamId)) {
    return { error: "Teilnehmerreferenz fehlt oder ist ungültig.", notice: null };
  }

  if (applicationId) {
    const access = await requireApplicationsManage();
    if (access.error) {
      return { error: access.error, notice: null };
    }

    const gate = await assertParticipantMembershipMutationAllowed(input.tournamentId);
    if (!gate.tournament) {
      return { error: gate.error, notice: null };
    }

    const owned = await requireTournamentOwnedApplication({
      tournamentId: input.tournamentId,
      applicationId,
    });
    if (!owned.application) {
      return { error: owned.error, notice: null };
    }

    if (owned.application.status !== "accepted") {
      return {
        error: "Nur akzeptierte Bewerbungen können als Teilnehmer entfernt werden.",
        notice: null,
      };
    }

    const transition = resolveParticipantExitTransition("application");
    const nextStatus = transition.to as ApplicationStatus;
    const membership = await deleteTournamentOwnedGroupMembership({
      tournamentId: input.tournamentId,
      applicationId,
    });
    if (!canProceedParticipantExitAfterMembershipCleanup(membership)) {
      return {
        error: membership.error ?? PARTICIPANT_MEMBERSHIP_MISSING_MESSAGE,
        notice: null,
      };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("applications")
      .update({ status: nextStatus })
      .eq("id", applicationId)
      .eq("tournament_id", input.tournamentId);

    if (error) {
      return {
        error: toUserFacingDbError("Der Teilnehmerstatus konnte nicht geändert werden.", error),
        notice: null,
      };
    }

    revalidateParticipantPaths(gate.tournament.slug, gate.tournament.id);
    revalidatePath(`/admin/bewerbungen/${applicationId}`);
    return {
      error: null,
      notice: `${owned.application.clubName} · ${owned.application.teamName} wurde als Teilnehmer entfernt.`,
    };
  }

  const access = await requireTeamsManage();
  if (access.error) {
    return { error: access.error, notice: null };
  }

  const gate = await assertParticipantMembershipMutationAllowed(input.tournamentId);
  if (!gate.tournament) {
    return { error: gate.error, notice: null };
  }

  const owned = await requireTournamentOwnedExternalTeam({
    tournamentId: input.tournamentId,
    externalTeamId: externalTeamId!,
  });
  if (!owned.team) {
    return { error: owned.error, notice: null };
  }

  const isManual = owned.team.externalSource === "manual";
  const isConfirmedActive =
    owned.team.participationStatus === "confirmed" && owned.team.externalActive;

  if (!isConfirmedActive) {
    return {
      error: "Nur bestätigte aktive Teilnehmer können entfernt werden.",
      notice: null,
    };
  }

  const membership = await deleteTournamentOwnedGroupMembership({
    tournamentId: input.tournamentId,
    externalTeamId,
  });
  if (!canProceedParticipantExitAfterMembershipCleanup(membership)) {
    return {
      error: membership.error ?? PARTICIPANT_MEMBERSHIP_MISSING_MESSAGE,
      notice: null,
    };
  }

  const supabase = await createClient();
  if (isManual) {
    const transition = resolveParticipantExitTransition("manual");
    const { error } = await supabase
      .from("tournament_external_teams")
      .update({
        external_active: transition.to as boolean,
        updated_at: new Date().toISOString(),
      })
      .eq("id", externalTeamId!)
      .eq("tournament_id", input.tournamentId);

    if (error) {
      return {
        error: toUserFacingDbError("Der Teilnehmer konnte nicht deaktiviert werden.", error),
        notice: null,
      };
    }
  } else {
    const transition = resolveParticipantExitTransition("mein-turnierplan");
    const nextStatus = transition.to as ExternalTeamParticipationStatus;
    const { error } = await supabase
      .from("tournament_external_teams")
      .update({
        participation_status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", externalTeamId!)
      .eq("tournament_id", input.tournamentId);

    if (error) {
      return {
        error: toUserFacingDbError("Der Teilnahmestatus konnte nicht gespeichert werden.", error),
        notice: null,
      };
    }
  }

  revalidateParticipantPaths(gate.tournament.slug, gate.tournament.id);
  return {
    error: null,
    notice: `${owned.team.name} wurde als Teilnehmer entfernt.`,
  };
}

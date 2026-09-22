import { publicTeamLabel } from "@/lib/schedule/names";
import { standingsParticipantId } from "@/lib/schedule/standings";
import { resolveTournamentStageStatus } from "@/lib/schedule/status";
import type { TournamentParticipant } from "@/lib/tournament-participants";
import type { AdminTournamentRecord } from "@/types/admin";
import type { AdminApplication } from "@/types/application";
import type { TournamentMatchRecord } from "@/types/schedule";

export function acceptedParticipants(
  applications: AdminApplication[],
  tournament: Pick<AdminTournamentRecord, "id" | "slug">,
) {
  return applications.filter(
    (application) =>
      (application.tournamentId === tournament.slug ||
        application.tournamentId === tournament.id) &&
      application.applicationStatus === "accepted",
  );
}

export function teamLabelsFromApplications(applications: AdminApplication[]) {
  return Object.fromEntries(
    applications.map((application) => [
      application.id,
      publicTeamLabel(application.clubName, application.teamName),
    ]),
  );
}

/**
 * Stable schedule/DB participant key: application UUID or external-team UUID.
 * Never the composite "application:…" / "external:…" list id.
 */
export function scheduleParticipantId(
  participant: Pick<TournamentParticipant, "applicationId" | "externalTeamId">,
) {
  return participant.applicationId ?? participant.externalTeamId ?? null;
}

export function teamLabelsFromParticipants(participants: TournamentParticipant[]) {
  return Object.fromEntries(
    participants.flatMap((participant) => {
      const id = scheduleParticipantId(participant);
      if (!id) {
        return [];
      }

      return [[id, participant.displayName || publicTeamLabel(participant.clubName, participant.teamName)]];
    }),
  );
}

export function matchSideParticipantId(
  match: Pick<
    TournamentMatchRecord,
    "homeApplicationId" | "awayApplicationId" | "homeExternalTeamId" | "awayExternalTeamId"
  >,
  side: "home" | "away",
) {
  if (side === "home") {
    return standingsParticipantId(match.homeApplicationId, match.homeExternalTeamId);
  }

  return standingsParticipantId(match.awayApplicationId, match.awayExternalTeamId);
}

export type ScheduleParticipantRef = {
  applicationId: string | null;
  externalTeamId: string | null;
};

export function emptyScheduleParticipantRef(): ScheduleParticipantRef {
  return { applicationId: null, externalTeamId: null };
}

export function resolveScheduleParticipantRef(
  participantId: string,
  participants: Array<Pick<TournamentParticipant, "applicationId" | "externalTeamId">>,
): ScheduleParticipantRef | null {
  const trimmed = participantId.trim();
  if (!trimmed) {
    return null;
  }

  const asApplication = participants.find((participant) => participant.applicationId === trimmed);
  if (asApplication) {
    return { applicationId: trimmed, externalTeamId: null };
  }

  const asExternal = participants.find((participant) => participant.externalTeamId === trimmed);
  if (asExternal) {
    return { applicationId: null, externalTeamId: trimmed };
  }

  return null;
}

/** Persist a typed match side into tournament_matches identity columns. */
export function matchSideDbColumns(
  side: "home" | "away",
  ref: ScheduleParticipantRef,
) {
  if (side === "home") {
    return {
      home_application_id: ref.applicationId,
      home_external_team_id: ref.externalTeamId,
    };
  }

  return {
    away_application_id: ref.applicationId,
    away_external_team_id: ref.externalTeamId,
  };
}

export function stageStatusFor(
  tournament: Pick<AdminTournamentRecord, "status">,
  groupsCount: number,
  matches: TournamentMatchRecord[],
) {
  return resolveTournamentStageStatus({
    tournamentStatus: tournament.status,
    groupCount: groupsCount,
    matchCount: matches.length,
    liveOrCompletedMatchCount: matches.filter(
      (match) => match.status === "live" || match.status === "completed",
    ).length,
  });
}

import type { ApplicationStatus } from "@/types/application";
import {
  getAvailableSlots,
  isTournamentFull,
  countApplicationsByStatus,
  type TournamentCapacityCounts,
} from "@/lib/tournament-capacity";

export type ExternalTeamParticipationStatus = "detected" | "rejected" | "confirmed";

export type ExternalTeamForParticipantCount = {
  participationStatus: ExternalTeamParticipationStatus | string;
  externalActive?: boolean | null;
  applicationId?: string | null;
};

export function isConfirmedCountableExternalTeam(
  team: ExternalTeamForParticipantCount,
  acceptedApplicationIds: Set<string>,
) {
  if (team.participationStatus !== "confirmed") {
    return false;
  }

  if (team.externalActive === false) {
    return false;
  }

  if (team.applicationId && acceptedApplicationIds.has(team.applicationId)) {
    return false;
  }

  return true;
}

export function countConfirmedParticipants(input: {
  acceptedApplicationIds: string[];
  externalTeams: ExternalTeamForParticipantCount[];
}) {
  const accepted = new Set(input.acceptedApplicationIds);
  let externalConfirmed = 0;

  for (const team of input.externalTeams) {
    if (isConfirmedCountableExternalTeam(team, accepted)) {
      externalConfirmed += 1;
    }
  }

  return accepted.size + externalConfirmed;
}

/**
 * Projected confirmed count after accepting one application.
 * If a confirmed external team is already mapped to that application_id,
 * accepting replaces the external slot (no double count / no false block).
 */
export function countConfirmedParticipantsAfterAcceptingApplication(input: {
  acceptedApplicationIds: string[];
  externalTeams: ExternalTeamForParticipantCount[];
  applicationIdToAccept: string;
}) {
  const applicationId = input.applicationIdToAccept.trim();
  if (!applicationId) {
    return countConfirmedParticipants(input);
  }

  const alreadyAccepted = input.acceptedApplicationIds.includes(applicationId);
  const acceptedApplicationIds = alreadyAccepted
    ? input.acceptedApplicationIds
    : [...input.acceptedApplicationIds, applicationId];

  return countConfirmedParticipants({
    acceptedApplicationIds,
    externalTeams: input.externalTeams,
  });
}

export function canAcceptApplicationIntoCapacity(input: {
  maxTeams: number | null | undefined;
  acceptedApplicationIds: string[];
  externalTeams: ExternalTeamForParticipantCount[];
  applicationIdToAccept: string;
}): { ok: true; projected: number } | { ok: false; projected: number; error: string } {
  const projected = countConfirmedParticipantsAfterAcceptingApplication({
    acceptedApplicationIds: input.acceptedApplicationIds,
    externalTeams: input.externalTeams,
    applicationIdToAccept: input.applicationIdToAccept,
  });

  if (input.maxTeams == null || input.maxTeams < 0) {
    return { ok: true, projected };
  }

  if (projected > input.maxTeams) {
    return {
      ok: false,
      projected,
      error: "Das Teilnehmerfeld ist bereits vollständig belegt.",
    };
  }

  return { ok: true, projected };
}

/** Guest SQL gate capacity branch: open while confirmed < max; else waitlist rules. */
export function guestCapacityAllowsApplication(input: {
  maxTeams: number | null | undefined;
  confirmedParticipants: number;
  tournamentWaitlistEnabled: boolean;
  globalWaitlistEnabled: boolean;
}) {
  if (input.maxTeams == null || input.maxTeams < 0) {
    return { allowed: true as const, reason: "unlimited" as const };
  }

  if (input.confirmedParticipants < input.maxTeams) {
    return { allowed: true as const, reason: "has-slots" as const };
  }

  if (input.tournamentWaitlistEnabled && input.globalWaitlistEnabled) {
    return { allowed: true as const, reason: "waitlist" as const };
  }

  return { allowed: false as const, reason: "full" as const };
}

export function countDetectedExternalTeams(externalTeams: ExternalTeamForParticipantCount[]) {
  return externalTeams.filter(
    (team) =>
      team.participationStatus === "detected" && team.externalActive !== false,
  ).length;
}

export function getTournamentCapacityWithExternal(input: {
  maxTeams: number | null | undefined;
  applicationStatuses: Array<ApplicationStatus | string>;
  acceptedApplicationIds: string[];
  externalTeams: ExternalTeamForParticipantCount[];
}): TournamentCapacityCounts {
  const applicationCounts = countApplicationsByStatus(input.applicationStatuses);
  const confirmedTeams = countConfirmedParticipants({
    acceptedApplicationIds: input.acceptedApplicationIds,
    externalTeams: input.externalTeams,
  });
  const availableSlots = getAvailableSlots(input.maxTeams, confirmedTeams);

  return {
    confirmedTeams,
    waitingListCount: applicationCounts.waitingListCount,
    underReviewCount: applicationCounts.underReviewCount,
    newCount: applicationCounts.newCount,
    availableSlots: Number.isFinite(availableSlots) ? availableSlots : 0,
    isFull: isTournamentFull(input.maxTeams, confirmedTeams),
  };
}

export function canConfirmExternalTeams(input: {
  maxTeams: number | null | undefined;
  currentConfirmedCount: number;
  teamsToConfirm: ExternalTeamForParticipantCount[];
  acceptedApplicationIds: string[];
}) {
  const accepted = new Set(input.acceptedApplicationIds);
  const additional = input.teamsToConfirm.filter((team) => {
    if (team.participationStatus === "confirmed") {
      return false;
    }
    if (team.externalActive === false) {
      return false;
    }
    if (team.applicationId && accepted.has(team.applicationId)) {
      return false;
    }
    return true;
  }).length;

  if (input.maxTeams == null || input.maxTeams < 0) {
    return { ok: true as const, additional, projected: input.currentConfirmedCount + additional };
  }

  const projected = input.currentConfirmedCount + additional;
  if (projected > input.maxTeams) {
    return {
      ok: false as const,
      additional,
      projected,
      available: Math.max(0, input.maxTeams - input.currentConfirmedCount),
      error: `Kapazität überschritten: ${additional} Teams würden bestätigt, aber nur noch ${Math.max(0, input.maxTeams - input.currentConfirmedCount)} Plätze frei sind (max. ${input.maxTeams}).`,
    };
  }

  return { ok: true as const, additional, projected };
}

import type { ApplicationStatus } from "@/types/application";

export type TournamentCapacityCounts = {
  confirmedTeams: number;
  waitingListCount: number;
  underReviewCount: number;
  newCount: number;
  availableSlots: number;
  isFull: boolean;
};

export type TournamentOccupancy = TournamentCapacityCounts & {
  slug: string;
  maxTeams: number | null;
};

export function getAvailableSlots(
  maxTeams: number | null | undefined,
  confirmedTeams: number,
) {
  if (maxTeams == null || maxTeams < 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, maxTeams - confirmedTeams);
}

export function isTournamentFull(
  maxTeams: number | null | undefined,
  confirmedTeams: number,
) {
  if (maxTeams == null || maxTeams < 0) {
    return false;
  }

  return confirmedTeams >= maxTeams;
}

export function countApplicationsByStatus(
  statuses: Array<ApplicationStatus | string>,
) {
  return {
    confirmedTeams: statuses.filter((status) => status === "accepted").length,
    waitingListCount: statuses.filter((status) => status === "waiting-list").length,
    underReviewCount: statuses.filter((status) => status === "under-review").length,
    newCount: statuses.filter((status) => status === "new").length,
  };
}

export function getTournamentCapacity(
  maxTeams: number | null | undefined,
  statuses: Array<ApplicationStatus | string>,
): TournamentCapacityCounts {
  const counts = countApplicationsByStatus(statuses);
  const availableSlots = getAvailableSlots(maxTeams, counts.confirmedTeams);

  return {
    ...counts,
    availableSlots: Number.isFinite(availableSlots) ? availableSlots : 0,
    isFull: isTournamentFull(maxTeams, counts.confirmedTeams),
  };
}

export function sumFiniteAvailableSlots(
  tournaments: Array<{ maxTeams: number | null | undefined; confirmedTeams: number }>,
) {
  return tournaments.reduce((total, tournament) => {
    const slots = getAvailableSlots(tournament.maxTeams, tournament.confirmedTeams);
    if (!Number.isFinite(slots)) {
      return total;
    }

    return total + slots;
  }, 0);
}

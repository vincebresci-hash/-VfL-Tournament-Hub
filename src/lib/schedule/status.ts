import type { TournamentStageStatus } from "@/types/schedule";

export function resolveTournamentStageStatus(input: {
  tournamentStatus: string;
  groupCount: number;
  matchCount: number;
  liveOrCompletedMatchCount: number;
}): TournamentStageStatus {
  if (input.tournamentStatus === "completed") {
    return "completed";
  }

  if (input.liveOrCompletedMatchCount > 0) {
    return "live";
  }

  if (input.matchCount > 0) {
    return "schedule-created";
  }

  if (input.groupCount > 0) {
    return "groups-created";
  }

  return "preparation";
}

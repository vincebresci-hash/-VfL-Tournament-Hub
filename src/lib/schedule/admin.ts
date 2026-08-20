import { publicTeamLabel } from "@/lib/schedule/names";
import { resolveTournamentStageStatus } from "@/lib/schedule/status";
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

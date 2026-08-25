export type TournamentParticipantSource = "application" | "mein-turnierplan" | "manual";

export type TournamentParticipant = {
  id: string;
  displayName: string;
  clubName: string;
  teamName: string;
  source: TournamentParticipantSource;
  applicationId: string | null;
  externalTeamId: string | null;
  groupId: string | null;
  groupName: string | null;
  ageGroup: string | null;
  birthYear: number | null;
  confirmed: true;
};

export type ApplicationParticipantInput = {
  id: string;
  clubName: string;
  teamName: string;
  ageGroup: string | null;
  birthYear: number | null;
  groupId?: string | null;
  groupName?: string | null;
};

export type ExternalParticipantInput = {
  id: string;
  externalSource: string;
  name: string;
  clubName: string | null;
  teamName: string | null;
  applicationId: string | null;
  participationStatus: string;
  externalActive: boolean;
  ageGroup: string | null;
  birthYear: number | null;
  groupId?: string | null;
  groupName?: string | null;
};

function participantDisplayName(clubName: string, teamName: string) {
  const club = clubName.trim();
  const team = teamName.trim();
  if (club && team && club.toLowerCase() !== team.toLowerCase()) {
    return `${club} · ${team}`;
  }
  return club || team || "Team";
}

export function mergeTournamentParticipants(input: {
  applications: ApplicationParticipantInput[];
  externalTeams: ExternalParticipantInput[];
}): TournamentParticipant[] {
  const acceptedApplicationIds = new Set(input.applications.map((application) => application.id));
  const participants: TournamentParticipant[] = input.applications.map((application) => ({
    id: `application:${application.id}`,
    displayName: participantDisplayName(application.clubName, application.teamName),
    clubName: application.clubName,
    teamName: application.teamName,
    source: "application",
    applicationId: application.id,
    externalTeamId: null,
    groupId: application.groupId ?? null,
    groupName: application.groupName ?? null,
    ageGroup: application.ageGroup,
    birthYear: application.birthYear,
    confirmed: true,
  }));

  for (const team of input.externalTeams) {
    if (team.participationStatus !== "confirmed" || !team.externalActive) {
      continue;
    }

    if (team.applicationId && acceptedApplicationIds.has(team.applicationId)) {
      continue;
    }

    const clubName = team.clubName?.trim() || team.name.trim();
    const teamName = team.teamName?.trim() || team.name.trim();
    const source: TournamentParticipantSource =
      team.externalSource === "manual" ? "manual" : "mein-turnierplan";

    participants.push({
      id: `external:${team.id}`,
      displayName: participantDisplayName(clubName, teamName),
      clubName,
      teamName,
      source,
      applicationId: team.applicationId,
      externalTeamId: team.id,
      groupId: team.groupId ?? null,
      groupName: team.groupName ?? null,
      ageGroup: team.ageGroup,
      birthYear: team.birthYear,
      confirmed: true,
    });
  }

  return participants.sort((left, right) =>
    left.displayName.localeCompare(right.displayName, "de"),
  );
}

export function tournamentParticipantsToPublicRoster(
  participants: TournamentParticipant[],
): Array<{
  applicationId: string;
  clubName: string;
  teamName: string;
  ageGroup: string | null;
  birthYear: number | null;
  groupId: string | null;
  groupName: string | null;
  groupSortOrder: number | null;
  source: "application" | "mein-turnierplan" | "manual";
  externalTeamId: string | null;
}> {
  return participants.map((participant) => ({
    applicationId: participant.applicationId ?? participant.externalTeamId ?? participant.id,
    clubName: participant.clubName,
    teamName: participant.teamName,
    ageGroup: participant.ageGroup,
    birthYear: participant.birthYear,
    groupId: participant.groupId,
    groupName: participant.groupName,
    groupSortOrder: null,
    source: participant.source,
    externalTeamId: participant.externalTeamId,
  }));
}

export function participantSourceLabel(source: TournamentParticipantSource) {
  switch (source) {
    case "application":
      return "Bewerbung";
    case "mein-turnierplan":
      return "MeinTurnierplan";
    case "manual":
      return "Manuell";
  }
}

export function participantSourceBadge(source: TournamentParticipantSource) {
  switch (source) {
    case "application":
      return "BEWERBUNG";
    case "mein-turnierplan":
      return "MEINTURNIERPLAN";
    case "manual":
      return "MANUELL";
  }
}

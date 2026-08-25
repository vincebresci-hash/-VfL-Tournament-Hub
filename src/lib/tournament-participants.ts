export type TournamentParticipantSource = "application" | "mein-turnierplan" | "manual";

export type TournamentParticipant = {
  id: string;
  displayName: string;
  clubName: string;
  teamName: string;
  source: TournamentParticipantSource;
  applicationId: string | null;
  externalTeamId: string | null;
  clubId: string | null;
  groupId: string | null;
  groupName: string | null;
  ageGroup: string | null;
  birthYear: number | null;
  /** Resolved display logo (Hub preferred). */
  logoUrl: string | null;
  /** Stored custom/imported logo before Hub preference (for edit forms). */
  customLogoUrl: string | null;
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
  clubId?: string | null;
  /** Hub club logo for the application's club_id */
  clubLogoUrl?: string | null;
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
  clubId?: string | null;
  /** Stored logo on the external/manual team row (MTP or custom) */
  logoUrl?: string | null;
  /** Hub club logo when club_id is set — preferred over stored logoUrl */
  hubClubLogoUrl?: string | null;
};

function participantDisplayName(clubName: string, teamName: string) {
  const club = clubName.trim();
  const team = teamName.trim();
  if (club && team && club.toLowerCase() !== team.toLowerCase()) {
    return `${club} · ${team}`;
  }
  return club || team || "Team";
}

/** Prefer Hub club logo over stored/imported logo. */
export function resolveParticipantLogoUrl(input: {
  hubClubLogoUrl?: string | null;
  storedLogoUrl?: string | null;
}): string | null {
  const hub = input.hubClubLogoUrl?.trim() || null;
  if (hub) {
    return hub;
  }

  const stored = input.storedLogoUrl?.trim() || null;
  return stored;
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
    clubId: application.clubId ?? null,
    groupId: application.groupId ?? null,
    groupName: application.groupName ?? null,
    ageGroup: application.ageGroup,
    birthYear: application.birthYear,
    logoUrl: resolveParticipantLogoUrl({
      hubClubLogoUrl: application.clubLogoUrl,
      storedLogoUrl: null,
    }),
    customLogoUrl: null,
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
    const storedLogo = team.logoUrl?.trim() || null;

    participants.push({
      id: `external:${team.id}`,
      displayName: participantDisplayName(clubName, teamName),
      clubName,
      teamName,
      source,
      applicationId: team.applicationId,
      externalTeamId: team.id,
      clubId: team.clubId ?? null,
      groupId: team.groupId ?? null,
      groupName: team.groupName ?? null,
      ageGroup: team.ageGroup,
      birthYear: team.birthYear,
      logoUrl: resolveParticipantLogoUrl({
        hubClubLogoUrl: team.hubClubLogoUrl,
        storedLogoUrl: storedLogo,
      }),
      customLogoUrl: storedLogo,
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
  logoUrl: string | null;
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
    logoUrl: participant.logoUrl,
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

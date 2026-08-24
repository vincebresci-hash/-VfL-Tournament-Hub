import { publicTeamLabel } from "@/lib/schedule/names";

export type HubAcceptedTeam = {
  applicationId: string;
  clubName: string;
  teamName: string;
};

export type MeinTurnierplanMappingSuggestion = {
  mtpTeamName: string;
  suggestedApplicationId: string | null;
  suggestedHubLabel: string | null;
};

export type MeinTurnierplanImportGroup = {
  name: string;
  assignments: Array<{
    mtpTeamName: string;
    applicationId: string | null;
  }>;
};

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function hubTeamLabel(team: HubAcceptedTeam) {
  return publicTeamLabel(team.clubName, team.teamName);
}

export function suggestMeinTurnierplanMappings(
  mtpTeams: string[],
  acceptedTeams: HubAcceptedTeam[],
): MeinTurnierplanMappingSuggestion[] {
  const hubByLabel = new Map<string, HubAcceptedTeam>();
  for (const team of acceptedTeams) {
    hubByLabel.set(normalizeLabel(hubTeamLabel(team)), team);
  }

  return mtpTeams.map((mtpTeamName) => {
    const match = hubByLabel.get(normalizeLabel(mtpTeamName)) ?? null;
    return {
      mtpTeamName,
      suggestedApplicationId: match?.applicationId ?? null,
      suggestedHubLabel: match ? hubTeamLabel(match) : null,
    };
  });
}

export function buildImportGroupsFromPreview(
  previewGroups: Array<{ name: string; teams: Array<string | { name: string }> }>,
  acceptedTeams: HubAcceptedTeam[],
): MeinTurnierplanImportGroup[] {
  return previewGroups.map((group) => {
    const teamNames = group.teams.map((team) =>
      typeof team === "string" ? team : team.name,
    );

    return {
      name: group.name,
      assignments: suggestMeinTurnierplanMappings(teamNames, acceptedTeams).map(
        (item) => ({
          mtpTeamName: item.mtpTeamName,
          applicationId: item.suggestedApplicationId,
        }),
      ),
    };
  });
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runMeinTurnierplanImportSelfChecks() {
  const accepted = [
    {
      applicationId: "a1",
      clubName: "SSV Ulm 1846",
      teamName: "U10",
    },
  ];

  const exact = suggestMeinTurnierplanMappings(["SSV Ulm 1846 · U10"], accepted)[0];
  assert(
    exact.suggestedApplicationId === "a1",
    "exakte Übereinstimmung muss vorgeschlagen werden",
  );

  const fuzzy = suggestMeinTurnierplanMappings(["SSV Ulm U10"], accepted)[0];
  assert(
    fuzzy.suggestedApplicationId === null,
    "ähnliche Namen dürfen nicht automatisch gematcht werden",
  );

  return "ok";
}

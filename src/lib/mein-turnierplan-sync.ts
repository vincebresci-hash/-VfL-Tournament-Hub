import type { NormalizedMeinTurnierplanSyncPayload } from "@/lib/mein-turnierplan-sync-normalize";

export type SyncTeamMapping = {
  externalId: string;
  externalName: string;
  applicationId: string | null;
  createExternal: boolean;
};

export type SyncOverridePolicy = "keep-manual" | "overwrite-manual";

export type SyncDiffCounts = {
  teamsFound: number;
  teamsNew: number;
  teamsUnchanged: number;
  teamsUnmapped: number;
  groupsFound: number;
  groupsNew: number;
  groupsUpdated: number;
  groupsLinked: number;
  matchesFound: number;
  matchesNew: number;
  matchesUpdated: number;
  resultsPresent: number;
  resultsOpen: number;
  courtsFound: number;
  courtsNew: number;
  courtsLinked: number;
  manualOverridesProtected: number;
};

export type MeinTurnierplanSyncPreview = {
  queryId: string;
  tournamentName: string | null;
  schemaVersion: string | null;
  counts: SyncDiffCounts;
  mappings: SyncTeamMapping[];
  overridePolicy: SyncOverridePolicy;
  payload: NormalizedMeinTurnierplanSyncPayload;
};

export type HubSyncSnapshot = {
  externalTeams: Array<{
    id: string;
    externalId: string;
    name: string;
    applicationId: string | null;
    manualOverride: boolean;
  }>;
  groups: Array<{
    id: string;
    name: string;
    externalId: string | null;
    manualOverride: boolean;
  }>;
  fields: Array<{
    id: string;
    name: string;
    externalId: string | null;
    manualOverride: boolean;
  }>;
  matches: Array<{
    id: string;
    externalId: string | null;
    manualOverride: boolean;
    homeScore: number | null;
    awayScore: number | null;
    status: string;
  }>;
  acceptedApplications: Array<{
    applicationId: string;
    clubName: string;
    teamName: string;
  }>;
};

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function hubTeamLabel(clubName: string, teamName: string) {
  return `${clubName} · ${teamName}`.trim();
}

function resolveExistingByExternalOrName<T extends { name: string; externalId: string | null }>(
  item: { id: string; name: string },
  rows: T[],
): { existing: T; via: "external" | "name" } | null {
  const byExternal = rows.find((row) => row.externalId === item.id);
  if (byExternal) {
    return { existing: byExternal, via: "external" };
  }

  const byName = rows.find(
    (row) =>
      normalizeLabel(row.name) === normalizeLabel(item.name) &&
      (row.externalId == null || row.externalId === item.id),
  );
  if (byName) {
    return { existing: byName, via: "name" };
  }

  return null;
}

export function buildDefaultSyncMappings(
  payload: NormalizedMeinTurnierplanSyncPayload,
  snapshot: HubSyncSnapshot,
): SyncTeamMapping[] {
  const byExternalId = new Map(
    snapshot.externalTeams.map((team) => [team.externalId, team]),
  );
  const byExactLabel = new Map<string, string>();
  for (const application of snapshot.acceptedApplications) {
    byExactLabel.set(
      normalizeLabel(hubTeamLabel(application.clubName, application.teamName)),
      application.applicationId,
    );
    byExactLabel.set(normalizeLabel(application.teamName), application.applicationId);
    byExactLabel.set(normalizeLabel(application.clubName), application.applicationId);
  }

  const usedApplicationIds = new Set<string>();

  return payload.teams.map((team) => {
    const existing = byExternalId.get(team.id);
    if (existing?.applicationId && !usedApplicationIds.has(existing.applicationId)) {
      usedApplicationIds.add(existing.applicationId);
      return {
        externalId: team.id,
        externalName: team.name,
        applicationId: existing.applicationId,
        createExternal: true,
      };
    }

    const exact = byExactLabel.get(normalizeLabel(team.name)) ?? null;
    if (exact && !usedApplicationIds.has(exact)) {
      usedApplicationIds.add(exact);
      return {
        externalId: team.id,
        externalName: team.name,
        applicationId: exact,
        createExternal: true,
      };
    }

    return {
      externalId: team.id,
      externalName: team.name,
      applicationId: null,
      createExternal: true,
    };
  });
}

export function buildMeinTurnierplanSyncPreview(input: {
  queryId: string;
  payload: NormalizedMeinTurnierplanSyncPayload;
  snapshot: HubSyncSnapshot;
  mappings?: SyncTeamMapping[];
  overridePolicy?: SyncOverridePolicy;
}): MeinTurnierplanSyncPreview {
  const mappings =
    input.mappings ?? buildDefaultSyncMappings(input.payload, input.snapshot);
  const overridePolicy = input.overridePolicy ?? "keep-manual";

  const existingTeams = new Map(
    input.snapshot.externalTeams.map((team) => [team.externalId, team]),
  );
  const existingMatches = new Map(
    input.snapshot.matches
      .filter((match) => match.externalId)
      .map((match) => [match.externalId as string, match]),
  );

  let teamsNew = 0;
  let teamsUnchanged = 0;
  for (const team of input.payload.teams) {
    if (existingTeams.has(team.id)) {
      teamsUnchanged += 1;
    } else {
      teamsNew += 1;
    }
  }

  let groupsNew = 0;
  let groupsUpdated = 0;
  let groupsLinked = 0;
  for (const group of input.payload.groups) {
    const resolved = resolveExistingByExternalOrName(group, input.snapshot.groups);
    if (!resolved) {
      groupsNew += 1;
      continue;
    }

    if (resolved.via === "name" && resolved.existing.externalId == null) {
      groupsLinked += 1;
      continue;
    }

    if (resolved.existing.name !== group.name) {
      groupsUpdated += 1;
    }
  }

  let courtsNew = 0;
  let courtsLinked = 0;
  for (const court of input.payload.courts) {
    const resolved = resolveExistingByExternalOrName(court, input.snapshot.fields);
    if (!resolved) {
      courtsNew += 1;
      continue;
    }

    if (resolved.via === "name" && resolved.existing.externalId == null) {
      courtsLinked += 1;
    }
  }

  let matchesNew = 0;
  let matchesUpdated = 0;
  let manualOverridesProtected = 0;
  for (const match of input.payload.matches) {
    const existing = existingMatches.get(match.externalId);
    if (!existing) {
      matchesNew += 1;
      continue;
    }

    if (existing.manualOverride && overridePolicy === "keep-manual") {
      manualOverridesProtected += 1;
      continue;
    }

    const scoreChanged =
      existing.homeScore !== match.homeScore ||
      existing.awayScore !== match.awayScore ||
      existing.status !== match.status;
    if (scoreChanged) {
      matchesUpdated += 1;
    }
  }

  return {
    queryId: input.queryId,
    tournamentName: input.payload.tournamentName,
    schemaVersion: input.payload.schemaVersion,
    mappings,
    overridePolicy,
    payload: input.payload,
    counts: {
      teamsFound: input.payload.teams.length,
      teamsNew,
      teamsUnchanged,
      teamsUnmapped: mappings.filter((mapping) => !mapping.applicationId).length,
      groupsFound: input.payload.groups.length,
      groupsNew,
      groupsUpdated,
      groupsLinked,
      matchesFound: input.payload.matches.length,
      matchesNew,
      matchesUpdated,
      resultsPresent: input.payload.completedMatchCount,
      resultsOpen: input.payload.matches.length - input.payload.completedMatchCount,
      courtsFound: input.payload.courts.length,
      courtsNew,
      courtsLinked,
      manualOverridesProtected,
    },
  };
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runMeinTurnierplanSyncSelfChecks() {
  const payload: NormalizedMeinTurnierplanSyncPayload = {
    tournamentName: "D2-Sommercup 2026",
    schemaVersion: "3.77.0",
    groups: [
      {
        id: "A",
        name: "Gruppe A",
        teams: [
          { id: "1", name: "Team Alpha" },
          { id: "2", name: "Team Beta" },
        ],
      },
    ],
    teams: [
      { id: "1", name: "Team Alpha" },
      { id: "2", name: "Team Beta" },
    ],
    courts: [{ id: "1", name: "Feld 1", sortOrder: 0 }],
    matches: [
      {
        externalId: "1",
        displayId: "1",
        phase: "group",
        round: null,
        groupExternalId: "A",
        courtIndex: 0,
        scheduledAt: "2026-07-04T08:00:00.000Z",
        homeParticipantExternalId: "1",
        awayParticipantExternalId: "2",
        homeScore: 1,
        awayScore: 0,
        status: "completed",
        decidedBy: "regular",
        sortOrder: 0,
      },
    ],
    completedMatchCount: 1,
  };

  const emptySnapshot: HubSyncSnapshot = {
    externalTeams: [],
    groups: [],
    fields: [],
    matches: [],
    acceptedApplications: [
      { applicationId: "app-1", clubName: "Team Alpha", teamName: "Team Alpha" },
    ],
  };

  const first = buildMeinTurnierplanSyncPreview({
    queryId: "2jrb0hvxvd",
    payload,
    snapshot: emptySnapshot,
  });
  assert(first.counts.teamsFound === 2, "zwei Teams erwartet");
  assert(first.counts.matchesNew === 1, "ein neues Spiel erwartet");
  assert(first.counts.resultsPresent === 1, "ein Ergebnis erwartet");
  assert(
    first.mappings.some((mapping) => mapping.applicationId === "app-1"),
    "exakter Teamname muss gemappt werden",
  );

  const second = buildMeinTurnierplanSyncPreview({
    queryId: "2jrb0hvxvd",
    payload,
    snapshot: {
      ...emptySnapshot,
      externalTeams: [
        {
          id: "ext-1",
          externalId: "1",
          name: "Team Alpha",
          applicationId: "app-1",
          manualOverride: false,
        },
        {
          id: "ext-2",
          externalId: "2",
          name: "Team Beta",
          applicationId: null,
          manualOverride: false,
        },
      ],
      matches: [
        {
          id: "m1",
          externalId: "1",
          manualOverride: false,
          homeScore: 1,
          awayScore: 0,
          status: "completed",
        },
      ],
    },
  });
  assert(second.counts.matchesNew === 0, "zweite Sync darf keine Duplikate erzeugen");
  assert(second.counts.teamsUnchanged === 2, "bestehende Teams unverändert");

  const protectedPreview = buildMeinTurnierplanSyncPreview({
    queryId: "2jrb0hvxvd",
    payload: {
      ...payload,
      matches: [
        {
          ...payload.matches[0]!,
          homeScore: 5,
          awayScore: 5,
        },
      ],
    },
    snapshot: {
      ...emptySnapshot,
      matches: [
        {
          id: "m1",
          externalId: "1",
          manualOverride: true,
          homeScore: 1,
          awayScore: 0,
          status: "completed",
        },
      ],
    },
    overridePolicy: "keep-manual",
  });
  assert(
    protectedPreview.counts.manualOverridesProtected === 1,
    "manuelle Overrides müssen geschützt bleiben",
  );

  const overwrite = buildMeinTurnierplanSyncPreview({
    queryId: "2jrb0hvxvd",
    payload: {
      ...payload,
      matches: [{ ...payload.matches[0]!, homeScore: 9, awayScore: 9 }],
    },
    snapshot: {
      ...emptySnapshot,
      matches: [
        {
          id: "m1",
          externalId: "1",
          manualOverride: true,
          homeScore: 1,
          awayScore: 0,
          status: "completed",
        },
      ],
    },
    overridePolicy: "overwrite-manual",
  });
  assert(overwrite.counts.matchesUpdated === 1, "overwrite darf manuelle Spiele aktualisieren");
  assert(overwrite.counts.manualOverridesProtected === 0, "overwrite schützt nicht");

  const manualGroupsSnapshot: HubSyncSnapshot = {
    ...emptySnapshot,
    groups: [
      {
        id: "hub-group-a",
        name: "Gruppe A",
        externalId: null,
        manualOverride: false,
      },
      {
        id: "hub-group-b",
        name: "Gruppe B",
        externalId: null,
        manualOverride: false,
      },
    ],
    fields: [
      {
        id: "hub-field-1",
        name: "Feld 1",
        externalId: null,
        manualOverride: false,
      },
    ],
  };

  const withManualGroups = buildMeinTurnierplanSyncPreview({
    queryId: "2jrb0hvxvd",
    payload: {
      ...payload,
      groups: [
        payload.groups[0]!,
        {
          id: "B",
          name: "Gruppe B",
          teams: [
            { id: "3", name: "Team Gamma" },
            { id: "4", name: "Team Delta" },
          ],
        },
      ],
    },
    snapshot: manualGroupsSnapshot,
  });
  assert(
    withManualGroups.counts.groupsNew === 0,
    "bestehende manuelle Gruppen dürfen nicht als neu zählen",
  );
  assert(
    withManualGroups.counts.groupsLinked === 2,
    "Gruppe A und B müssen als Verknüpfung erkannt werden",
  );
  assert(
    withManualGroups.counts.courtsNew === 0,
    "bestehendes Feld mit gleichem Namen darf nicht als neu zählen",
  );
  assert(
    withManualGroups.counts.courtsLinked === 1,
    "Feld 1 muss als Verknüpfung erkannt werden",
  );

  const afterLink = buildMeinTurnierplanSyncPreview({
    queryId: "2jrb0hvxvd",
    payload,
    snapshot: {
      ...emptySnapshot,
      groups: [
        {
          id: "hub-group-a",
          name: "Gruppe A",
          externalId: "A",
          manualOverride: false,
        },
      ],
      fields: [
        {
          id: "hub-field-1",
          name: "Feld 1",
          externalId: "1",
          manualOverride: false,
        },
      ],
    },
  });
  assert(afterLink.counts.groupsNew === 0, "zweite Sync: keine neuen Gruppen");
  assert(afterLink.counts.groupsLinked === 0, "bereits verknüpfte Gruppen nicht erneut als Link");
  assert(afterLink.counts.courtsNew === 0, "zweite Sync: keine neuen Felder");

  return "ok";
}

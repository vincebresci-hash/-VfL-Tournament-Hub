import { groupDisplayName } from "@/lib/schedule/names";

export type NormalizedMeinTurnierplanTeam = {
  id: string;
  name: string;
};

export type NormalizedMeinTurnierplanGroup = {
  id: string;
  name: string;
  teams: NormalizedMeinTurnierplanTeam[];
};

export type MeinTurnierplanRawMeta = {
  schemaVersion: string | null;
  participantCount: number;
  groupCount: number;
  teamCount: number;
};

export type NormalizedMeinTurnierplanResponse = {
  tournamentName: string | null;
  groups: NormalizedMeinTurnierplanGroup[];
  meta: MeinTurnierplanRawMeta;
};

export type MeinTurnierplanNormalizeError =
  | "unknown-schema"
  | "no-participants"
  | "no-groups"
  | "no-teams";

export type MeinTurnierplanNormalizeResult =
  | { ok: true; normalized: NormalizedMeinTurnierplanResponse }
  | { ok: false; error: MeinTurnierplanNormalizeError; message: string; meta: MeinTurnierplanRawMeta };

type ParticipantRecord = {
  id: string;
  name: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function participantName(record: Record<string, unknown>, fallbackId: string) {
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name) {
    return name;
  }

  const displayId = typeof record.displayId === "string" ? record.displayId.trim() : "";
  if (displayId) {
    return `Teilnehmer ${displayId}`;
  }

  return `Teilnehmer ${fallbackId}`;
}

function normalizeParticipants(raw: unknown): Map<string, ParticipantRecord> {
  const participants = new Map<string, ParticipantRecord>();

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const record = asRecord(entry);
      if (!record) {
        continue;
      }

      const id =
        record.id != null
          ? String(record.id)
          : typeof record.displayId === "string"
            ? record.displayId
            : null;
      if (!id) {
        continue;
      }

      participants.set(id, { id, name: participantName(record, id) });
    }

    return participants;
  }

  const objectRecord = asRecord(raw);
  if (!objectRecord) {
    return participants;
  }

  for (const [key, entry] of Object.entries(objectRecord)) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }

    const id = record.id != null ? String(record.id) : key;
    participants.set(id, { id, name: participantName(record, id) });
  }

  return participants;
}

function resolveParticipantReference(
  entry: unknown,
  participants: Map<string, ParticipantRecord>,
): ParticipantRecord | null {
  if (typeof entry === "number" || typeof entry === "string") {
    const id = String(entry);
    return participants.get(id) ?? { id, name: `Teilnehmer ${id}` };
  }

  const record = asRecord(entry);
  if (!record) {
    return null;
  }

  if (record.id != null) {
    const id = String(record.id);
    const known = participants.get(id);
    if (known) {
      return known;
    }

    return { id, name: participantName(record, id) };
  }

  if (typeof record.participant === "number" || typeof record.participant === "string") {
    const id = String(record.participant);
    return participants.get(id) ?? { id, name: `Teilnehmer ${id}` };
  }

  const nested = asRecord(record.participant);
  if (nested?.id != null) {
    const id = String(nested.id);
    return participants.get(id) ?? { id, name: participantName(nested, id) };
  }

  return null;
}

function groupLabelFromRecord(group: unknown, index: number) {
  const record = asRecord(group);
  if (!record) {
    return groupDisplayName(index);
  }

  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name) {
    return name;
  }

  const displayId = typeof record.displayId === "string" ? record.displayId.trim() : "";
  if (displayId) {
    return /^[A-Z]$/.test(displayId) ? `Gruppe ${displayId}` : displayId;
  }

  return groupDisplayName(index);
}

function groupIdFromRecord(group: unknown, index: number) {
  const record = asRecord(group);
  if (!record) {
    return `group-${index + 1}`;
  }

  if (record.id != null) {
    return String(record.id);
  }

  const displayId = typeof record.displayId === "string" ? record.displayId.trim() : "";
  if (displayId) {
    return displayId;
  }

  return `group-${index + 1}`;
}

function buildGroupsFromArrays(
  rawGroups: unknown,
  rawGroupParticipants: unknown,
  participants: Map<string, ParticipantRecord>,
): NormalizedMeinTurnierplanGroup[] {
  const groupParticipants = Array.isArray(rawGroupParticipants) ? rawGroupParticipants : [];
  const groupsArray = Array.isArray(rawGroups) ? rawGroups : [];
  const groupCount = Math.max(groupsArray.length, groupParticipants.length);

  if (groupCount === 0) {
    return [];
  }

  return Array.from({ length: groupCount }, (_, index) => {
    const members = Array.isArray(groupParticipants[index]) ? groupParticipants[index] : [];
    const teams = members
      .map((member) => resolveParticipantReference(member, participants))
      .filter((team): team is ParticipantRecord => Boolean(team))
      .map((team) => ({ id: team.id, name: team.name }));

    return {
      id: groupsArray[index] ? groupIdFromRecord(groupsArray[index], index) : `group-${index + 1}`,
      name: groupsArray[index]
        ? groupLabelFromRecord(groupsArray[index], index)
        : groupDisplayName(index),
      teams,
    };
  });
}

export function extractMeinTurnierplanSchemaVersion(raw: Record<string, unknown>) {
  if (typeof raw.version === "string" && raw.version.trim()) {
    return raw.version.trim();
  }

  if (typeof raw.schemaVersion === "string" && raw.schemaVersion.trim()) {
    return raw.schemaVersion.trim();
  }

  return null;
}

export function normalizeMeinTurnierplanResponse(
  raw: Record<string, unknown>,
): MeinTurnierplanNormalizeResult {
  const participants = normalizeParticipants(raw.participants);
  const meta: MeinTurnierplanRawMeta = {
    schemaVersion: extractMeinTurnierplanSchemaVersion(raw),
    participantCount: participants.size,
    groupCount: 0,
    teamCount: 0,
  };

  if (participants.size === 0) {
    return {
      ok: false,
      error: "no-participants",
      message: "In der MeinTurnierplan-Antwort wurden keine Teams gefunden.",
      meta,
    };
  }

  const groups = buildGroupsFromArrays(raw.groups, raw.groupParticipants, participants);
  meta.groupCount = groups.length;
  meta.teamCount = groups.reduce((count, group) => count + group.teams.length, 0);

  if (groups.length === 0) {
    return {
      ok: false,
      error: "no-groups",
      message: "In der MeinTurnierplan-Antwort wurden keine Gruppen gefunden.",
      meta,
    };
  }

  if (meta.teamCount === 0) {
    return {
      ok: false,
      error: "no-teams",
      message: "Es wurden Gruppen erkannt, aber keine Teams darin zugeordnet.",
      meta,
    };
  }

  const tournamentName =
    typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null;

  return {
    ok: true,
    normalized: {
      tournamentName,
      groups,
      meta,
    },
  };
}

export function meinTurnierplanNormalizeMessage(error: MeinTurnierplanNormalizeError) {
  switch (error) {
    case "unknown-schema":
      return "Die MeinTurnierplan-Antwort hat ein unbekanntes JSON-Schema.";
    case "no-participants":
      return "In der MeinTurnierplan-Antwort wurden keine Teams gefunden.";
    case "no-groups":
      return "In der MeinTurnierplan-Antwort wurden keine Gruppen gefunden.";
    case "no-teams":
      return "Es wurden Gruppen erkannt, aber keine Teams darin zugeordnet.";
  }
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runMeinTurnierplanNormalizeSelfChecks() {
  const realStructure = normalizeMeinTurnierplanResponse({
    version: "3.77.0",
    name: "D2-Sommercup 2026",
    groups: [{ displayId: "A" }, { displayId: "B" }],
    groupParticipants: [
      [5292819, 5292820, 5292821, 5292822],
      [5292837, 5292838, 5292839, 5292840],
    ],
    participants: {
      "5292819": { id: 5292819, name: "VfL Kirchheim", displayId: "1" },
      "5292820": { id: 5292820, name: "SGM Winterbach / Remshalden", displayId: "2" },
      "5292821": { id: 5292821, name: "TSV Altenburg", displayId: "3" },
      "5292822": { id: 5292822, name: "SV Fellbach", displayId: "4" },
      "5292837": { id: 5292837, name: "TSV Grötzingen", displayId: "5" },
      "5292838": { id: 5292838, name: "VfL Kirchheim II", displayId: "6" },
      "5292839": { id: 5292839, name: "TSF Ditzingen", displayId: "7" },
      "5292840": { id: 5292840, name: "VfL Kirchheim III", displayId: "8" },
    },
  });
  assert(realStructure.ok, "reale D2-Sommercup Struktur muss normalisierbar sein");
  if (realStructure.ok) {
    assert(realStructure.normalized.groups.length === 2, "zwei Gruppen im Realfall");
    assert(realStructure.normalized.meta.teamCount === 8, "acht Teams im Realfall");
    assert(
      realStructure.normalized.groups[0]?.teams.length === 4,
      "Gruppe A muss vier Teams haben",
    );
  }

  const keyed = normalizeMeinTurnierplanResponse({
    version: "3.77.0",
    name: "D2-Sommercup 2026",
    groups: [{ displayId: "A" }, { displayId: "B" }],
    groupParticipants: [
      [5292819, 5292820],
      [5292837, 5292838],
    ],
    participants: {
      "5292819": { id: 5292819, name: "VfL Kirchheim", displayId: "1" },
      "5292820": { id: 5292820, name: "SGM Winterbach / Remshalden", displayId: "2" },
      "5292837": { id: 5292837, name: "TSV Altenburg", displayId: "3" },
      "5292838": { id: 5292838, name: "Team Delta", displayId: "4" },
    },
  });
  assert(keyed.ok, "keyed v5 schema muss normalisierbar sein");
  if (keyed.ok) {
    assert(keyed.normalized.groups.length === 2, "zwei Gruppen erwartet");
    assert(keyed.normalized.groups[0]?.name === "Gruppe A", "Gruppe A erwartet");
    assert(keyed.normalized.groups[0]?.teams[0]?.name === "VfL Kirchheim", "Teamname erwartet");
    assert(keyed.normalized.meta.teamCount === 4, "vier Teams erwartet");
  }

  const arrayParticipants = normalizeMeinTurnierplanResponse({
    name: "Array Schema",
    groupParticipants: [[1, 2]],
    participants: [
      { id: 1, name: "Team Eins" },
      { id: 2, name: "Team Zwei" },
    ],
  });
  assert(arrayParticipants.ok, "participants array muss unterstützt werden");

  const onlyGroupParticipants = normalizeMeinTurnierplanResponse({
    groupParticipants: [[10, 11]],
    participants: {
      "10": { id: 10, name: "Alpha" },
      "11": { id: 11, name: "Beta" },
    },
  });
  assert(onlyGroupParticipants.ok, "groups ohne groups[] muss unterstützt werden");
  if (onlyGroupParticipants.ok) {
    assert(onlyGroupParticipants.normalized.groups[0]?.name === "Gruppe A", "fallback Gruppe A");
  }

  return "ok";
}

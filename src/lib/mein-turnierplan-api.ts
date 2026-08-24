import { groupDisplayName } from "@/lib/schedule/names";

export const MEIN_TURNIERPLAN_JSON_API =
  "https://www.meinturnierplan.de/json/json.php";

export const MEIN_TURNIERPLAN_REQUEST_TIMEOUT_MS = 10_000;

export type MeinTurnierplanConnectionError = "unreachable" | "no-data" | "invalid-id";

export type MeinTurnierplanPreviewGroup = {
  name: string;
  teams: string[];
};

export type MeinTurnierplanPreview = {
  tournamentName: string | null;
  groups: MeinTurnierplanPreviewGroup[];
};

export type MeinTurnierplanJsonResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: MeinTurnierplanConnectionError };

type JsonParticipant = {
  id?: number | string;
  name?: string;
  displayId?: string;
};

function participantLabel(participant: JsonParticipant) {
  const name = participant.name?.trim();
  if (name) {
    return name;
  }

  if (participant.displayId?.trim()) {
    return `Teilnehmer ${participant.displayId.trim()}`;
  }

  if (participant.id != null) {
    return `Teilnehmer ${participant.id}`;
  }

  return "Unbenanntes Team";
}

function participantsMap(data: Record<string, unknown>) {
  const raw = data.participants;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return new Map<string, string>();
  }

  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }

    map.set(String(key), participantLabel(value as JsonParticipant));
  }

  return map;
}

function groupsFromOfficialGroupsArray(
  data: Record<string, unknown>,
  participants: Map<string, string>,
) {
  const rawGroups = data.groups;
  if (!Array.isArray(rawGroups) || rawGroups.length === 0) {
    return [] as MeinTurnierplanPreviewGroup[];
  }

  const groupParticipants = Array.isArray(data.groupParticipants)
    ? data.groupParticipants
    : [];

  return rawGroups.map((group, index) => {
    const record =
      group && typeof group === "object" && !Array.isArray(group)
        ? (group as Record<string, unknown>)
        : {};
    const displayId =
      typeof record.displayId === "string" && record.displayId.trim()
        ? record.displayId.trim()
        : typeof record.name === "string" && record.name.trim()
          ? record.name.trim()
          : groupDisplayName(index);
    const memberIds = Array.isArray(groupParticipants[index])
      ? (groupParticipants[index] as unknown[]).map(String)
      : [];

    return {
      name: displayId.match(/^[A-Z]$/) ? `Gruppe ${displayId}` : `Gruppe ${displayId}`,
      teams: memberIds
        .map((id) => participants.get(id))
        .filter((name): name is string => Boolean(name)),
    };
  });
}

function groupsFromGroupParticipants(
  data: Record<string, unknown>,
  participants: Map<string, string>,
) {
  const groupParticipants = data.groupParticipants;
  if (!Array.isArray(groupParticipants) || groupParticipants.length === 0) {
    return [] as MeinTurnierplanPreviewGroup[];
  }

  return groupParticipants.map((members, index) => {
    const memberIds = Array.isArray(members) ? members.map(String) : [];
    return {
      name: groupDisplayName(index),
      teams: memberIds
        .map((id) => participants.get(id))
        .filter((name): name is string => Boolean(name)),
    };
  });
}

export function parseMeinTurnierplanPreview(
  data: Record<string, unknown>,
): MeinTurnierplanPreview {
  const participants = participantsMap(data);
  const officialGroups = groupsFromOfficialGroupsArray(data, participants);
  const groups =
    officialGroups.length > 0
      ? officialGroups
      : groupsFromGroupParticipants(data, participants);

  const tournamentName =
    typeof data.name === "string" && data.name.trim() ? data.name.trim() : null;

  return {
    tournamentName,
    groups,
  };
}

export function hasMeinTurnierplanStructure(data: Record<string, unknown>) {
  const participants = data.participants;
  const groups = data.groups;
  const groupParticipants = data.groupParticipants;

  const hasParticipants =
    participants &&
    typeof participants === "object" &&
    !Array.isArray(participants) &&
    Object.keys(participants).length > 0;
  const hasGroups = Array.isArray(groups) && groups.length > 0;
  const hasGroupParticipants =
    Array.isArray(groupParticipants) && groupParticipants.length > 0;

  return hasParticipants || hasGroups || hasGroupParticipants;
}

export async function fetchMeinTurnierplanJson(
  tournamentId: string,
): Promise<MeinTurnierplanJsonResult> {
  const trimmed = tournamentId.trim();
  if (!trimmed) {
    return { ok: false, error: "invalid-id" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    MEIN_TURNIERPLAN_REQUEST_TIMEOUT_MS,
  );

  try {
    const url = `${MEIN_TURNIERPLAN_JSON_API}?id=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, error: "unreachable" };
    }

    const data = (await response.json()) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, error: "no-data" };
    }

    const record = data as Record<string, unknown>;
    if (!hasMeinTurnierplanStructure(record)) {
      return { ok: false, error: "no-data" };
    }

    return { ok: true, data: record };
  } catch {
    return { ok: false, error: "unreachable" };
  } finally {
    clearTimeout(timeout);
  }
}

export function meinTurnierplanConnectionMessage(
  error: MeinTurnierplanConnectionError,
) {
  if (error === "unreachable") {
    return "MeinTurnierplan konnte nicht erreicht werden.";
  }

  if (error === "invalid-id") {
    return "Bitte eine gültige MeinTurnierplan-Turnier-ID angeben.";
  }

  return "Für diese Turnier-ID konnten keine Turnierdaten geladen werden.";
}

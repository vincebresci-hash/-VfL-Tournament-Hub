import {
  extractMeinTurnierplanSchemaVersion,
  meinTurnierplanNormalizeMessage,
  normalizeMeinTurnierplanResponse,
  type MeinTurnierplanNormalizeError,
  type MeinTurnierplanRawMeta,
  type NormalizedMeinTurnierplanResponse,
} from "@/lib/mein-turnierplan-normalize";

export const MEIN_TURNIERPLAN_JSON_API =
  "https://www.meinturnierplan.de/json/json.php";

export const MEIN_TURNIERPLAN_REQUEST_TIMEOUT_MS = 10_000;

export type MeinTurnierplanConnectionError =
  | "unreachable"
  | "no-data"
  | "invalid-id"
  | "id-not-found"
  | MeinTurnierplanNormalizeError;

export type MeinTurnierplanPreviewTeam = {
  id: string;
  name: string;
};

export type MeinTurnierplanPreviewGroup = {
  id: string;
  name: string;
  teams: MeinTurnierplanPreviewTeam[];
};

export type MeinTurnierplanPreview = {
  tournamentName: string | null;
  groups: MeinTurnierplanPreviewGroup[];
  meta: MeinTurnierplanRawMeta;
};

export type MeinTurnierplanJsonResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: MeinTurnierplanConnectionError };

function toPreview(normalized: NormalizedMeinTurnierplanResponse): MeinTurnierplanPreview {
  return {
    tournamentName: normalized.tournamentName,
    meta: normalized.meta,
    groups: normalized.groups.map((group) => ({
      id: group.id,
      name: group.name,
      teams: group.teams.map((team) => ({ id: team.id, name: team.name })),
    })),
  };
}

export function parseMeinTurnierplanPreview(data: Record<string, unknown>) {
  const normalized = normalizeMeinTurnierplanResponse(data);
  if (!normalized.ok) {
    return {
      ok: false as const,
      error: normalized.error,
      message: normalized.message,
      meta: normalized.meta,
      preview: null,
    };
  }

  return {
    ok: true as const,
    preview: toPreview(normalized.normalized),
    meta: normalized.normalized.meta,
  };
}

export function hasMeinTurnierplanStructure(data: Record<string, unknown>) {
  const participants = data.participants;
  const groups = data.groups;
  const groupParticipants = data.groupParticipants;

  const hasParticipants =
    (Array.isArray(participants) && participants.length > 0) ||
    (participants &&
      typeof participants === "object" &&
      !Array.isArray(participants) &&
      Object.keys(participants).length > 0);
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
      try {
        const errorData = (await response.json()) as unknown;
        if (
          errorData &&
          typeof errorData === "object" &&
          !Array.isArray(errorData) &&
          typeof (errorData as Record<string, unknown>).error === "string"
        ) {
          const message = ((errorData as Record<string, unknown>).error as string)
            .trim()
            .toLowerCase();
          if (message.includes("not found")) {
            return { ok: false, error: "id-not-found" };
          }
        }
      } catch {
        // fall through to unreachable
      }

      return { ok: false, error: "unreachable" };
    }

    const data = (await response.json()) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, error: "no-data" };
    }

    const record = data as Record<string, unknown>;
    if (typeof record.error === "string" && record.error.trim()) {
      const message = record.error.trim().toLowerCase();
      if (message.includes("not found")) {
        return { ok: false, error: "id-not-found" };
      }

      return { ok: false, error: "no-data" };
    }

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

export function meinTurnierplanConnectionMessage(error: MeinTurnierplanConnectionError) {
  if (error === "unreachable") {
    return "MeinTurnierplan konnte nicht erreicht werden.";
  }

  if (error === "invalid-id") {
    return "Bitte eine gültige numerische MeinTurnierplan-Turnier-ID angeben.";
  }

  if (error === "id-not-found") {
    return "Für diese Turnier-ID wurden keine Turnierdaten gefunden. MeinTurnierplan json.php erwartet die öffentliche Turnierkennung (z. B. aus showit.php?id=… oder dem id-Parameter der Widget-URL), nicht die interne ID aus der JSON-Antwort.";
  }

  if (error === "no-data") {
    return "Für diese numerische Turnier-ID konnten keine Turnierdaten geladen werden.";
  }

  return meinTurnierplanNormalizeMessage(error);
}

export { extractMeinTurnierplanSchemaVersion };

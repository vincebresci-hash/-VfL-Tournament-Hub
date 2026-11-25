/**
 * Fail-closed mode resolution for legacy schedule generation.
 * A missing competition_format column is represented by a null format.
 * That fallback stays on the legacy group-count path and never selects Champions League.
 */

import {
  resolveStoredCompetitionTopology,
  type CompetitionFormat,
} from "@/lib/schedule/competition-config";

const GROUP_KEY_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GenerationMode = Extract<CompetitionFormat, "round-robin" | "groups-knockout">;

export type CompetitionFormatReadResult =
  | { status: "ok"; competitionFormat: unknown }
  | { status: "missing_column" }
  | { status: "error"; message: string };

export type GenerationModeDecision =
  | { ok: true; mode: GenerationMode }
  | { ok: false; code: string; message: string };

export type PersistenceGuardDecision =
  | { allowDelete: true }
  | { allowDelete: false; code: string; message: string };

function blocked(code: string, message: string): GenerationModeDecision {
  return { ok: false, code, message };
}

/**
 * True only when the error identifies the absent competition_format column.
 * Other missing tables, columns, and permission errors stay ordinary failures.
 */
export function isMissingCompetitionFormatColumnError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) {
    return false;
  }
  const message = (error.message ?? "").toLowerCase();
  if (!message.includes("competition_format")) {
    return false;
  }
  const code = error.code ?? "";
  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
}

export function resolveGenerationMode(input: {
  competitionFormat: unknown;
  groupCount: number;
}): GenerationModeDecision {
  const topology = resolveStoredCompetitionTopology(input);
  if (!topology.ok) {
    return blocked(topology.code, topology.message);
  }
  if (topology.storedFormat === "champions-league" || topology.effectiveMode === "champions-league") {
    return blocked(
      "CHAMPIONS_LEAGUE_GENERATION_BLOCKED",
      "Champions League kann mit der bestehenden Spielplanerzeugung nicht erstellt werden.",
    );
  }
  if (!topology.generationReady) {
    return blocked(
      topology.state,
      "Der gespeicherte Spielplanmodus kann mit der vorhandenen Gruppenstruktur nicht erzeugt werden.",
    );
  }
  if (topology.effectiveMode !== "round-robin" && topology.effectiveMode !== "groups-knockout") {
    return blocked(
      "UNSUPPORTED_GENERATION_MODE",
      "Der gespeicherte Spielplanmodus kann nicht erzeugt werden.",
    );
  }
  return { ok: true, mode: topology.effectiveMode };
}

export function rejectUnsafeGroupKeys(
  groupKeys: readonly (string | null | undefined)[],
): { ok: true } | { ok: false; code: string; message: string } {
  for (const groupKey of groupKeys) {
    if (typeof groupKey === "string" && groupKey.trim().toLowerCase() === "league") {
      return {
        ok: false,
        code: "VIRTUAL_LEAGUE_GROUP",
        message: "Der virtuelle Liga-Schlüssel kann nicht als Gruppe gespeichert werden.",
      };
    }
    if (typeof groupKey !== "string" || !GROUP_KEY_UUID.test(groupKey)) {
      return {
        ok: false,
        code: "INVALID_GROUP_KEY",
        message: "Ein Spiel verweist auf eine ungültige Gruppe.",
      };
    }
  }
  return { ok: true };
}

/**
 * Decide whether a group-schedule replacement may reach DELETE.
 * previewMode is only a hint. The stored format and server group ids decide.
 */
export function decidePersistenceGuard(input: {
  previewMode: string;
  groupKeys: readonly (string | null | undefined)[];
  formatRead: CompetitionFormatReadResult;
  groupCount: number;
  knownGroupIds: readonly string[];
}): PersistenceGuardDecision {
  if (input.previewMode === "champions-league") {
    return {
      allowDelete: false,
      code: "CHAMPIONS_LEAGUE_PREVIEW",
      message: "Eine Champions-League-Vorschau kann nicht als Gruppenspielplan gespeichert werden.",
    };
  }

  const keys = rejectUnsafeGroupKeys(input.groupKeys);
  if (!keys.ok) {
    return { allowDelete: false, code: keys.code, message: keys.message };
  }

  if (input.formatRead.status === "error") {
    return {
      allowDelete: false,
      code: "COMPETITION_FORMAT_READ_FAILED",
      message: input.formatRead.message,
    };
  }

  const competitionFormat =
    input.formatRead.status === "missing_column" ? null : input.formatRead.competitionFormat;
  const generation = resolveGenerationMode({
    competitionFormat,
    groupCount: input.groupCount,
  });
  if (!generation.ok) {
    return { allowDelete: false, code: generation.code, message: generation.message };
  }
  if (input.previewMode !== generation.mode) {
    return {
      allowDelete: false,
      code: "PREVIEW_MODE_MISMATCH",
      message: "Die Vorschau passt nicht zum gespeicherten Spielplanmodus.",
    };
  }

  const known = new Set(input.knownGroupIds);
  for (const groupKey of input.groupKeys) {
    if (typeof groupKey !== "string" || !known.has(groupKey)) {
      return {
        allowDelete: false,
        code: "UNKNOWN_GROUP_KEY",
        message: "Ein Spiel verweist auf eine Gruppe, die nicht zu diesem Turnier gehört.",
      };
    }
  }

  return { allowDelete: true };
}

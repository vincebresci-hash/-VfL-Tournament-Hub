/**
 * Orchestrates a configuration save against an injected repository.
 * Success is returned only when the conditional update proves the intended row changed.
 */

import { isMissingRelationError } from "@/lib/db/errors";
import {
  evaluateCompetitionConfigurationSave,
  type ConfigurationSaveRequest,
  type ConfigurationSaveSnapshot,
} from "@/lib/schedule/competition-config-save-policy";
import type { StoredCompetitionColumns } from "@/lib/schedule/competition-config";

export type ConfigurationSaveStatus =
  | "success"
  | "unchanged"
  | "forbidden"
  | "not_found"
  | "stale_configuration"
  | "validation_error"
  | "config_locked"
  | "not_activated"
  | "missing_columns"
  | "persistence_error";

export type ConfigurationSaveResult = {
  status: ConfigurationSaveStatus;
  code: string | null;
  error: string | null;
  updatedAt: string | null;
};

export type ProvedConfigurationRow = {
  id: string;
  slug: string | null;
  updatedAt: string;
  columns: StoredCompetitionColumns;
};

export type ConditionalUpdateAttempt = {
  error: { code?: string; message?: string } | null;
  rows: ProvedConfigurationRow[] | null;
  reread: { found: boolean; updatedAt: string | null } | null;
};

export type CompetitionConfigurationSaveDeps = {
  authorize: () => Promise<"ok" | "forbidden">;
  load: (
    tournamentId: string,
  ) => Promise<
    | { status: "not_found" }
    | { status: "missing_columns" }
    | { status: "error"; message: string }
    | { status: "ok"; snapshot: ConfigurationSaveSnapshot }
  >;
  updateColumns: (input: {
    tournamentId: string;
    expectedUpdatedAt: string;
    columns: StoredCompetitionColumns;
  }) => Promise<ConditionalUpdateAttempt>;
  revalidate: (row: { id: string; slug: string | null }) => void;
};

export type CompetitionConfigurationSaveInput = ConfigurationSaveRequest & {
  tournamentId: string;
};

function result(
  status: ConfigurationSaveStatus,
  code: string | null,
  error: string | null,
  updatedAt: string | null = null,
): ConfigurationSaveResult {
  return { status, code, error, updatedAt };
}

function sameColumns(left: StoredCompetitionColumns, right: StoredCompetitionColumns) {
  return (
    left.competitionFormat === right.competitionFormat &&
    left.leagueMatchesPerTeam === right.leagueMatchesPerTeam &&
    left.knockoutCutoff === right.knockoutCutoff
  );
}

/**
 * Zero updated rows are ambiguous. A later read separates a lost race from a
 * missing row and from an update that did not change the expected version.
 */
export function interpretConditionalTournamentUpdate(input: {
  tournamentId: string;
  expectedUpdatedAt: string;
  columns: StoredCompetitionColumns;
  attempt: ConditionalUpdateAttempt;
}): ConfigurationSaveResult {
  if (input.attempt.error && isMissingRelationError(input.attempt.error)) {
    return result(
      "missing_columns",
      "MISSING_COLUMNS",
      "Die Wettbewerbsspalten sind in der Datenbank noch nicht vorhanden. Es wurde nichts gespeichert.",
    );
  }
  if (input.attempt.error) {
    return result(
      "persistence_error",
      "PERSISTENCE_ERROR",
      "Die Konfiguration konnte nicht gespeichert werden.",
    );
  }

  const rows = input.attempt.rows;
  if (rows && rows.length === 1) {
    const row = rows[0]!;
    const proved =
      row.id === input.tournamentId &&
      sameColumns(row.columns, input.columns) &&
      row.updatedAt.trim() !== "" &&
      row.updatedAt !== input.expectedUpdatedAt;
    if (!proved) {
      return result(
        "persistence_error",
        "UPDATE_NOT_PROVED",
        "Die Konfiguration konnte nicht als gespeichert nachgewiesen werden.",
      );
    }
    return result("success", null, null, row.updatedAt);
  }
  if (rows && rows.length > 1) {
    return result(
      "persistence_error",
      "UPDATE_NOT_PROVED",
      "Die Konfiguration konnte nicht als gespeichert nachgewiesen werden.",
    );
  }

  const reread = input.attempt.reread;
  if (!reread) {
    return result(
      "persistence_error",
      "ZERO_ROW_UPDATE",
      "Die bedingte Speicherung hat keine Zeile geändert. Es wurde nichts als Erfolg gewertet.",
    );
  }
  if (!reread.found) {
    return result("not_found", "NOT_FOUND", "Das Turnier wurde nicht gefunden.");
  }
  if (reread.updatedAt != null && reread.updatedAt !== input.expectedUpdatedAt) {
    return result(
      "stale_configuration",
      "STALE_CONFIGURATION",
      "Die Turnierkonfiguration wurde zwischenzeitlich geändert.",
    );
  }
  return result(
    "forbidden",
    "RLS_WRITE_DENIED",
    "Keine Berechtigung, diese Turnierkonfiguration zu speichern.",
  );
}

export async function executeCompetitionConfigurationSave(
  deps: CompetitionConfigurationSaveDeps,
  input: CompetitionConfigurationSaveInput,
): Promise<ConfigurationSaveResult> {
  if (input.tournamentId.trim() === "") {
    return result("validation_error", "INVALID_TOURNAMENT", "Das Turnier fehlt.");
  }

  if ((await deps.authorize()) !== "ok") {
    return result("forbidden", "FORBIDDEN", "Keine Berechtigung für diese Aktion.");
  }

  const loaded = await deps.load(input.tournamentId);
  if (loaded.status === "not_found") {
    return result("not_found", "NOT_FOUND", "Das Turnier wurde nicht gefunden.");
  }
  if (loaded.status === "missing_columns") {
    return result(
      "missing_columns",
      "MISSING_COLUMNS",
      "Die Wettbewerbsspalten sind in der Datenbank noch nicht vorhanden. Es wurde nichts gespeichert.",
    );
  }
  if (loaded.status === "error") {
    return result("persistence_error", "PERSISTENCE_ERROR", loaded.message);
  }

  const decision = evaluateCompetitionConfigurationSave(loaded.snapshot, input);
  if (decision.kind === "unchanged") {
    return result("unchanged", null, null, loaded.snapshot.updatedAt);
  }
  if (decision.kind === "reject") {
    return result(decision.status, decision.code, decision.error);
  }

  const attempt = await deps.updateColumns({
    tournamentId: input.tournamentId,
    expectedUpdatedAt: input.expectedUpdatedAt,
    columns: decision.columns,
  });
  const interpreted = interpretConditionalTournamentUpdate({
    tournamentId: input.tournamentId,
    expectedUpdatedAt: input.expectedUpdatedAt,
    columns: decision.columns,
    attempt,
  });
  if (interpreted.status === "success" && attempt.rows && attempt.rows.length === 1) {
    deps.revalidate({ id: attempt.rows[0]!.id, slug: attempt.rows[0]!.slug });
  }
  return interpreted;
}

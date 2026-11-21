/**
 * Pure eligibility for a competition-configuration save.
 * Snapshots are server-authoritative. This module does not read or write a database.
 *
 * prepareTournamentPlanFromDb refuses a stored champions-league format before
 * preview generation and before group-schedule persistence. Configuration
 * saves stay inactive until a later activation stage.
 */

import {
  resolveStoredCompetitionTopology,
  validateChampionsLeagueConfiguration,
  validateStoredCompetitionColumns,
  type ConfirmedParticipantIdentity,
  type StoredCompetitionColumns,
} from "@/lib/schedule/competition-config";
import type { TournamentLifecycleState } from "@/lib/schedule/tournament-lifecycle";

export const CHAMPIONS_LEAGUE_CONFIGURATION_SAVE_ACTIVATED = false;

export const CHAMPIONS_LEAGUE_SAVE_BLOCKED_UNTIL =
  "Champions League configuration saves stay inactive until a later activation stage reviews participant reads and concurrency.";

export type ConfigurationMatchSnapshot = {
  phase: string | null;
  status: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

export type ConfigurationSaveSnapshot = {
  updatedAt: string | null;
  competitionFormat: unknown;
  leagueMatchesPerTeam: number | null;
  knockoutCutoff: number | null;
  groupCount: number;
  matches: readonly ConfigurationMatchSnapshot[];
  effectiveLifecycle: TournamentLifecycleState | null;
  participants: readonly ConfirmedParticipantIdentity[];
};

export type ConfigurationSaveRequest = {
  expectedUpdatedAt: string;
  competitionFormat: unknown;
  leagueMatchesPerTeam: number | null;
  knockoutCutoff: number | null;
};

export type ConfigurationSaveDecision =
  | {
      kind: "reject";
      status: "validation_error" | "config_locked" | "stale_configuration" | "not_activated";
      code: string;
      error: string;
    }
  | { kind: "unchanged" }
  | { kind: "write"; columns: StoredCompetitionColumns };

function reject(
  status: "validation_error" | "config_locked" | "stale_configuration" | "not_activated",
  code: string,
  error: string,
): ConfigurationSaveDecision {
  return { kind: "reject", status, code, error };
}

function sameColumns(left: StoredCompetitionColumns, right: StoredCompetitionColumns) {
  return (
    left.competitionFormat === right.competitionFormat &&
    left.leagueMatchesPerTeam === right.leagueMatchesPerTeam &&
    left.knockoutCutoff === right.knockoutCutoff
  );
}

function versionDecision(
  snapshot: ConfigurationSaveSnapshot,
  request: ConfigurationSaveRequest,
): ConfigurationSaveDecision | null {
  if (request.expectedUpdatedAt.trim() === "" || snapshot.updatedAt == null || snapshot.updatedAt.trim() === "") {
    return reject("validation_error", "MISSING_VERSION", "Die gespeicherte Version fehlt.");
  }
  if (request.expectedUpdatedAt !== snapshot.updatedAt) {
    return reject(
      "stale_configuration",
      "STALE_CONFIGURATION",
      "Die Turnierkonfiguration wurde zwischenzeitlich geändert.",
    );
  }
  return null;
}

function lockDecision(snapshot: ConfigurationSaveSnapshot): ConfigurationSaveDecision | null {
  if (snapshot.effectiveLifecycle == null) {
    return reject("validation_error", "LIFECYCLE_UNKNOWN", "Der Turnierstatus ist nicht bekannt.");
  }
  if (snapshot.effectiveLifecycle === "completed") {
    return reject(
      "config_locked",
      "LIFECYCLE_COMPLETED",
      "Ein abgeschlossenes Turnier kann nicht umkonfiguriert werden.",
    );
  }
  if (snapshot.effectiveLifecycle === "knockout_stage") {
    return reject(
      "config_locked",
      "LIFECYCLE_KNOCKOUT",
      "Ein Turnier in der K.-o.-Phase kann nicht umkonfiguriert werden.",
    );
  }

  const matches = snapshot.matches;
  if (matches.some((match) => match.phase === "knockout")) {
    return reject(
      "config_locked",
      "KNOCKOUT_MATCHES",
      "Vorhandene K.-o.-Spiele sperren eine Konfigurationsänderung.",
    );
  }
  if (matches.some((match) => match.status === "live")) {
    return reject("config_locked", "LIVE_MATCH", "Ein laufendes Spiel sperrt eine Konfigurationsänderung.");
  }
  if (
    matches.some(
      (match) => match.status === "completed" || match.homeScore != null || match.awayScore != null,
    )
  ) {
    return reject(
      "config_locked",
      "RESULTS_EXIST",
      "Vorhandene Ergebnisse sperren eine Konfigurationsänderung.",
    );
  }
  if (matches.length > 0) {
    return reject(
      "config_locked",
      "MATCHES_EXIST",
      "Vorhandene Spiele sperren eine Konfigurationsänderung. Der Spielplan muss zuerst gelöscht werden.",
    );
  }
  return null;
}

/**
 * Decide whether a configuration save may write, is already stored, or must fail closed.
 * Match generation is a different operation and is not authorized here.
 */
export function evaluateCompetitionConfigurationSave(
  snapshot: ConfigurationSaveSnapshot,
  request: ConfigurationSaveRequest,
): ConfigurationSaveDecision {
  const requested = validateStoredCompetitionColumns({
    competitionFormat: request.competitionFormat,
    leagueMatchesPerTeam: request.leagueMatchesPerTeam,
    knockoutCutoff: request.knockoutCutoff,
  });
  if (!requested.ok) {
    return reject("validation_error", requested.code, requested.message);
  }

  const stored = validateStoredCompetitionColumns({
    competitionFormat: snapshot.competitionFormat,
    leagueMatchesPerTeam: snapshot.leagueMatchesPerTeam,
    knockoutCutoff: snapshot.knockoutCutoff,
  });
  if (!stored.ok) {
    return reject("validation_error", stored.code, stored.message);
  }

  if (requested.columns.competitionFormat === "champions-league") {
    const league = validateChampionsLeagueConfiguration({
      matchesPerTeam: requested.columns.leagueMatchesPerTeam,
      knockoutCutoff: requested.columns.knockoutCutoff,
      participants: snapshot.participants,
    });
    if (!league.ok) {
      return reject("validation_error", league.code, league.message);
    }
  }

  if (sameColumns(stored.columns, requested.columns)) {
    return versionDecision(snapshot, request) ?? { kind: "unchanged" };
  }

  if (
    stored.columns.competitionFormat == null &&
    snapshot.groupCount > 0 &&
    (requested.columns.competitionFormat === "round-robin" ||
      requested.columns.competitionFormat === "champions-league")
  ) {
    return reject(
      "validation_error",
      "UNSAFE_LEGACY_CONVERSION",
      "Ein vorhandenes Gruppenturnier kann nicht in einen anderen Modus umgestellt werden.",
    );
  }

  const topology = resolveStoredCompetitionTopology({
    competitionFormat: requested.columns.competitionFormat,
    groupCount: snapshot.groupCount,
  });
  if (!topology.ok) {
    return reject("validation_error", topology.code, topology.message);
  }
  if (topology.state === "champions-league-unverified-group") {
    return reject(
      "validation_error",
      "UNVERIFIED_LEAGUE_GROUP",
      "Eine vorhandene Gruppe ist noch kein bestätigter Liga-Wettbewerb.",
    );
  }
  if (topology.state === "groups-knockout-awaiting-groups") {
    return reject(
      "validation_error",
      "GROUPS_NOT_READY",
      "Gruppenphase kann ohne vorhandene Gruppen nicht gespeichert werden.",
    );
  }

  const locked = lockDecision(snapshot);
  if (locked) {
    return locked;
  }

  const stale = versionDecision(snapshot, request);
  if (stale) {
    return stale;
  }

  if (
    requested.columns.competitionFormat === "champions-league" &&
    !CHAMPIONS_LEAGUE_CONFIGURATION_SAVE_ACTIVATED
  ) {
    return reject(
      "not_activated",
      "CHAMPIONS_LEAGUE_SAVE_NOT_ACTIVATED",
      "Champions League kann noch nicht gespeichert werden, weil die Spielplanerzeugung den Modus noch nicht kennt.",
    );
  }

  return { kind: "write", columns: requested.columns };
}

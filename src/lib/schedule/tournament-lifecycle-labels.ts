/**
 * C6-H D3 — Pure German presentation labels for matchday lifecycle.
 * No DB, auth, or transition logic.
 */

import {
  TOURNAMENT_LIFECYCLE_STATES,
  type TournamentLifecycleState,
} from "@/lib/schedule/tournament-lifecycle";

export const TOURNAMENT_LIFECYCLE_LABEL_DE: Record<TournamentLifecycleState, string> =
  {
    setup: "Vorbereitung",
    group_stage: "Gruppenphase",
    knockout_stage: "K.-o.-Phase",
    completed: "Abgeschlossen",
  };

export const TOURNAMENT_LIFECYCLE_DESCRIPTION_DE: Record<
  TournamentLifecycleState,
  string
> = {
  setup:
    "Noch keine Gruppenstruktur. Lege Gruppen an, um die Gruppenphase zu starten.",
  group_stage:
    "Gruppen sind vorhanden. Ergebnisse und Spielplan laufen hier; die K.-o.-Phase beginnt nach der KO-Erzeugung.",
  knockout_stage:
    "K.-o.-Spiele sind vorhanden. Gruppenergebnisse sind gesperrt.",
  completed:
    "Turnier abgeschlossen. Für Änderungen ist eine explizite Wiedereröffnung nötig.",
};

/** Concise KO correction hint for the lifecycle panel (not the full C6-F board stack). */
export const TOURNAMENT_LIFECYCLE_KO_CORRECTION_HINT =
  "K.-o.-Phase aktiv. Gruppenergebnisse sind gesperrt. Für Korrekturen zuerst die K.-o.-Phase löschen.";

export const TOURNAMENT_LIFECYCLE_STEPS = TOURNAMENT_LIFECYCLE_STATES;

export function tournamentLifecycleLabelDe(
  state: TournamentLifecycleState,
): string {
  return TOURNAMENT_LIFECYCLE_LABEL_DE[state];
}

export function tournamentLifecycleDescriptionDe(
  state: TournamentLifecycleState,
): string {
  return TOURNAMENT_LIFECYCLE_DESCRIPTION_DE[state];
}

export function tournamentLifecycleStepIndex(
  state: TournamentLifecycleState,
): number {
  return TOURNAMENT_LIFECYCLE_STEPS.indexOf(state);
}

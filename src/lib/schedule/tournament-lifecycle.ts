/**
 * C6-H D1 — Pure tournament matchday lifecycle model (hybrid Option C).
 *
 * Separate from marketing `tournaments.status` (coming-soon/active/full/completed).
 * No persistence, DB, React, auth, or side effects.
 *
 * Supplements C6-B / C6-F / C6-G; never replaces their hard invariants.
 */

import type { RegenerationPolicyResult } from "@/lib/schedule/plan-preview";
import {
  canMutateGroupResults,
  type GroupResultLockPolicy,
} from "@/lib/schedule/group-result-lock";

export const TOURNAMENT_LIFECYCLE_STATES = [
  "setup",
  "group_stage",
  "knockout_stage",
  "completed",
] as const;

export type TournamentLifecycleState = (typeof TOURNAMENT_LIFECYCLE_STATES)[number];

/**
 * Minimum authoritative/derived facts for lifecycle reasoning.
 * Callers supply derived booleans; this module does not compute standings,
 * qualification, or KO outcomes.
 */
export type TournamentLifecycleFacts = {
  /** True when marketing `tournaments.status === "completed"`. */
  marketingStatusCompleted: boolean;
  /** True when at least one group row exists. */
  groupsExist: boolean;
  /** True when at least one group-phase schedule match exists (optional signal). */
  groupScheduleExists: boolean;
  /**
   * Existing `isGroupStageComplete(...).complete` (or equivalent).
   * Consumed as a fact — no second completeness algorithm here.
   */
  groupStageComplete: boolean;
  /**
   * True when ANY match has `phase === "knockout"` (status ignored).
   * Same presence semantics as C6-F / C6-B KO_STARTED.
   */
  knockoutExists: boolean;
  /**
   * Current product completion eligibility (final winner / existing complete gate).
   * Supplied by caller — not recomputed via a new KO-complete algorithm.
   */
  completionEligible: boolean;
};

export type ResolveEffectiveTournamentLifecycleInput = {
  /** Intended/persisted lifecycle when present (D2+). Null/undefined = derive only. */
  intended?: TournamentLifecycleState | null;
  facts: TournamentLifecycleFacts;
};

/**
 * Reconcile intended/persisted lifecycle with authoritative facts.
 * Hard facts win over stale intended state.
 */
export function resolveEffectiveTournamentLifecycle(
  input: ResolveEffectiveTournamentLifecycleInput,
): TournamentLifecycleState {
  const { facts } = input;
  const intended = input.intended ?? null;

  if (facts.marketingStatusCompleted || intended === "completed") {
    return "completed";
  }

  if (facts.knockoutExists) {
    return "knockout_stage";
  }

  // Stale intended knockout after KO deletion → rewind for C6-F correction.
  if (intended === "knockout_stage") {
    return facts.groupsExist ? "group_stage" : "setup";
  }

  if (facts.groupsExist) {
    // Groups exist ⇒ never remain setup (intended knockout already rewound above).
    return "group_stage";
  }

  // No groups, no KO, not completed.
  return "setup";
}

export const LIFECYCLE_TRANSITION_CODES = [
  "SAME_STATE",
  "SETUP_TO_GROUP_ALLOWED",
  "SETUP_TO_GROUP_BLOCKED_NO_GROUPS",
  "GROUP_TO_KO_ALLOWED",
  "GROUP_TO_KO_BLOCKED_NO_KO",
  "KO_TO_GROUP_ALLOWED",
  "KO_TO_GROUP_BLOCKED_KO_EXISTS",
  "KO_TO_COMPLETED_ALLOWED",
  "KO_TO_COMPLETED_BLOCKED_NOT_ELIGIBLE",
  "REOPEN_REQUIRES_CONFIRMATION",
  "REOPEN_ALLOWED",
  "REOPEN_BLOCKED_INCOMPATIBLE_FACTS",
  "INVALID_TRANSITION",
] as const;

export type LifecycleTransitionCode = (typeof LIFECYCLE_TRANSITION_CODES)[number];

export type LifecycleTransitionPolicy = {
  allowed: boolean;
  requiresConfirmation: boolean;
  code: LifecycleTransitionCode | null;
  reason: string | null;
};

export type CanTransitionTournamentLifecycleInput = {
  from: TournamentLifecycleState;
  to: TournamentLifecycleState;
  facts: TournamentLifecycleFacts;
  /** Required for completed → * reopen transitions. */
  confirmReopen?: boolean;
};

function decision(
  allowed: boolean,
  requiresConfirmation: boolean,
  code: LifecycleTransitionCode | null,
  reason: string | null,
): LifecycleTransitionPolicy {
  return { allowed, requiresConfirmation, code, reason };
}

/**
 * Pure transition policy. Does not persist or check RBAC.
 * Browser intent alone never advances group → knockout without KO presence.
 */
export function canTransitionTournamentLifecycle(
  input: CanTransitionTournamentLifecycleInput,
): LifecycleTransitionPolicy {
  const { from, to, facts } = input;
  const confirmReopen = input.confirmReopen === true;

  if (from === to) {
    return decision(true, false, "SAME_STATE", "Lifecycle unverändert.");
  }

  if (from === "setup" && to === "group_stage") {
    if (!facts.groupsExist) {
      return decision(
        false,
        false,
        "SETUP_TO_GROUP_BLOCKED_NO_GROUPS",
        "Gruppenstruktur fehlt; Wechsel in die Gruppenphase ist nicht möglich.",
      );
    }
    return decision(
      true,
      false,
      "SETUP_TO_GROUP_ALLOWED",
      "Gruppen vorhanden; Wechsel in die Gruppenphase ist erlaubt.",
    );
  }

  if (from === "group_stage" && to === "knockout_stage") {
    if (!facts.knockoutExists) {
      return decision(
        false,
        false,
        "GROUP_TO_KO_BLOCKED_NO_KO",
        "K.-o.-Phase fehlt; Wechsel erfordert vorhandene K.-o.-Spiele nach erfolgreicher Erzeugung.",
      );
    }
    return decision(
      true,
      false,
      "GROUP_TO_KO_ALLOWED",
      "K.-o.-Spiele vorhanden; Wechsel in die K.-o.-Phase ist erlaubt.",
    );
  }

  if (from === "knockout_stage" && to === "group_stage") {
    if (facts.knockoutExists) {
      return decision(
        false,
        false,
        "KO_TO_GROUP_BLOCKED_KO_EXISTS",
        "K.-o.-Spiele sind noch vorhanden; Rückkehr in die Gruppenphase ist nicht möglich.",
      );
    }
    if (!facts.groupsExist) {
      return decision(
        false,
        false,
        "INVALID_TRANSITION",
        "Ohne Gruppen ist die Gruppenphase nicht ansteuerbar.",
      );
    }
    return decision(
      true,
      false,
      "KO_TO_GROUP_ALLOWED",
      "Keine K.-o.-Spiele mehr; Rückkehr in die Gruppenphase (Korrekturfluss) ist erlaubt.",
    );
  }

  if (from === "knockout_stage" && to === "completed") {
    if (!facts.completionEligible) {
      return decision(
        false,
        false,
        "KO_TO_COMPLETED_BLOCKED_NOT_ELIGIBLE",
        "Abschluss nicht möglich: Finale ohne eindeutigen Sieger (bestehende Abschlussregel).",
      );
    }
    return decision(
      true,
      false,
      "KO_TO_COMPLETED_ALLOWED",
      "Finale mit Sieger; Abschluss ist erlaubt.",
    );
  }

  if (from === "completed" && (to === "knockout_stage" || to === "group_stage")) {
    if (!confirmReopen) {
      return decision(
        false,
        true,
        "REOPEN_REQUIRES_CONFIRMATION",
        "Wiedereröffnung eines abgeschlossenen Turniers erfordert eine Bestätigung.",
      );
    }

    if (to === "knockout_stage") {
      if (!facts.knockoutExists) {
        return decision(
          false,
          true,
          "REOPEN_BLOCKED_INCOMPATIBLE_FACTS",
          "Wiedereröffnung in die K.-o.-Phase erfordert vorhandene K.-o.-Spiele.",
        );
      }
      return decision(
        true,
        true,
        "REOPEN_ALLOWED",
        "Mit Bestätigung: Wiedereröffnung in die K.-o.-Phase erlaubt.",
      );
    }

    // completed → group_stage
    if (facts.knockoutExists) {
      return decision(
        false,
        true,
        "REOPEN_BLOCKED_INCOMPATIBLE_FACTS",
        "Wiedereröffnung in die Gruppenphase erfordert gelöschte K.-o.-Spiele.",
      );
    }
    if (!facts.groupsExist) {
      return decision(
        false,
        true,
        "REOPEN_BLOCKED_INCOMPATIBLE_FACTS",
        "Wiedereröffnung in die Gruppenphase erfordert vorhandene Gruppen.",
      );
    }
    return decision(
      true,
      true,
      "REOPEN_ALLOWED",
      "Mit Bestätigung: Wiedereröffnung in die Gruppenphase erlaubt.",
    );
  }

  return decision(
    false,
    false,
    "INVALID_TRANSITION",
    `Übergang ${from} → ${to} ist nicht vorgesehen.`,
  );
}

/**
 * Defense in depth vs C6-B: lifecycle may only tighten destructive schedule policy.
 * A C6-B `blocked` decision can never become allowed because of lifecycle.
 */
export function lifecycleAllowsDestructiveGroupScheduleMutation(input: {
  effectiveLifecycle: TournamentLifecycleState;
  regenerationPolicy: Pick<RegenerationPolicyResult, "decision">;
}): boolean {
  if (input.regenerationPolicy.decision === "blocked") {
    return false;
  }

  // Lifecycle can make policy stricter than C6-B alone.
  if (
    input.effectiveLifecycle === "completed" ||
    input.effectiveLifecycle === "knockout_stage"
  ) {
    return false;
  }

  return (
    input.regenerationPolicy.decision === "allowed" ||
    input.regenerationPolicy.decision === "allowedWithConfirmation"
  );
}

/**
 * C6-F composition: group-result mutation remains gated solely by KO presence.
 * Lifecycle never unlocks when knockoutExists.
 */
export function lifecycleGroupResultMutationPolicy(
  facts: Pick<TournamentLifecycleFacts, "knockoutExists">,
): GroupResultLockPolicy {
  return canMutateGroupResults(
    facts.knockoutExists ? [{ phase: "knockout" }] : [],
  );
}

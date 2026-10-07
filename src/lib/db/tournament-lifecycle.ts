/**
 * C6-H D2 — Authoritative server lifecycle snapshot + persist helpers.
 * Not a browser-callable generic lifecycle setter.
 */

import { createClient } from "@/lib/supabase/server";
import { toUserFacingDbError } from "@/lib/db/errors";
import { getAdminTournamentStage } from "@/lib/db/schedule-queries";
import { isGroupStageComplete } from "@/lib/schedule/knockout";
import {
  canTransitionTournamentLifecycle,
  isTournamentCompletionEligible,
  resolveEffectiveTournamentLifecycle,
  TOURNAMENT_LIFECYCLE_STATES,
  type TournamentLifecycleFacts,
  type TournamentLifecycleState,
} from "@/lib/schedule/tournament-lifecycle";

export { isTournamentCompletionEligible };

export type TournamentLifecycleSnapshot = {
  persisted: TournamentLifecycleState;
  facts: TournamentLifecycleFacts;
  effective: TournamentLifecycleState;
  mismatch: boolean;
};

export type LoadTournamentLifecycleSnapshotOptions = {
  /** Include isGroupStageComplete fact (extra stage work already loaded). Default false. */
  includeGroupStageComplete?: boolean;
  /** Include final-winner completionEligible. Default false. */
  includeCompletionEligible?: boolean;
};

function asLifecycleState(value: string | null | undefined): TournamentLifecycleState {
  if (
    value &&
    (TOURNAMENT_LIFECYCLE_STATES as readonly string[]).includes(value)
  ) {
    return value as TournamentLifecycleState;
  }
  return "setup";
}

export async function tournamentHasKnockoutRows(tournamentId: string): Promise<{
  hasKnockout: boolean;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournament_matches")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("phase", "knockout")
    .limit(1);

  if (error) {
    return {
      hasKnockout: false,
      error: toUserFacingDbError("Die K.-o.-Phase konnte nicht geprüft werden.", error),
    };
  }

  return { hasKnockout: (data?.length ?? 0) > 0, error: null };
}

export async function tournamentHasGroups(tournamentId: string): Promise<{
  groupsExist: boolean;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournament_groups")
    .select("id")
    .eq("tournament_id", tournamentId)
    .limit(1);

  if (error) {
    return {
      groupsExist: false,
      error: toUserFacingDbError("Die Gruppen konnten nicht geprüft werden.", error),
    };
  }

  return { groupsExist: (data?.length ?? 0) > 0, error: null };
}

/**
 * Load persisted lifecycle + authoritative facts + effective state.
 * Persisted lifecycle is never trusted alone for safety.
 */
export async function loadTournamentLifecycleSnapshot(
  tournamentId: string,
  options: LoadTournamentLifecycleSnapshotOptions = {},
): Promise<{ snapshot: TournamentLifecycleSnapshot | null; error: string | null }> {
  const supabase = await createClient();
  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, status, lifecycle_state")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tournamentError || !tournament) {
    return {
      snapshot: null,
      error: toUserFacingDbError("Das Turnier wurde nicht gefunden.", tournamentError),
    };
  }

  const needsStage =
    options.includeGroupStageComplete === true ||
    options.includeCompletionEligible === true;

  let groupsExist = false;
  let groupScheduleExists = false;
  let groupStageComplete = false;
  let knockoutExists = false;
  let completionEligible = false;

  if (needsStage) {
    const stage = await getAdminTournamentStage(tournamentId);
    groupsExist = stage.groups.length > 0;
    knockoutExists = stage.matches.some((match) => match.phase === "knockout");
    groupScheduleExists = stage.matches.some(
      (match) => match.phase !== "knockout" && (match.phase == null || match.phase === "group"),
    );
    if (options.includeGroupStageComplete) {
      groupStageComplete = isGroupStageComplete(
        stage.groups,
        stage.memberIdsByGroupId,
        stage.matches,
      ).complete;
    }
    if (options.includeCompletionEligible) {
      completionEligible = isTournamentCompletionEligible(stage.matches);
    }
  } else {
    const [groups, knockout] = await Promise.all([
      tournamentHasGroups(tournamentId),
      tournamentHasKnockoutRows(tournamentId),
    ]);
    if (groups.error) {
      return { snapshot: null, error: groups.error };
    }
    if (knockout.error) {
      return { snapshot: null, error: knockout.error };
    }
    groupsExist = groups.groupsExist;
    knockoutExists = knockout.hasKnockout;
  }

  const facts: TournamentLifecycleFacts = {
    marketingStatusCompleted: tournament.status === "completed",
    groupsExist,
    groupScheduleExists,
    groupStageComplete,
    knockoutExists,
    completionEligible,
  };

  const persisted = asLifecycleState(tournament.lifecycle_state);
  const effective = resolveEffectiveTournamentLifecycle({
    intended: persisted,
    facts,
  });

  return {
    snapshot: {
      persisted,
      facts,
      effective,
      mismatch: persisted !== effective,
    },
    error: null,
  };
}

export async function persistTournamentLifecycleState(
  tournamentId: string,
  state: TournamentLifecycleState,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tournaments")
    .update({ lifecycle_state: state })
    .eq("id", tournamentId);

  if (error) {
    return {
      error: toUserFacingDbError(
        "Der Turnier-Lebenszyklus konnte nicht gespeichert werden.",
        error,
      ),
    };
  }

  return { error: null };
}

/**
 * After successful group create/distribute: promote setup → group_stage when safe.
 * Never overwrites knockout_stage or completed.
 */
export async function syncLifecycleAfterGroupsChanged(
  tournamentId: string,
): Promise<{ error: string | null }> {
  const knockout = await tournamentHasKnockoutRows(tournamentId);
  if (knockout.error) {
    return { error: knockout.error };
  }
  if (knockout.hasKnockout) {
    return { error: null };
  }

  const supabase = await createClient();
  const { data: tournament, error: loadError } = await supabase
    .from("tournaments")
    .select("status, lifecycle_state")
    .eq("id", tournamentId)
    .maybeSingle();

  if (loadError || !tournament) {
    return {
      error: toUserFacingDbError("Das Turnier wurde nicht gefunden.", loadError),
    };
  }

  if (tournament.status === "completed") {
    return { error: null };
  }

  const persisted = asLifecycleState(tournament.lifecycle_state);
  if (persisted === "knockout_stage" || persisted === "completed") {
    return { error: null };
  }

  const groups = await tournamentHasGroups(tournamentId);
  if (groups.error) {
    return { error: groups.error };
  }

  const next: TournamentLifecycleState = groups.groupsExist ? "group_stage" : "setup";
  if (persisted === next) {
    return { error: null };
  }

  return persistTournamentLifecycleState(tournamentId, next);
}

/**
 * After successful KO persistence: confirm KO presence then set knockout_stage.
 * Does not overwrite marketing/lifecycle completed (effective still completed via status).
 */
export async function syncLifecycleAfterKnockoutPersisted(
  tournamentId: string,
): Promise<{ error: string | null }> {
  const knockout = await tournamentHasKnockoutRows(tournamentId);
  if (knockout.error) {
    return { error: knockout.error };
  }
  if (!knockout.hasKnockout) {
    return {
      error:
        "Lifecycle konnte nicht auf K.-o.-Phase gesetzt werden: keine K.-o.-Spiele vorhanden.",
    };
  }

  const supabase = await createClient();
  const { data: tournament, error: loadError } = await supabase
    .from("tournaments")
    .select("status, lifecycle_state")
    .eq("id", tournamentId)
    .maybeSingle();

  if (loadError || !tournament) {
    return {
      error: toUserFacingDbError("Das Turnier wurde nicht gefunden.", loadError),
    };
  }

  if (tournament.status === "completed") {
    return { error: null };
  }

  if (asLifecycleState(tournament.lifecycle_state) === "knockout_stage") {
    return { error: null };
  }

  return persistTournamentLifecycleState(tournamentId, "knockout_stage");
}

/**
 * After successful KO deletion: reread; rewind to group_stage or setup.
 */
export async function syncLifecycleAfterKnockoutRemoved(
  tournamentId: string,
): Promise<{ error: string | null }> {
  const knockout = await tournamentHasKnockoutRows(tournamentId);
  if (knockout.error) {
    return { error: knockout.error };
  }
  if (knockout.hasKnockout) {
    return { error: null };
  }

  const supabase = await createClient();
  const { data: tournament, error: loadError } = await supabase
    .from("tournaments")
    .select("status, lifecycle_state")
    .eq("id", tournamentId)
    .maybeSingle();

  if (loadError || !tournament) {
    return {
      error: toUserFacingDbError("Das Turnier wurde nicht gefunden.", loadError),
    };
  }

  if (tournament.status === "completed") {
    return { error: null };
  }

  const groups = await tournamentHasGroups(tournamentId);
  if (groups.error) {
    return { error: groups.error };
  }

  const next: TournamentLifecycleState = groups.groupsExist ? "group_stage" : "setup";
  if (asLifecycleState(tournament.lifecycle_state) === next) {
    return { error: null };
  }

  return persistTournamentLifecycleState(tournamentId, next);
}

export type ReopenTournamentResult = {
  error: string | null;
  destination: TournamentLifecycleState | null;
};

/**
 * Explicit confirmed reopen. Server derives destination; sets status=active + lifecycle.
 */
export async function planReopenTournamentLifecycle(tournamentId: string): Promise<{
  error: string | null;
  destination: TournamentLifecycleState | null;
  snapshot: TournamentLifecycleSnapshot | null;
}> {
  const loaded = await loadTournamentLifecycleSnapshot(tournamentId, {
    includeCompletionEligible: false,
  });
  if (loaded.error || !loaded.snapshot) {
    return { error: loaded.error, destination: null, snapshot: null };
  }

  const { snapshot } = loaded;
  if (snapshot.effective !== "completed") {
    return {
      error: "Das Turnier ist nicht abgeschlossen und kann nicht wiedereröffnet werden.",
      destination: null,
      snapshot,
    };
  }

  let destination: TournamentLifecycleState | null = null;
  if (snapshot.facts.knockoutExists) {
    destination = "knockout_stage";
  } else if (snapshot.facts.groupsExist) {
    destination = "group_stage";
  } else {
    return {
      error:
        "Wiedereröffnung nicht möglich: weder K.-o.-Spiele noch Gruppen vorhanden.",
      destination: null,
      snapshot,
    };
  }

  const policy = canTransitionTournamentLifecycle({
    from: "completed",
    to: destination,
    facts: {
      ...snapshot.facts,
      // For transition validation, treat reopen as leaving completed marketing fact.
      marketingStatusCompleted: false,
    },
    confirmReopen: true,
  });

  if (!policy.allowed) {
    return {
      error: policy.reason ?? "Wiedereröffnung ist nicht erlaubt.",
      destination: null,
      snapshot,
    };
  }

  return { error: null, destination, snapshot };
}

export { canTransitionTournamentLifecycle, resolveEffectiveTournamentLifecycle };

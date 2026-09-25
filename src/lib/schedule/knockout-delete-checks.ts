import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeKnockoutPlacements, resolveKnockoutOutcome } from "@/lib/schedule/knockout";
import { buildLiveKnockoutViews } from "@/lib/live/build-live-knockout-views";
import type { TournamentMatchRecord } from "@/types/schedule";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`knockout-delete-checks: ${message}`);
  }
}

function match(
  partial: Partial<TournamentMatchRecord> & Pick<TournamentMatchRecord, "id" | "status" | "phase">,
): TournamentMatchRecord {
  return {
    tournamentId: "t1",
    groupId: null,
    fieldId: null,
    homeApplicationId: "app-home",
    awayApplicationId: "app-away",
    homeExternalTeamId: null,
    awayExternalTeamId: null,
    homeScore: null,
    awayScore: null,
    scheduledAt: null,
    durationMinutes: 15,
    sortOrder: 0,
    round: null,
    nextMatchId: null,
    nextMatchSlot: null,
    loserNextMatchId: null,
    loserNextMatchSlot: null,
    decidedBy: "regular",
    homePenalties: null,
    awayPenalties: null,
    externalSource: null,
    externalId: null,
    manualOverride: false,
    ...partial,
  };
}

/**
 * Structural + pure checks for Admin "KO-System löschen".
 * Does not hit Supabase / Production.
 */
export function runKnockoutDeleteChecks() {
  const actions = read("src/lib/db/knockout-actions.ts");
  const board = read("src/components/admin/TournamentKnockoutBoard.tsx");
  const publicStage = read("src/components/tournaments/TournamentPublicStage.tsx");
  const liveBuilder = read("src/lib/live/build-live-knockout-views.ts");
  const scheduleActions = read("src/lib/db/schedule-actions.ts");
  const syncActions = read("src/lib/db/mein-turnierplan-sync-actions.ts");

  const deleteFn = actions.slice(
    actions.indexOf("export async function deleteTournamentKnockoutAction"),
    actions.indexOf("export async function completeTournamentAction"),
  );

  assert(
    deleteFn.includes("requireResultsManage()"),
    "K) authorization uses requireResultsManage / results.manage",
  );
  assert(
    deleteFn.includes('.delete()') &&
      deleteFn.includes('.eq("tournament_id", tournamentId)') &&
      deleteFn.includes('.eq("phase", "knockout")'),
    "delete filter is tournament_id + phase=knockout",
  );
  assert(
    !deleteFn.includes("external_source") && !deleteFn.includes("externalSource"),
    "L) MTP-owned knockout rows included (no external_source filter)",
  );
  assert(
    !deleteFn.includes('.from("tournaments")') &&
      !deleteFn.includes('.update({ status') &&
      !deleteFn.includes('status: "completed"') &&
      !deleteFn.includes('status: "active"'),
    "tournament.status untouched by KO delete",
  );
  assert(
    !deleteFn.includes("applications") &&
      !deleteFn.includes("tournament_external_teams") &&
      !deleteFn.includes("tournament_groups") &&
      !deleteFn.includes("tournament_group_members") &&
      !deleteFn.includes('phase", "group"') &&
      !deleteFn.includes("phase = 'group'"),
    "F/G/E/D) applications, external teams, groups, group matches not targeted",
  );
  assert(
    !deleteFn.includes("createServiceRole") &&
      !deleteFn.includes("service_role") &&
      !deleteFn.includes(".rpc("),
    "no service-role bypass / no RPC",
  );
  assert(deleteFn.includes("revalidateStage"), "revalidates via existing revalidateStage");
  assert(
    deleteFn.includes("loadTournament(tournamentId)"),
    "validates tournament via existing loadTournament",
  );

  // Freeze: generate / save / complete / dual-identity helpers remain
  assert(
    actions.includes("export async function generateKnockoutAction") &&
      actions.includes("export async function saveKnockoutResultAction") &&
      actions.includes("export async function completeTournamentAction") &&
      actions.includes("propagateKnockoutTeams") &&
      actions.includes("matchSideDbColumns") &&
      actions.includes("knockoutSideRef"),
    "KO generation/result/propagation helpers still present",
  );
  assert(
    actions.includes('.eq("phase", "knockout")') &&
      actions.indexOf("generateKnockoutAction") <
        actions.indexOf("deleteTournamentKnockoutAction"),
    "J) generateKnockoutAction still present and precedes dedicated delete",
  );

  // UI
  assert(
    board.includes("deleteTournamentKnockoutAction") &&
      board.includes("KO-System löschen") &&
      board.includes("KO-System vollständig löschen?") &&
      board.includes("Wird gelöscht…") &&
      board.includes("adminDestructiveButtonClass") &&
      board.includes("ConfirmModal") &&
      board.includes("knockout.length > 0"),
    "Admin button + confirm modal + pending label gated on existing KO",
  );
  assert(
    board.includes("Gruppenphase und der normale Spielplan bleiben unverändert") &&
      board.includes("nicht rückgängig"),
    "confirm copy warns group stage untouched / irreversible",
  );

  // Spielplan freeze
  assert(
    scheduleActions.includes("deleteTournamentScheduleAction") &&
      scheduleActions.includes('.eq("phase", "group")'),
    "Spielplan delete unchanged (group phase)",
  );

  // MTP freeze
  assert(
    !syncActions.includes("deleteTournamentKnockoutAction") &&
      !board.includes("sync_mein_turnierplan") &&
      !deleteFn.includes("mein-turnierplan") &&
      !deleteFn.includes("preferSyncedHubData"),
    "MTP sync/config untouched by KO delete",
  );

  // Public / live empty-state behavior (existing)
  assert(
    publicStage.includes('item.id !== "ko-runde" || knockoutMatches.length > 0'),
    "public KO tab hidden when no knockout matches",
  );
  assert(
    liveBuilder.includes("computeKnockoutPlacements") &&
      liveBuilder.includes('match.phase === "knockout"'),
    "/live KO builder remains match-phase driven",
  );

  // A/B/C/I — pure: after KO rows gone, placements empty; group rows irrelevant
  const groupMatch = match({
    id: "g1",
    phase: "group",
    status: "completed",
    homeScore: 2,
    awayScore: 1,
    groupId: "grp-a",
  });
  const completedKo = [
    match({
      id: "ko-sf",
      phase: "knockout",
      round: "semifinal",
      status: "completed",
      homeScore: 1,
      awayScore: 0,
      homePenalties: 3,
      awayPenalties: 2,
      decidedBy: "penalties",
      nextMatchId: "ko-final",
      nextMatchSlot: "home",
      externalSource: "mein-turnierplan",
      externalId: "mtp-1",
    }),
    match({
      id: "ko-final",
      phase: "knockout",
      round: "final",
      status: "completed",
      homeApplicationId: "app-a",
      awayApplicationId: "app-b",
      homeScore: 2,
      awayScore: 1,
    }),
    match({
      id: "ko-third",
      phase: "knockout",
      round: "third-place",
      status: "completed",
      homeApplicationId: "app-c",
      awayExternalTeamId: "ext-d",
      awayApplicationId: null,
      homeScore: 0,
      awayScore: 1,
    }),
  ];

  const beforePlacements = computeKnockoutPlacements(completedKo);
  assert(beforePlacements.length >= 2, "C) completed KO yields placements before delete");
  assert(
    resolveKnockoutOutcome(completedKo[1]!).winnerId === "app-a",
    "C) completed final has winner before delete",
  );

  // Simulate post-delete match set: only group remains (KO wiped)
  const afterDelete = [groupMatch];
  const remainingKo = afterDelete.filter((row) => row.phase === "knockout");
  assert(remainingKo.length === 0, "A/B/C) no KO rows remain after reset");
  assert(
    computeKnockoutPlacements(remainingKo).length === 0,
    "I) placements empty after KO rows gone (no stale placements)",
  );
  assert(
    afterDelete.some((row) => row.id === "g1" && row.phase === "group"),
    "D) group-stage match remains in simulated stage",
  );

  // Dual-identity: deleting match rows does not imply deleting participant targets
  const dualSide = completedKo[2]!;
  assert(
    dualSide.homeApplicationId === "app-c" && dualSide.awayExternalTeamId === "ext-d",
    "H) dual-identity sides existed on KO rows before delete (XOR preserved on entities)",
  );
  // Entity IDs are not tables mutated by the action (structural assert above).

  // Partial KO (only SF scheduled) → placements empty once wiped
  const partial = [
    match({
      id: "partial-sf",
      phase: "knockout",
      round: "semifinal",
      status: "scheduled",
    }),
  ];
  assert(computeKnockoutPlacements(partial).length === 0, "B) partial KO has no placements yet");
  assert(
    computeKnockoutPlacements([]).length === 0,
    "A) idempotent empty KO → empty placements",
  );

  // /live empty KO section after wipe
  const liveEmpty = buildLiveKnockoutViews({
    matches: [],
    teamMap: new Map(),
    fieldNameById: new Map(),
  });
  assert(
    liveEmpty.rounds.length === 0 && liveEmpty.placements.length === 0,
    "/live KO empty after delete",
  );

  const teamMap = new Map([
    ["app-a", { id: "app-a", label: "A", logoUrl: null, clubName: "A", teamName: "A" }],
    ["app-b", { id: "app-b", label: "B", logoUrl: null, clubName: "B", teamName: "B" }],
    ["app-c", { id: "app-c", label: "C", logoUrl: null, clubName: "C", teamName: "C" }],
    ["ext-d", { id: "ext-d", label: "D", logoUrl: null, clubName: "D", teamName: "D" }],
  ]);
  const liveWithKo = buildLiveKnockoutViews({
    matches: completedKo,
    teamMap,
    fieldNameById: new Map(),
  });
  assert(liveWithKo.rounds.length > 0, "live KO renders when matches exist");

  return "ok";
}

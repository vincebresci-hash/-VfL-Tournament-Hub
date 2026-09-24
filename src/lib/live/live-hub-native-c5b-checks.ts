import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildLiveKnockoutViews } from "@/lib/live/build-live-knockout-views";
import type { LiveTeamRef } from "@/lib/db/live-queries";
import type { TournamentMatchRecord } from "@/types/schedule";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`live-hub-native-c5b-checks: ${message}`);
  }
}

function match(
  partial: Partial<TournamentMatchRecord> & Pick<TournamentMatchRecord, "id" | "status">,
): TournamentMatchRecord {
  return {
    tournamentId: "t1",
    groupId: null,
    fieldId: null,
    homeApplicationId: "a",
    awayApplicationId: "b",
    homeExternalTeamId: null,
    awayExternalTeamId: null,
    homeScore: null,
    awayScore: null,
    scheduledAt: null,
    durationMinutes: 15,
    phase: "group",
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
 * Structural + unit checks for C5B Hub-native /live.
 */
export function runLiveHubNativeC5BChecks() {
  const livePage = read("src/app/live/page.tsx");
  const liveView = read("src/components/live/LivePageView.tsx");
  const liveQueries = read("src/lib/db/live-queries.ts");
  const autoRefresh = read("src/components/live/LiveAutoRefresh.tsx");
  const knockoutBuilder = read("src/lib/live/build-live-knockout-views.ts");
  const syncActions = read("src/lib/db/mein-turnierplan-sync-actions.ts");

  assert(
    livePage.includes('export const dynamic = "force-dynamic"') &&
      livePage.includes("getLivePageData") &&
      livePage.includes("LivePageView"),
    "/live remains force-dynamic Hub page",
  );

  assert(
    liveQueries.includes("getPublicTournamentStage") &&
      liveQueries.includes("computeGroupStandings") &&
      liveQueries.includes("buildLiveKnockoutViews") &&
      !liveQueries.includes("getPublicMeinTurnierplanData") &&
      !liveQueries.includes("preferSyncedHubData") &&
      !liveQueries.includes("sync_mein_turnierplan") &&
      !liveQueries.includes(".slice(0, 4)"),
    "live-queries is Hub-only, full standings, no MTP import/sync",
  );

  assert(
    liveView.includes("LiveAutoRefresh") &&
      liveView.includes("TournamentKnockoutRounds") &&
      liveView.includes("knockoutRounds") &&
      liveView.includes("Hub-Live") &&
      !liveView.includes("Live-Daten via MeinTurnierplan") &&
      !liveView.includes("formatUpdatedAgo") &&
      !liveView.includes("meinTurnierplanLastSyncedAt"),
    "LivePageView is Hub-native with refresh + KO reuse",
  );

  assert(
    autoRefresh.includes("router.refresh") &&
      autoRefresh.includes("30_000") &&
      !autoRefresh.includes("createClient") &&
      !autoRefresh.includes(".channel(") &&
      !autoRefresh.includes("sync_mein_turnierplan"),
    "LiveAutoRefresh uses lightweight router.refresh only",
  );

  assert(
    knockoutBuilder.includes("buildLiveKnockoutViews") &&
      knockoutBuilder.includes("computeKnockoutPlacements") &&
      knockoutBuilder.includes("TournamentKnockoutRounds"),
    "KO builder reuses Hub knockout helpers / presenter types",
  );

  assert(
    syncActions.includes("sync_mein_turnierplan_tournament") &&
      !livePage.includes("sync_mein_turnierplan") &&
      !liveView.includes("sync_mein_turnierplan") &&
      !liveQueries.includes("sync_mein_turnierplan") &&
      !autoRefresh.includes("sync_mein_turnierplan"),
    "/live does not call or wire MTP sync",
  );

  const teamMap = new Map<string, LiveTeamRef>([
    [
      "a",
      {
        id: "a",
        label: "Team A",
        clubName: "Club A",
        teamName: "A",
        logoUrl: null,
      },
    ],
    [
      "b",
      {
        id: "b",
        label: "Team B",
        clubName: "Club B",
        teamName: "B",
        logoUrl: null,
      },
    ],
  ]);

  const emptyKo = buildLiveKnockoutViews({
    matches: [match({ id: "g1", status: "scheduled", phase: "group" })],
    teamMap,
    fieldNameById: new Map(),
  });
  assert(emptyKo.rounds.length === 0 && emptyKo.placements.length === 0, "no KO without knockout matches");

  const withFinal = buildLiveKnockoutViews({
    matches: [
      match({
        id: "f1",
        status: "completed",
        phase: "knockout",
        round: "final",
        scheduledAt: "2026-07-04T16:00:00.000Z",
        fieldId: "field-1",
        homeScore: 2,
        awayScore: 1,
      }),
    ],
    teamMap,
    fieldNameById: new Map([["field-1", "Hauptfeld"]]),
  });
  assert(withFinal.rounds.length === 1, "final round present");
  assert(withFinal.rounds[0]?.title.includes("Finale") || withFinal.rounds[0]?.id === "final", "final labeled");
  assert(withFinal.rounds[0]?.matches[0]?.resultText.includes("2:1"), "final score text");
  assert(withFinal.rounds[0]?.matches[0]?.meta.includes("Hauptfeld"), "field in KO meta");

  return "ok";
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveGruppenTab,
  resolveSpielplanTab,
  resolveTabelleTab,
  resolveTeilnehmerTab,
} from "@/lib/mein-turnierplan-public-source";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`mein-turnierplan-b1b1-hub-public-tabs-checks: ${message}`);
  }
}

/**
 * B1-B1: Normal public competition tabs are Hub-authoritative.
 * LIVE/presentation mode must not change competition-tab data.
 * Historical Hub-table pollution is unresolved by design (B1-B3).
 *
 * Limitation: does NOT claim stage.* contains only pristine Hub-native rows;
 * historical MTP-imported rows may already exist inside Hub tables.
 */
export function runMeinTurnierplanB1B1HubPublicTabsChecks() {
  const page = read("src/app/turniere/[slug]/page.tsx");
  const stage = read("src/components/tournaments/TournamentPublicStage.tsx");
  const publicSource = read("src/lib/mein-turnierplan-public-source.ts");
  const liveSection = read("src/components/tournaments/MeinTurnierplanLiveSection.tsx");
  const livePage = read("src/app/live/page.tsx");
  const liveQueries = read("src/lib/db/live-queries.ts");
  const syncActions = read("src/lib/db/mein-turnierplan-sync-actions.ts");
  const mtpActions = read("src/lib/db/mein-turnierplan-actions.ts");
  const sourceHint = read("src/components/tournaments/MeinTurnierplanSourceHint.tsx");

  // A–H: resolver authority — no live_data_source / preferSynced / MTP JSON branching
  const authorityCases = [
    resolveTeilnehmerTab(),
    resolveGruppenTab(),
    resolveSpielplanTab(),
    resolveTabelleTab(),
  ];
  for (const resolution of authorityCases) {
    assert(resolution.source === "hub", "A–H) competition tabs always resolve to hub");
    assert(
      !resolution.showMeinTurnierplanHint,
      "A–H) no MTP source hint on competition tabs",
    );
  }

  assert(
    publicSource.includes("B1-B1") &&
      publicSource.includes("HUB_ONLY_TAB") &&
      !publicSource.includes('source: "mein-turnierplan"') &&
      !/if \(input\.preferSyncedHub/.test(publicSource) &&
      !publicSource.includes("input.mtp.matchesWidgetUrl") &&
      !publicSource.includes("input.mtp.tableWidgetUrl") &&
      !publicSource.includes("input.mtp.available") &&
      !publicSource.includes("input.mtp.participants") &&
      !publicSource.includes("input.mtp.groups") &&
      !publicSource.includes("preferSyncedHub?:") &&
      !publicSource.includes("hubRosterCount"),
    "resolvers are Hub-only; MTP JSON/widgets/preferSynced removed from authority",
  );

  // Stage: competition tabs render Hub stage.* only
  assert(
    stage.includes("<TournamentParticipantCards roster={stage.roster} />") &&
      !stage.includes("mtp.participants") &&
      !stage.includes("resolveTeilnehmerTab") &&
      !stage.includes("MeinTurnierplanSourceHint") &&
      stage.includes("Noch keine bestätigten Teams."),
    "Teilnehmer tab is Hub roster only",
  );
  assert(
    stage.includes('source="hub"') &&
      stage.includes("stage.groups.map((group)") &&
      stage.includes("stage.roster.filter((entry) => entry.groupId === group.id)") &&
      !stage.includes("mtp.groups") &&
      !stage.includes("resolveGruppenTab") &&
      stage.includes("Noch keine Gruppen veröffentlicht."),
    "Gruppen tab is Hub groups/roster only",
  );
  assert(
    stage.includes("<TournamentScheduleCards") &&
      stage.includes("matches={stage.matches}") &&
      !stage.includes('iframeId="widgetMatches"') &&
      !stage.includes('spielplanTab.source === "mein-turnierplan"') &&
      !stage.includes("resolveSpielplanTab") &&
      !stage.includes("<MeinTurnierplanWidget"),
    "Spielplan tab is Hub matches only (no MTP widget on competition tab)",
  );
  assert(
    stage.includes("<TournamentStandingsSection") &&
      stage.includes("computeGroupStandings") &&
      !stage.includes('iframeId="widgetTable"') &&
      !stage.includes('tabelleTab.source === "mein-turnierplan"') &&
      !stage.includes("resolveTabelleTab") &&
      stage.includes("Die Tabelle ist aktuell nicht verfügbar."),
    "Tabelle tab is Hub standings only (no MTP widget on competition tab)",
  );
  assert(
    stage.includes("TournamentKnockoutRounds") &&
      stage.includes("computeKnockoutPlacements") &&
      stage.includes("<PublicPlacements") &&
      !stage.includes("external_source") &&
      !stage.includes("mein-turnierplan"),
    "KO + Platzierungen remain Hub-stage; no ownership filters",
  );

  // preferSyncedHubData / last_synced_at / live_data_source not competition authority
  assert(
    !page.includes("preferSyncedHubData") &&
      !page.includes("meinTurnierplanLastSyncedAt") &&
      !page.includes("getPublicMeinTurnierplanData") &&
      !page.includes("meinTurnierplanPublic") &&
      !page.includes("meinTurnierplanPrimary") &&
      !page.includes("meinTurnierplanHybrid") &&
      !stage.includes("preferSyncedHubData") &&
      !stage.includes("meinTurnierplanPrimary") &&
      !stage.includes("meinTurnierplanHybrid") &&
      !stage.includes("meinTurnierplanPublic"),
    "preferSyncedHub / last_synced_at / MTP JSON / live_data_source removed from competition wiring",
  );

  // I–J: Tournament Center LIVE + widgets intact
  assert(
    stage.includes("<MeinTurnierplanLiveSection") &&
      stage.includes('current === "live"') &&
      stage.includes("showLiveTab") &&
      page.includes("livePresentation") &&
      page.includes("showsMeinTurnierplanLiveTab") &&
      page.includes("matchesWidgetUrl: tournament.meinTurnierplanMatchesWidgetUrl") &&
      page.includes("tableWidgetUrl: tournament.meinTurnierplanTableWidgetUrl") &&
      liveSection.includes('iframeId="widgetMatches"') &&
      liveSection.includes('iframeId="widgetTable"') &&
      liveSection.includes("<MeinTurnierplanWidget") &&
      liveSection.includes("<MeinTurnierplanPublicButton") &&
      liveSection.includes("Bereitgestellt über MeinTurnierplan") &&
      liveSection.includes("Aktuelle Spielinformationen werden über MeinTurnierplan bereitgestellt."),
    "I–J) Tournament Center MTP LIVE / widgets / CTA / attribution intact",
  );

  // K: /live Hub-native
  assert(
    livePage.includes("getLivePageData") &&
      livePage.includes("LivePageView") &&
      !liveQueries.includes("getPublicMeinTurnierplanData") &&
      !liveQueries.includes("preferSyncedHubData"),
    "K) /live remains Hub-native",
  );

  // M: B1-A write blocks remain
  const confirmFnStart = syncActions.indexOf(
    "export async function confirmMeinTurnierplanSyncAction",
  );
  const confirmFnEnd = syncActions.indexOf(
    "export async function getMeinTurnierplanSyncStatusAction",
    confirmFnStart + 1,
  );
  const confirmFn = syncActions.slice(confirmFnStart, confirmFnEnd);
  assert(
    confirmFn.includes("MEIN_TURNIERPLAN_COMPETITION_SYNC_DISABLED_MESSAGE") &&
      !confirmFn.includes(".rpc(") &&
      mtpActions.includes("importMeinTurnierplanGroupsAction") &&
      mtpActions.includes("MEIN_TURNIERPLAN_COMPETITION_IMPORT_DISABLED_MESSAGE"),
    "M) B1-A confirm sync + legacy import blocks intact",
  );

  // Public copy: competition Hub; LIVE may mention MTP
  assert(
    stage.includes(
      "Teilnehmer, Gruppen, Spielplan, Tabelle und KO stammen aus dem VfL Tournament",
    ) &&
      stage.includes(
        "Aktuelle Live-Informationen können zusätzlich über MeinTurnierPlan",
      ) &&
      !stage.includes("Hybrid") &&
      !stage.includes("Daten bereitgestellt über MeinTurnierplan") &&
      !stage.includes("Teilnehmer konnten aktuell nicht von MeinTurnierplan") &&
      !stage.includes("Gruppen konnten aktuell nicht von MeinTurnierplan") &&
      sourceHint.includes("Daten bereitgestellt über MeinTurnierplan"),
    "public competition copy is Hub-authoritative; SourceHint unused on stage",
  );

  // No historical ownership filter / cleanup
  assert(
    !stage.includes("external_source") &&
      !page.includes("external_source != ") &&
      !publicSource.includes("external_source"),
    "no historical ownership filter added",
  );

  // Document residual limitation in checks themselves
  assert(
    publicSource.includes("Historical pollution") ||
      publicSource.includes("historical") ||
      stage.includes("Historical MTP-imported rows") ||
      stage.includes("known residual"),
    "known historical pollution documented as unresolved",
  );

  return "ok";
}

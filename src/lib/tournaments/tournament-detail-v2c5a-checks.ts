import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`tournament-detail-v2c5a-checks: ${message}`);
  }
}

/**
 * Structural checks for Tournament Detail V2-C5A
 * (Live / MeinTurnierplan presentation only).
 */
export function runTournamentDetailV2C5AChecks() {
  const liveSection = read("src/components/tournaments/MeinTurnierplanLiveSection.tsx");
  const liveWidget = read("src/components/tournaments/MeinTurnierplanWidget.tsx");
  const liveRender = read("src/lib/mein-turnierplan-live-render.ts");
  const mtp = read("src/lib/mein-turnierplan.ts");
  const publicSource = read("src/lib/mein-turnierplan-public-source.ts");
  const stage = read("src/components/tournaments/TournamentPublicStage.tsx");
  const page = read("src/app/turniere/[slug]/page.tsx");
  const livePage = read("src/app/live/page.tsx");
  const livePageView = read("src/components/live/LivePageView.tsx");
  const liveQueries = read("src/lib/db/live-queries.ts");
  const syncActions = read("src/lib/db/mein-turnierplan-sync-actions.ts");

  assert(
    liveSection.includes('id="live-mtp-heading"') &&
      liveSection.includes("Live / MeinTurnierplan") &&
      liveSection.includes("Aktuelle Spielinformationen werden über MeinTurnierplan bereitgestellt.") &&
      liveSection.includes("Bereitgestellt über MeinTurnierplan") &&
      liveSection.includes('data-live-section="combined"') &&
      liveSection.includes("min-w-0") &&
      liveSection.includes("max-w-full") &&
      liveSection.includes("rounded-[10px]") &&
      liveSection.includes("border border-line") &&
      liveSection.includes("bg-white") &&
      liveSection.includes("shadow-[0_1px_2px_rgba(16,20,28,0.04)]"),
    "Live section heading, copy, attribution, and V2 card chrome present",
  );

  assert(
    liveSection.includes("resolvePublicMatchesWidgetUrl(tournamentFields)") &&
      liveSection.includes("resolvePublicTableWidgetUrl(tournamentFields)") &&
      liveSection.includes('data-widget-url-present="matches"') &&
      liveSection.includes('data-widget-url-present="table"') &&
      liveSection.includes('title="MeinTurnierplan Spielplan"') &&
      liveSection.includes('iframeId="widgetMatches"') &&
      liveSection.includes('iframeId="widgetTable"') &&
      liveSection.includes("title={`MeinTurnierplan Tabelle für ${tournamentName}`}") &&
      liveSection.includes("{!hasWidgets && presentationUrl ? (") &&
      liveSection.includes("<MeinTurnierplanPublicButton") &&
      liveSection.includes("{!hasWidgets && !presentationUrl ? (") &&
      liveSection.includes(
        "Für diesen Bereich ist noch keine MeinTurnierplan-Widget-URL hinterlegt.",
      ) &&
      liveSection.includes("{publicLiveNote ? (") &&
      liveSection.includes("{publicLiveNote}") &&
      !liveSection.includes("puls") &&
      !liveSection.includes("animate-") &&
      !liveSection.includes("LIVE"),
    "matches-only / table-only / both / presentation / missing-URL / publicLiveNote branches preserved",
  );

  assert(
    liveWidget.includes("meinTurnierplanIframeSrc(url)") &&
      liveWidget.includes("const iframeSrc = meinTurnierplanIframeSrc(url)") &&
      liveWidget.includes("height = 727") &&
      liveWidget.includes('loading="lazy"') &&
      liveWidget.includes('referrerPolicy="strict-origin-when-cross-origin"') &&
      liveWidget.includes("title={title}") &&
      liveWidget.includes("src={iframeSrc}") &&
      liveWidget.includes('data-mtp-widget-state="iframe"') &&
      liveWidget.includes("data-mtp-widget-src={iframeSrc}") &&
      liveWidget.includes("min-w-0") &&
      liveWidget.includes("max-w-full") &&
      liveWidget.includes("overflow-hidden") &&
      liveWidget.includes("rounded-[8px]") &&
      !liveWidget.includes("sandbox") &&
      !liveWidget.includes("postMessage") &&
      !liveWidget.includes("contentDocument") &&
      !liveWidget.includes("contentWindow"),
    "iframe src/title/loading/referrerPolicy preserved; presentation wrapper only",
  );

  assert(
    liveRender.includes("export function resolvePublicMatchesWidgetUrl") &&
      liveRender.includes("export function resolvePublicTableWidgetUrl") &&
      liveRender.includes("export function meinTurnierplanIframeSrc") &&
      mtp.includes("export function showsMeinTurnierplanLiveTab") &&
      mtp.includes("export function usesMeinTurnierplanAsPrimaryLive") &&
      page.includes("preferSyncedHubData={Boolean(") &&
      page.includes("tournament.meinTurnierplanLastSyncedAt") &&
      publicSource.includes("export function resolveSpielplanTab") &&
      publicSource.includes("export function resolveTabelleTab") &&
      stage.includes("<MeinTurnierplanLiveSection") &&
      stage.includes("matchesWidgetUrl={livePresentation.matchesWidgetUrl}") &&
      stage.includes("tableWidgetUrl={livePresentation.tableWidgetUrl}") &&
      stage.includes("publicLiveNote={livePresentation.publicLiveNote}"),
    "MTP resolvers, Live visibility, and stage wiring untouched",
  );

  assert(
    livePage.includes('from "@/components/live/LivePageView"') &&
      livePage.includes("getLivePageData") &&
      livePageView.includes("export function LivePageView") &&
      liveQueries.includes("export async function getLivePageData") &&
      !liveSection.includes("LivePageView") &&
      !liveWidget.includes("getLivePageData"),
    "/live route and LivePageView remain separate",
  );

  assert(
    syncActions.includes("sync_mein_turnierplan_tournament") &&
      !liveSection.includes("sync_mein_turnierplan") &&
      !liveWidget.includes("sync_mein_turnierplan") &&
      !liveSection.includes("createClient") &&
      !liveWidget.includes("createClient"),
    "no sync or data-layer coupling in presentation files",
  );

  assert(
    !liveSection.includes("resolveSpielplanTab") &&
      !liveSection.includes("resolveTabelleTab") &&
      !liveSection.includes("preferSyncedHub") &&
      !liveWidget.includes("resolvePublicMatchesWidgetUrl") &&
      !liveWidget.includes("resolvePublicTableWidgetUrl"),
    "presentation files do not reimplement source precedence",
  );

  return "ok";
}

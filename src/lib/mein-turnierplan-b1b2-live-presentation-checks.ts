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
    throw new Error(`mein-turnierplan-b1b2-live-presentation-checks: ${message}`);
  }
}

function sliceAround(source: string, marker: string, radius = 900) {
  const index = source.indexOf(marker);
  assert(index >= 0, `marker not found: ${marker}`);
  return source.slice(Math.max(0, index - radius), index + radius);
}

/**
 * B1-B2: Admin Live-presentation terminology only.
 * No functional runtime, DB, RPC, or public-authority change.
 */
export function runMeinTurnierplanB1B2LivePresentationChecks() {
  const adminForm = read("src/components/admin/TournamentAdminForm.tsx");
  const mtpPanel = read("src/components/admin/MeinTurnierplanAdminPanel.tsx");
  const syncPanel = read("src/components/admin/TournamentSyncAdminPanel.tsx");
  const mtpLib = read("src/lib/mein-turnierplan.ts");
  const syncActions = read("src/lib/db/mein-turnierplan-sync-actions.ts");
  const mtpActions = read("src/lib/db/mein-turnierplan-actions.ts");
  const publicSource = read("src/lib/mein-turnierplan-public-source.ts");
  const publicPage = read("src/app/turniere/[slug]/page.tsx");
  const stage = read("src/components/tournaments/TournamentPublicStage.tsx");
  const liveSection = read("src/components/tournaments/MeinTurnierplanLiveSection.tsx");
  const livePage = read("src/app/live/page.tsx");
  const b1aChecks = read("src/lib/mein-turnierplan-b1a-disable-sync-checks.ts");
  const b1b1Checks = read("src/lib/mein-turnierplan-b1b1-hub-public-tabs-checks.ts");
  const runChecksCli = read("src/lib/schedule/run-checks-cli.ts");

  const liveSourceField = sliceAround(adminForm, 'id="tournament-mtp-source"');
  const panelLiveField = sliceAround(mtpPanel, "liveDataSourceLabels");

  // A) Admin form uses Live-Darstellung for live_data_source UI
  assert(
    liveSourceField.includes('label="Live-Darstellung"') &&
      liveSourceField.includes("liveDataSource") &&
      liveSourceField.includes('value={values.liveDataSource}'),
    "A) Admin form Live-Darstellung label wired to liveDataSource",
  );

  // B) Misleading Datenquelle label absent from MTP live_data_source Admin UI
  assert(
    !liveSourceField.includes('label="Datenquelle"') &&
      !mtpPanel.includes('label="Datenquelle"') &&
      !adminForm.includes('label="Datenquelle"'),
    "B) Datenquelle absent from MTP live_data_source Admin field/panel",
  );

  // C) User-facing option semantics
  assert(
    liveSourceField.includes('<option value="hub">Nur Hub</option>') &&
      liveSourceField.includes(
        '<option value="mein-turnierplan">MeinTurnierplan Live</option>',
      ) &&
      liveSourceField.includes(
        '<option value="hybrid">Hub + MeinTurnierplan Live</option>',
      ),
    "C) Admin form option labels use Live-presentation semantics",
  );
  assert(
    panelLiveField.includes('hub: "Nur Hub"') &&
      panelLiveField.includes('"mein-turnierplan": "MeinTurnierplan Live"') &&
      panelLiveField.includes('hybrid: "Hub + MeinTurnierplan Live"') &&
      mtpPanel.includes('label="Live-Darstellung"'),
    "C) Detail panel live_data_source labels match Live-presentation semantics",
  );

  // D) Internal stored values unchanged
  assert(
    mtpLib.includes('export const LIVE_DATA_SOURCES = ["hub", "mein-turnierplan", "hybrid"]') &&
      liveSourceField.includes('value="hub"') &&
      liveSourceField.includes('value="mein-turnierplan"') &&
      liveSourceField.includes('value="hybrid"'),
    "D) Stored live_data_source values remain hub | mein-turnierplan | hybrid",
  );

  // E) liveDataSource / live_data_source wiring intact
  assert(
    adminForm.includes("liveDataSource") &&
      mtpLib.includes("showsMeinTurnierplanLiveTab") &&
      mtpLib.includes("asLiveDataSource") &&
      mtpPanel.includes("asLiveDataSource(tournament.liveDataSource)"),
    "E) liveDataSource / live_data_source wiring remains intact",
  );

  // F) Explanatory copy: Hub = competition data; MTP = optional Live/presentation
  assert(
    liveSourceField.includes(
      "Turnierdaten wie Teilnehmer, Gruppen, Spielplan, Ergebnisse und KO werden im VfL Tournament Hub verwaltet",
    ) &&
      liveSourceField.includes(
        "optionale Live-Darstellung über MeinTurnierplan",
      ),
    "F) Admin form help states Hub manages competition data; MTP is optional Live",
  );
  assert(
    mtpPanel.includes("Die Turnierdaten werden im VfL Tournament Hub verwaltet") &&
      mtpPanel.includes("optionale Live-Darstellung"),
    "F) Detail panel explains Hub competition + optional MTP Live",
  );

  // G) Sync panel Turnier-ID label (not Quelle / Turnier-ID)
  assert(
    syncPanel.includes('label="Turnier-ID"') &&
      !syncPanel.includes('label="Quelle / Turnier-ID"') &&
      syncPanel.includes("meinTurnierplanTournamentId"),
    "G) Sync panel uses Turnier-ID instead of Quelle / Turnier-ID",
  );

  // H) B1-A write blocks remain present
  assert(
    syncActions.includes("MEIN_TURNIERPLAN_COMPETITION_SYNC_DISABLED_MESSAGE") &&
      mtpActions.includes("MEIN_TURNIERPLAN_COMPETITION_IMPORT_DISABLED_MESSAGE") &&
      !syncPanel.includes("Vorschau laden") &&
      !syncPanel.includes("Synchronisation bestätigen") &&
      !syncPanel.includes("Jetzt synchronisieren") &&
      syncPanel.includes("Verbindung prüfen") &&
      b1aChecks.includes("runMeinTurnierplanB1ADisableSyncChecks"),
    "H) B1-A sync/import write blocks and connection-check retention remain",
  );

  // I) B1-B1 public authority remains Hub-only
  const authority = [
    resolveTeilnehmerTab(),
    resolveGruppenTab(),
    resolveSpielplanTab(),
    resolveTabelleTab(),
  ];
  for (const resolution of authority) {
    assert(resolution.source === "hub", "I) competition tabs resolve to hub");
  }
  assert(
    publicSource.includes("HUB_ONLY_TAB") &&
      !publicPage.includes("getPublicMeinTurnierplanData") &&
      !publicPage.includes("preferSyncedHubData") &&
      stage.includes('source="hub"') &&
      liveSection.includes("MeinTurnierplanLiveSection") &&
      livePage.includes("live") &&
      b1b1Checks.includes("runMeinTurnierplanB1B1HubPublicTabsChecks"),
    "I) B1-B1 Hub-only public competition authority + MTP Live presentation retained",
  );

  // J) No public runtime file needs B1-B2 Admin terminology
  assert(
    !publicPage.includes("Live-Darstellung") &&
      !stage.includes("Live-Darstellung") &&
      !liveSection.includes("Live-Darstellung") &&
      !livePage.includes("Live-Darstellung") &&
      !publicSource.includes("Live-Darstellung") &&
      !publicPage.includes("Nur Hub") &&
      !stage.includes("MeinTurnierplan Live"),
    "J) Public runtime files do not carry B1-B2 Admin Live-Darstellung copy",
  );

  // K) No migration / RPC / RLS / RBAC change introduced by B1-B2 suite scope
  assert(
    !runChecksCli.includes("supabase/migrations") &&
      syncActions.includes("confirmMeinTurnierplanSyncAction") &&
      mtpLib.includes("LIVE_DATA_SOURCES") &&
      !adminForm.includes("sync_mein_turnierplan_tournament") &&
      !mtpPanel.includes(".rpc(") &&
      !syncPanel.includes(".rpc("),
    "K) B1-B2 stays Admin-copy scoped; no migration/RPC surface introduced in Admin UI",
  );

  // Enable toggle + Tournament-ID connection copy preserved
  assert(
    adminForm.includes("MeinTurnierplan verwenden") &&
      adminForm.includes("meinTurnierplanEnabled") &&
      adminForm.includes(
        "für die Verbindung und optionale öffentliche Darstellung",
      ),
    "Enable toggle and Tournament-ID connection semantics preserved",
  );

  assert(
    runChecksCli.includes("runMeinTurnierplanB1B2LivePresentationChecks") &&
      runChecksCli.includes("mein-turnierplan-b1b2-live-presentation-checks"),
    "B1-B2 suite is wired into run-checks-cli",
  );

  return "ok";
}

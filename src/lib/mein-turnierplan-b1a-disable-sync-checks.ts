import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`mein-turnierplan-b1a-disable-sync-checks: ${message}`);
  }
}

function sliceExport(source: string, exportName: string, nextExportName?: string) {
  const start = source.indexOf(`export async function ${exportName}`);
  assert(start >= 0, `export ${exportName} not found`);
  const end = nextExportName
    ? source.indexOf(`export async function ${nextExportName}`, start + 1)
    : source.length;
  assert(end > start, `end boundary for ${exportName} not found`);
  return source.slice(start, end);
}

/**
 * B1-A structural checks.
 * Does not execute MTP sync/import or Supabase writes.
 */
export function runMeinTurnierplanB1ADisableSyncChecks() {
  const syncActions = read("src/lib/db/mein-turnierplan-sync-actions.ts");
  const mtpActions = read("src/lib/db/mein-turnierplan-actions.ts");
  const syncPanel = read("src/components/admin/TournamentSyncAdminPanel.tsx");
  const mtpPanel = read("src/components/admin/MeinTurnierplanAdminPanel.tsx");
  const mtpTools = read("src/components/admin/MeinTurnierplanAdminTools.tsx");
  const adminForm = read("src/components/admin/TournamentAdminForm.tsx");
  const publicPage = read("src/app/turniere/[slug]/page.tsx");
  const publicSource = read("src/lib/mein-turnierplan-public-source.ts");
  const publicData = read("src/lib/mein-turnierplan-public-data.ts");
  const mtpLib = read("src/lib/mein-turnierplan.ts");
  const liveSection = read("src/components/tournaments/MeinTurnierplanLiveSection.tsx");
  const livePage = read("src/app/live/page.tsx");
  const liveQueries = read("src/lib/db/live-queries.ts");
  const rpcMigration = read(
    "supabase/migrations/20260831220000_rbac_security_definer_hardening.sql",
  );
  const api = read("src/lib/mein-turnierplan-api.ts");

  const confirmFn = sliceExport(
    syncActions,
    "confirmMeinTurnierplanSyncAction",
    "getMeinTurnierplanSyncStatusAction",
  );
  const previewFn = sliceExport(
    syncActions,
    "previewMeinTurnierplanSyncAction",
    "confirmMeinTurnierplanSyncAction",
  );
  const importFn = sliceExport(mtpActions, "importMeinTurnierplanGroupsAction");

  // A) confirm sync cannot reach RPC
  assert(
    !confirmFn.includes(".rpc(") &&
      !confirmFn.includes("buildMeinTurnierplanSyncRpcPayload") &&
      !confirmFn.includes('rpc("sync_mein_turnierplan_tournament"'),
    "A) confirmMeinTurnierplanSyncAction does not call sync RPC",
  );

  // B) confirm sync cannot perform post-RPC logo writes
  assert(
    !confirmFn.includes("applyMeinTurnierplanTeamLogosAfterSync"),
    "B) confirm does not call applyMeinTurnierplanTeamLogosAfterSync",
  );

  assert(
    confirmFn.includes("MEIN_TURNIERPLAN_COMPETITION_SYNC_DISABLED_MESSAGE") &&
      confirmFn.includes("error: MEIN_TURNIERPLAN_COMPETITION_SYNC_DISABLED_MESSAGE") &&
      confirmFn.includes("notice: null"),
    "confirm returns controlled disabled error (not silent success)",
  );

  // C) importMeinTurnierplanGroupsAction is hard-blocked before group/member mutation
  assert(
    importFn.includes("MEIN_TURNIERPLAN_COMPETITION_IMPORT_DISABLED_MESSAGE") &&
      importFn.includes("error: MEIN_TURNIERPLAN_COMPETITION_IMPORT_DISABLED_MESSAGE") &&
      importFn.includes("notice: null") &&
      !importFn.includes("createTournamentGroupAction") &&
      !importFn.includes("getAdminTournamentStage") &&
      !importFn.includes(".insert(") &&
      !importFn.includes(".update(") &&
      !importFn.includes(".delete("),
    "C) importMeinTurnierplanGroupsAction hard-blocked before group/member mutation",
  );

  // D) legacy import cannot reach assignTeamToGroupAction
  assert(
    !importFn.includes("assignTeamToGroupAction"),
    "D) import action does not call assignTeamToGroupAction",
  );
  assert(
    !mtpActions.includes('from "@/lib/db/schedule-actions"') &&
      !mtpActions.includes("createTournamentGroupAction") &&
      !mtpActions.includes("assignTeamToGroupAction"),
    "D) mein-turnierplan-actions no longer imports schedule mutation helpers",
  );

  // E) normal Admin UI contains no executable competition sync/import control
  assert(
    !syncPanel.includes("Vorschau laden") &&
      !syncPanel.includes("Synchronisation bestätigen") &&
      !syncPanel.includes("Jetzt synchronisieren") &&
      !syncPanel.includes("handleConfirmSync") &&
      !syncPanel.includes("previewMeinTurnierplanSyncAction") &&
      !syncPanel.includes("confirmMeinTurnierplanSyncAction"),
    "E) Admin sync panel has no Preview/Confirm competition sync controls",
  );
  assert(
    !mtpTools.includes("Gruppen & Teams laden") &&
      !mtpTools.includes("In Hub übernehmen") &&
      !mtpTools.includes("Zuordnung bestätigen") &&
      !mtpTools.includes("importMeinTurnierplanGroupsAction") &&
      !mtpTools.includes("loadMeinTurnierplanPreviewForTournamentAction") &&
      !mtpTools.includes("handleImport") &&
      !mtpTools.includes("handleLoadPreview"),
    "E) Admin tools have no Gruppen/Teams import workflow controls",
  );

  // F) Verbindung prüfen remains available
  assert(
    syncPanel.includes("Verbindung prüfen") &&
      mtpTools.includes("Verbindung prüfen") &&
      mtpTools.includes("checkMeinTurnierplanConnectionAction"),
    "F) Verbindung prüfen remains available",
  );

  // G) preview remains read-only
  assert(
    previewFn.includes("fetchMeinTurnierplanJson") &&
      previewFn.includes("buildMeinTurnierplanSyncPreview") &&
      !previewFn.includes(".rpc(") &&
      !previewFn.includes(".insert(") &&
      !previewFn.includes(".update(") &&
      !previewFn.includes(".delete("),
    "G) previewMeinTurnierplanSyncAction remains read-only",
  );

  // H) Datenquelle / live_data_source behavior unchanged
  assert(
    adminForm.includes('label="Datenquelle"') &&
      adminForm.includes('<option value="hub">Eigener Hub</option>') &&
      adminForm.includes('<option value="mein-turnierplan">MeinTurnierplan</option>') &&
      adminForm.includes('<option value="hybrid">Hybrid</option>') &&
      adminForm.includes("liveDataSource") &&
      mtpPanel.includes('label="Datenquelle"') &&
      mtpLib.includes("showsMeinTurnierplanLiveTab") &&
      mtpLib.includes("usesMeinTurnierplanAsPrimaryLive") &&
      mtpLib.includes("isHybridLiveDataSource") &&
      publicData.includes("usesMeinTurnierplanPublicTabs"),
    "H) Datenquelle/live_data_source UI and helpers unchanged",
  );

  // I) public resolvers unchanged
  assert(
    publicSource.includes("export function resolveTeilnehmerTab") &&
      publicSource.includes("export function resolveGruppenTab") &&
      publicSource.includes("export function resolveSpielplanTab") &&
      publicSource.includes("export function resolveTabelleTab") &&
      publicPage.includes("preferSyncedHubData={Boolean(") &&
      publicPage.includes("tournament.meinTurnierplanLastSyncedAt"),
    "I) public resolvers / preferSyncedHubData wiring unchanged",
  );

  // J) MTP presentation functionality unchanged
  assert(
    api.includes("fetchMeinTurnierplanJson") &&
      api.includes("fetchMeinTurnierplanJsonPublic") &&
      liveSection.includes("export function MeinTurnierplanLiveSection") &&
      (liveSection.includes("MeinTurnierplanWidget") || liveSection.includes("iframe")) &&
      publicPage.includes("livePresentation") &&
      publicPage.includes("showLiveTab") &&
      adminForm.includes("MeinTurnierplan verwenden") &&
      adminForm.includes("meinTurnierplanMatchesWidgetUrl") &&
      adminForm.includes("meinTurnierplanTableWidgetUrl"),
    "J) MTP presentation enable/widgets/Live remain available",
  );

  assert(
    adminForm.includes(
      "Numerische Turnier-ID aus MeinTurnierPlan. Sie wird für die Verbindung und optionale öffentliche Darstellung verwendet.",
    ),
    "Turnier-ID help text is presentation-only",
  );

  // K) no migration/RPC/RLS/RBAC changes (presence in tree; git scope enforced separately)
  assert(
    rpcMigration.includes(
      "CREATE OR REPLACE FUNCTION public.sync_mein_turnierplan_tournament",
    ),
    "K) sync RPC migration still present unmodified in tree",
  );

  // L) no competition data cleanup performed in B1-A production files
  assert(
    !syncActions.includes("external_active = false") &&
      !mtpActions.includes("external_active = false") &&
      !syncPanel.includes("Daten löschen") &&
      !mtpTools.includes("Daten löschen"),
    "L) no competition data cleanup in B1-A UI/action",
  );

  // /live unchanged
  assert(
    livePage.includes("getLivePageData") &&
      livePage.includes("LivePageView") &&
      !liveQueries.includes("sync_mein_turnierplan") &&
      !liveQueries.includes("confirmMeinTurnierplanSyncAction") &&
      !liveQueries.includes("importMeinTurnierplanGroupsAction"),
    "/live Hub-native path unchanged",
  );

  // Logo helper: not reachable from confirm or import
  assert(
    !confirmFn.includes("applyMeinTurnierplanTeamLogosAfterSync") &&
      !importFn.includes("applyMeinTurnierplanTeamLogosAfterSync") &&
      !mtpTools.includes("applyMeinTurnierplanTeamLogosAfterSync") &&
      !syncPanel.includes("applyMeinTurnierplanTeamLogosAfterSync"),
    "logo helper not invoked by confirm/import/Admin MTP UI",
  );

  return "ok";
}

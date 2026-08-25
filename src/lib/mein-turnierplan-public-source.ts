import {
  MEIN_TURNIERPLAN_REAL_MATCHES_WIDGET_URL,
  suggestTableWidgetUrlFromMatches,
  validateMeinTurnierplanWidgetUrl,
} from "@/lib/mein-turnierplan";
import type { PublicMeinTurnierplanData } from "@/lib/mein-turnierplan-public-data";
import type { PublicTournamentStage } from "@/lib/db/schedule-queries";

export type PublicTabContentSource = "mein-turnierplan" | "hub" | "unavailable";

export type PublicTabResolution = {
  source: PublicTabContentSource;
  showMeinTurnierplanHint: boolean;
};

export function resolveTeilnehmerTab(input: {
  mtp: PublicMeinTurnierplanData;
  hubRosterCount: number;
  preferSyncedHub?: boolean;
}): PublicTabResolution {
  if (input.preferSyncedHub && input.hubRosterCount > 0) {
    return { source: "hub", showMeinTurnierplanHint: false };
  }

  if (input.mtp.available && input.mtp.participants.length > 0) {
    return { source: "mein-turnierplan", showMeinTurnierplanHint: true };
  }

  if (input.mtp.isHybrid && input.hubRosterCount > 0) {
    return { source: "hub", showMeinTurnierplanHint: false };
  }

  if (input.mtp.isMeinTurnierplanOnly) {
    return { source: "unavailable", showMeinTurnierplanHint: false };
  }

  return { source: "hub", showMeinTurnierplanHint: false };
}

export function resolveGruppenTab(input: {
  mtp: PublicMeinTurnierplanData;
  hubGroupCount: number;
  preferSyncedHub?: boolean;
}): PublicTabResolution {
  if (input.preferSyncedHub && input.hubGroupCount > 0) {
    return { source: "hub", showMeinTurnierplanHint: false };
  }

  if (input.mtp.available && input.mtp.groups.length > 0) {
    return { source: "mein-turnierplan", showMeinTurnierplanHint: true };
  }

  if (input.mtp.isHybrid && input.hubGroupCount > 0) {
    return { source: "hub", showMeinTurnierplanHint: false };
  }

  if (input.mtp.isMeinTurnierplanOnly) {
    return { source: "unavailable", showMeinTurnierplanHint: false };
  }

  return { source: "hub", showMeinTurnierplanHint: false };
}

export function resolveSpielplanTab(input: {
  mtp: PublicMeinTurnierplanData;
  hubMatchCount: number;
  preferSyncedHub?: boolean;
}): PublicTabResolution {
  if (input.preferSyncedHub && input.hubMatchCount > 0) {
    return { source: "hub", showMeinTurnierplanHint: false };
  }

  if (input.mtp.matchesWidgetUrl) {
    return { source: "mein-turnierplan", showMeinTurnierplanHint: true };
  }

  if (input.mtp.isHybrid && input.hubMatchCount > 0) {
    return { source: "hub", showMeinTurnierplanHint: false };
  }

  if (input.mtp.isMeinTurnierplanOnly) {
    return { source: "unavailable", showMeinTurnierplanHint: false };
  }

  return { source: "hub", showMeinTurnierplanHint: false };
}

export function resolveTabelleTab(input: {
  mtp: PublicMeinTurnierplanData;
  hubGroupCount: number;
  hubMatchCount?: number;
  preferSyncedHub?: boolean;
}): PublicTabResolution {
  if (input.preferSyncedHub && (input.hubGroupCount > 0 || (input.hubMatchCount ?? 0) > 0)) {
    return { source: "hub", showMeinTurnierplanHint: false };
  }

  if (input.mtp.tableWidgetUrl) {
    return { source: "mein-turnierplan", showMeinTurnierplanHint: true };
  }

  if (input.mtp.isHybrid && input.hubGroupCount > 0) {
    return { source: "hub", showMeinTurnierplanHint: false };
  }

  if (input.mtp.isMeinTurnierplanOnly) {
    return { source: "unavailable", showMeinTurnierplanHint: false };
  }

  return { source: "hub", showMeinTurnierplanHint: false };
}

export function publicStageHasHubSchedule(stage: Pick<PublicTournamentStage, "matches" | "groups">) {
  return stage.matches.length > 0 || stage.groups.length > 0;
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runMeinTurnierplanPublicSourceSelfChecks() {
  const realMtpData: PublicMeinTurnierplanData = {
    usesPublicSource: true,
    isHybrid: false,
    isMeinTurnierplanOnly: true,
    available: true,
    error: null,
    tournamentName: "D2-Sommercup 2026",
    participants: Array.from({ length: 8 }, (_, index) => ({
      id: String(index + 1),
      name: `Team ${index + 1}`,
      groupName: index < 4 ? "Gruppe A" : "Gruppe B",
    })),
    groups: [
      {
        id: "A",
        name: "Gruppe A",
        teams: Array.from({ length: 4 }, (_, index) => ({
          id: String(index + 1),
          name: `Team ${index + 1}`,
        })),
      },
      {
        id: "B",
        name: "Gruppe B",
        teams: Array.from({ length: 4 }, (_, index) => ({
          id: String(index + 5),
          name: `Team ${index + 5}`,
        })),
      },
    ],
    matchesWidgetUrl: MEIN_TURNIERPLAN_REAL_MATCHES_WIDGET_URL,
    tableWidgetUrl: null,
  };

  const teilnehmer = resolveTeilnehmerTab({ mtp: realMtpData, hubRosterCount: 0 });
  assert(teilnehmer.source === "mein-turnierplan", "Teilnehmer aus MeinTurnierplan");
  assert(teilnehmer.showMeinTurnierplanHint, "Teilnehmer-Hinweis bei MTP");

  const gruppen = resolveGruppenTab({ mtp: realMtpData, hubGroupCount: 0 });
  assert(gruppen.source === "mein-turnierplan", "Gruppen aus MeinTurnierplan");

  const spielplan = resolveSpielplanTab({ mtp: realMtpData, hubMatchCount: 0 });
  assert(spielplan.source === "mein-turnierplan", "Spielplan-Widget aus MeinTurnierplan");

  const hybridFallback = resolveTeilnehmerTab({
    mtp: { ...realMtpData, available: false, isHybrid: true, isMeinTurnierplanOnly: false },
    hubRosterCount: 3,
  });
  assert(hybridFallback.source === "hub", "Hybrid fällt auf Hub-Teilnehmer zurück");

  const mtpOnlyUnavailable = resolveTeilnehmerTab({
    mtp: { ...realMtpData, available: false },
    hubRosterCount: 0,
  });
  assert(mtpOnlyUnavailable.source === "unavailable", "MTP-only ohne Daten ist unavailable");

  const suggested = suggestTableWidgetUrlFromMatches(MEIN_TURNIERPLAN_REAL_MATCHES_WIDGET_URL);
  assert(Boolean(suggested?.toLowerCase().includes("displaytable.php")), "Tabellen-Widget-Vorschlag muss displayTable.php sein");
  assert(Boolean(suggested?.includes("id=2jrb0hvxvd")), "Tabellen-Vorschlag muss ID übernehmen");
  assert(
    validateMeinTurnierplanWidgetUrl(suggested ?? "", "table").error === null,
    "Tabellen-Vorschlag muss gültig sein",
  );

  return "ok";
}

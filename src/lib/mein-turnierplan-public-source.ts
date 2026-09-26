import {
  MEIN_TURNIERPLAN_REAL_MATCHES_WIDGET_URL,
  suggestTableWidgetUrlFromMatches,
  validateMeinTurnierplanWidgetUrl,
} from "@/lib/mein-turnierplan";
import type { PublicMeinTurnierplanData } from "@/lib/mein-turnierplan-public-data";
import type { PublicTournamentStage } from "@/lib/db/schedule-queries";

export type PublicTabContentSource = "hub";

export type PublicTabResolution = {
  source: PublicTabContentSource;
  showMeinTurnierplanHint: boolean;
};

/**
 * B1-B1: Normal competition tabs are always Hub-authoritative.
 * MTP JSON/widgets/live_data_source/preferSyncedHub must not switch these tabs.
 * Historical pollution inside Hub tables is unresolved by design (B1-B3).
 */
const HUB_ONLY_TAB: PublicTabResolution = {
  source: "hub",
  showMeinTurnierplanHint: false,
};

export function resolveTeilnehmerTab(): PublicTabResolution {
  return HUB_ONLY_TAB;
}

export function resolveGruppenTab(): PublicTabResolution {
  return HUB_ONLY_TAB;
}

export function resolveSpielplanTab(): PublicTabResolution {
  return HUB_ONLY_TAB;
}

export function resolveTabelleTab(): PublicTabResolution {
  return HUB_ONLY_TAB;
}

export function publicStageHasHubSchedule(stage: Pick<PublicTournamentStage, "matches" | "groups">) {
  return stage.matches.length > 0 || stage.groups.length > 0;
}

function assert(condition: unknown, message: string): asserts condition {
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

  // Force-reference fixture so authority cases stay explicit even without resolver inputs.
  assert(realMtpData.available && realMtpData.participants.length > 0, "MTP fixture available");

  // B1-B1: resolvers ignore MTP availability / preferSynced / empty hub — always Hub
  const cases = [
    resolveTeilnehmerTab(),
    resolveGruppenTab(),
    resolveSpielplanTab(),
    resolveTabelleTab(),
  ];

  for (const resolution of cases) {
    assert(resolution.source === "hub", "B1-B1 competition tabs always resolve to hub");
    assert(!resolution.showMeinTurnierplanHint, "B1-B1 no MTP source hint on competition tabs");
  }

  const suggested = suggestTableWidgetUrlFromMatches(MEIN_TURNIERPLAN_REAL_MATCHES_WIDGET_URL);
  assert(Boolean(suggested?.toLowerCase().includes("displaytable.php")), "Tabellen-Widget-Vorschlag muss displayTable.php sein");
  assert(Boolean(suggested?.includes("id=2jrb0hvxvd")), "Tabellen-Vorschlag muss ID übernehmen");
  assert(
    validateMeinTurnierplanWidgetUrl(suggested ?? "", "table").error === null,
    "Tabellen-Vorschlag muss gültig sein",
  );

  return "ok";
}

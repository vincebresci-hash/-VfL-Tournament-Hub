import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatUpdatedAgo,
  mapsSearchUrl,
  primaryMomentEmptyCopy,
  selectNextMatches,
  selectOtherLiveMatches,
  selectPrimaryMatchMoment,
  selectRecentResults,
} from "@/lib/live/match-center";
import { publicTeamLabel } from "@/lib/schedule/names";
import type { TournamentMatchRecord } from "@/types/schedule";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
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

export function runMatchCenterDesignChecks() {
  const live = match({
    id: "live-1",
    status: "live",
    scheduledAt: "2026-07-04T10:00:00.000Z",
    homeScore: 2,
    awayScore: 1,
    fieldId: "f1",
  });
  const live2 = match({
    id: "live-2",
    status: "live",
    scheduledAt: "2026-07-04T10:05:00.000Z",
    fieldId: "f2",
  });
  const next = match({
    id: "next-1",
    status: "scheduled",
    scheduledAt: "2026-07-04T10:40:00.000Z",
  });
  const next2 = match({
    id: "next-2",
    status: "scheduled",
    scheduledAt: "2026-07-04T11:00:00.000Z",
  });
  const done = match({
    id: "done-1",
    status: "completed",
    scheduledAt: "2026-07-04T09:00:00.000Z",
    homeScore: 3,
    awayScore: 0,
  });

  // A) live => primary LIVE
  const primaryLive = selectPrimaryMatchMoment([done, next, live, live2]);
  assert(primaryLive.kind === "live" && primaryLive.match?.id === "live-1", "A: primary live");

  // B) no live => next primary
  const primaryNext = selectPrimaryMatchMoment([done, next, next2]);
  assert(primaryNext.kind === "next" && primaryNext.match?.id === "next-1", "B: primary next");

  // C) completed only => none
  const primaryNone = selectPrimaryMatchMoment([done]);
  assert(primaryNone.kind === "none", "C: no primary match");

  // D) no matches
  assert(selectPrimaryMatchMoment([]).kind === "none", "D: empty matches");

  // E) other live fields
  const others = selectOtherLiveMatches([live, live2, next], "live-1");
  assert(others.length === 1 && others[0]?.id === "live-2", "E: other live");

  // F/G labels
  assert(publicTeamLabel("VfL Kirchheim", "VfL Kirchheim") === "VfL Kirchheim", "G: no duplicate label");
  assert(
    publicTeamLabel("VfL Kirchheim", "VfL Kirchheim II") === "VfL Kirchheim · VfL Kirchheim II",
    "F: distinct long-ish names",
  );

  assert(selectNextMatches([live, next, next2], "next-1", 5)[0]?.id === "next-2", "next list skips primary");
  assert(selectRecentResults([done, live], 5)[0]?.id === "done-1", "recent completed");

  assert(formatUpdatedAgo(null) === null, "no fake timestamp");
  assert(
    formatUpdatedAgo(new Date().toISOString())?.includes("Synchronisierung") ||
      formatUpdatedAgo(new Date().toISOString())?.includes("synchronisiert"),
    "relative sync wording",
  );
  assert(mapsSearchUrl("Sportpark", "Musterstr. 1")?.includes("maps"), "maps url");

  const finished = primaryMomentEmptyCopy({
    hasLive: false,
    hasScheduled: false,
    hasCompleted: true,
    startTimeLabel: null,
  });
  assert(finished.title.includes("beendet"), "finished title");
  assert(finished.body.includes("Turniertag ist beendet"), "finished body");

  const lull = primaryMomentEmptyCopy({
    hasLive: false,
    hasScheduled: true,
    hasCompleted: true,
    startTimeLabel: null,
  });
  assert(lull.body.includes("Aktuell läuft kein Spiel"), "midday lull copy");

  const view = readFileSync(join(process.cwd(), "src/components/live/LivePageView.tsx"), "utf8");
  assert(view.includes("LiveMatchCard"), "view uses LiveMatchCard");
  assert(view.includes("selectPrimaryMatchMoment"), "view uses primary moment");
  assert(view.includes("LiveShareActions"), "view has share/QR");
  assert(view.includes("Auf der Anlage"), "venue section");
  assert(view.includes("Als Nächstes"), "next section");
  assert(view.includes("Letzte Ergebnisse"), "results section");
  assert(view.includes("Gruppen"), "groups section");
  assert(!view.includes("MeinTurnierplanBadge"), "no duplicate LIVE MTP badge");
  assert(view.includes("Live-Daten via MeinTurnierplan"), "MTP source line kept");
  assert(view.includes("heroCompact"), "compact hero when no live primary");
  assert(view.includes("Letzte Synchronisierung") === false, "sync wording lives in helper");
  assert(view.includes("formatUpdatedAgo"), "uses sync helper");
  assert(view.includes("primaryMomentEmptyCopy"), "uses empty copy helper");

  const card = readFileSync(join(process.cwd(), "src/components/live/LiveMatchCard.tsx"), "utf8");
  assert(card.includes('variant === "live"'), "live variant");
  assert(card.includes('variant === "next"') || card.includes('variant === "completed"'), "variants");
  assert(card.includes("sm:hidden"), "mobile stack preserved");
  assert(card.includes("break-words"), "long names wrap");
  assert(card.includes("min-w-0"), "min-w-0 shrink");

  const share = readFileSync(join(process.cwd(), "src/components/live/LiveShareActions.tsx"), "utf8");
  assert(share.includes("navigator.share"), "web share");
  assert(share.includes("clipboard"), "clipboard fallback");
  assert(share.includes("QRCode"), "local QR generation");
  assert(share.includes("showModal"), "dialog modal");

  return "ok";
}

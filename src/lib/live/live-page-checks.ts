import { selectLiveMatchHighlights, liveMatchStatusLabel } from "@/lib/live/live-matches";
import {
  hasActiveLiveTournamentToday,
  pickPrimaryLiveTournament,
  selectLivePageTournaments,
  type LiveTournamentCandidate,
} from "@/lib/live/select-live-tournament";
import type { TournamentMatchRecord } from "@/types/schedule";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function tournament(
  partial: Partial<LiveTournamentCandidate> &
    Pick<LiveTournamentCandidate, "id" | "name" | "date" | "status">,
): LiveTournamentCandidate {
  return {
    slug: partial.slug ?? partial.id,
    startTime: partial.startTime ?? null,
    endTime: partial.endTime ?? null,
    archivedAt: partial.archivedAt ?? null,
    ...partial,
  };
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

export function runLivePageSelfChecks() {
  // A) Today active appears automatically
  const now = new Date("2026-07-04T10:00:00+02:00");
  const todayActive = tournament({
    id: "today",
    name: "D2 Sommercup",
    date: "2026-07-04",
    status: "active",
    startTime: "09:00",
    endTime: "18:00",
  });
  const selectionA = selectLivePageTournaments(
    [
      todayActive,
      tournament({
        id: "future",
        name: "U11 Cup",
        date: "2026-08-01",
        status: "coming-soon",
      }),
    ],
    { now },
  );
  assert(selectionA.primary?.id === "today", "A: today active is primary");
  assert(selectionA.hasLiveToday === true, "A: hasLiveToday");

  // B) No active today => empty primary
  const selectionB = selectLivePageTournaments(
    [
      tournament({
        id: "future",
        name: "U11 Cup",
        date: "2026-08-01",
        status: "coming-soon",
      }),
      tournament({
        id: "past",
        name: "Alt",
        date: "2026-06-01",
        status: "completed",
      }),
    ],
    { now },
  );
  assert(selectionB.primary === null, "B: no live tournament");
  assert(selectionB.hasLiveToday === false, "B: hasLiveToday false");
  assert(selectionB.upcoming.some((entry) => entry.id === "future"), "B: upcoming listed");

  // C) completed not live, appears in past
  const selectionC = selectLivePageTournaments(
    [
      tournament({
        id: "done",
        name: "Fertig",
        date: "2026-07-04",
        status: "completed",
        startTime: "09:00",
      }),
    ],
    { now },
  );
  assert(selectionC.primary === null, "C: completed not primary");
  assert(selectionC.past.some((entry) => entry.id === "done"), "C: completed in past");

  // D) future in upcoming
  assert(
    selectLivePageTournaments(
      [
        tournament({
          id: "future-2",
          name: "Später",
          date: "2026-09-01",
          status: "coming-soon",
        }),
      ],
      { now },
    ).upcoming[0]?.id === "future-2",
    "D: future upcoming",
  );

  // Multiple today: prefer current window
  const morning = tournament({
    id: "morning",
    name: "Morgen",
    date: "2026-07-04",
    status: "active",
    startTime: "08:00",
    endTime: "09:30",
  });
  const midday = tournament({
    id: "midday",
    name: "Mittag",
    date: "2026-07-04",
    status: "active",
    startTime: "09:45",
    endTime: "12:00",
  });
  const evening = tournament({
    id: "evening",
    name: "Abend",
    date: "2026-07-04",
    status: "active",
    startTime: "15:00",
    endTime: "19:00",
  });
  assert(
    pickPrimaryLiveTournament([morning, midday, evening], now)?.id === "midday",
    "window preference picks current slot",
  );

  const early = new Date("2026-07-04T07:00:00+02:00");
  assert(
    pickPrimaryLiveTournament([morning, midday, evening], early)?.id === "morning",
    "next starting today before first window",
  );

  const late = new Date("2026-07-04T20:00:00+02:00");
  assert(
    pickPrimaryLiveTournament([morning, midday, evening], late)?.id === "evening",
    "most recently started after windows",
  );

  const lateBerlin = new Date("2026-07-04T23:30:00+02:00");
  assert(
    selectLivePageTournaments([todayActive], { now: lateBerlin }).primary?.id === "today",
    "Berlin late evening still today",
  );

  const afterMidnight = new Date("2026-07-05T00:15:00+02:00");
  assert(
    selectLivePageTournaments([todayActive], { now: afterMidnight }).primary === null,
    "after Berlin midnight active yesterday is not live",
  );

  const highlights = selectLiveMatchHighlights(
    [
      match({
        id: "c1",
        status: "completed",
        scheduledAt: "2026-07-04T08:00:00.000Z",
        homeScore: 1,
        awayScore: 0,
      }),
      match({
        id: "s1",
        status: "scheduled",
        scheduledAt: "2026-07-04T11:00:00.000Z",
      }),
      match({
        id: "l1",
        status: "live",
        scheduledAt: "2026-07-04T10:00:00.000Z",
        homeScore: 0,
        awayScore: 0,
      }),
      match({ id: "x", status: "cancelled" }),
    ],
    3,
  );
  assert(highlights[0]?.id === "l1", "E: live first");
  assert(highlights[1]?.id === "s1", "E: scheduled next");
  assert(highlights[2]?.id === "c1", "F: completed fills remaining");
  assert(liveMatchStatusLabel("live") === "LIVE", "status label live");

  assert(hasActiveLiveTournamentToday([todayActive], now) === true, "helper live true");
  assert(hasActiveLiveTournamentToday([], now) === false, "helper live false");

  assert(
    selectLivePageTournaments(
      [
        tournament({
          id: "arch",
          name: "Archiv",
          date: "2026-07-04",
          status: "active",
          archivedAt: "2026-07-01T00:00:00.000Z",
        }),
      ],
      { now },
    ).primary === null,
    "archived active ignored",
  );

  return "ok";
}

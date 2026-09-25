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

const LIFECYCLE_STATUSES = ["coming-soon", "active", "full", "completed"] as const;

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
  assert(
    !selectionA.upcoming.some((entry) => entry.id === "today"),
    "A: today's tournament not in upcoming",
  );

  // B) No tournament today => empty primary
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

  // C) completed + today remains primary-eligible (C5B.1), not past while today
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
  assert(selectionC.primary?.id === "done", "C: completed today is primary");
  assert(!selectionC.past.some((entry) => entry.id === "done"), "C: completed today not in past");

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

  // C5B.1 — TODAY: all lifecycle statuses eligible for primary
  for (const status of LIFECYCLE_STATUSES) {
    const selection = selectLivePageTournaments(
      [
        tournament({
          id: `today-${status}`,
          name: `Today ${status}`,
          date: "2026-07-04",
          status,
          startTime: "09:00",
          endTime: "18:00",
        }),
      ],
      { now },
    );
    assert(
      selection.primary?.id === `today-${status}`,
      `TODAY+${status}: eligible for primary`,
    );
    assert(
      !selection.upcoming.some((entry) => entry.id === `today-${status}`),
      `TODAY+${status}: not in upcoming`,
    );
    assert(
      !selection.past.some((entry) => entry.id === `today-${status}`),
      `TODAY+${status}: not in past`,
    );
  }

  // C5B.1 — U14-like: full + Berlin today → primary
  const u14Like = selectLivePageTournaments(
    [
      tournament({
        id: "u14-elite-cup",
        name: "U14 Elite Cup Test Tunier",
        date: "2026-07-04",
        status: "full",
        startTime: "09:00",
        endTime: "18:00",
        archivedAt: null,
      }),
    ],
    { now },
  );
  assert(u14Like.primary?.id === "u14-elite-cup", "U14-like full + today is primary");
  assert(u14Like.hasLiveToday === true, "U14-like hasLiveToday");

  // C5B.1 — FUTURE: not primary for any lifecycle status
  for (const status of LIFECYCLE_STATUSES) {
    const selection = selectLivePageTournaments(
      [
        tournament({
          id: `future-${status}`,
          name: `Future ${status}`,
          date: "2026-08-01",
          status,
          startTime: "09:00",
        }),
      ],
      { now },
    );
    assert(selection.primary === null, `FUTURE+${status}: not primary`);
    assert(
      selection.upcoming.some((entry) => entry.id === `future-${status}`) ||
        selection.past.some((entry) => entry.id === `future-${status}`),
      `FUTURE+${status}: listed in upcoming or past by date/status rules`,
    );
  }

  // Future by date (including full/active) appears in upcoming, not primary
  const futureFull = selectLivePageTournaments(
    [
      tournament({
        id: "future-full",
        name: "Future Full",
        date: "2026-08-15",
        status: "full",
      }),
    ],
    { now },
  );
  assert(futureFull.primary === null, "future full not primary");
  assert(futureFull.upcoming.some((entry) => entry.id === "future-full"), "future full upcoming");

  // C5B.1 — PAST: not primary for any lifecycle status
  for (const status of LIFECYCLE_STATUSES) {
    const selection = selectLivePageTournaments(
      [
        tournament({
          id: `past-${status}`,
          name: `Past ${status}`,
          date: "2026-06-01",
          status,
        }),
      ],
      { now },
    );
    assert(selection.primary === null, `PAST+${status}: not primary`);
    assert(
      selection.past.some((entry) => entry.id === `past-${status}`),
      `PAST+${status}: appears in past`,
    );
  }

  // C5B.1 — ARCHIVED TODAY: not primary
  assert(
    selectLivePageTournaments(
      [
        tournament({
          id: "arch-today",
          name: "Archiv Heute",
          date: "2026-07-04",
          status: "full",
          archivedAt: "2026-07-01T00:00:00.000Z",
        }),
      ],
      { now },
    ).primary === null,
    "ARCHIVED TODAY: not primary",
  );

  // Upcoming gap: coming-soon dated today is primary, not upcoming
  const comingSoonToday = selectLivePageTournaments(
    [
      tournament({
        id: "cs-today",
        name: "Demnächst heute",
        date: "2026-07-04",
        status: "coming-soon",
        startTime: "10:00",
      }),
      tournament({
        id: "cs-future",
        name: "Demnächst später",
        date: "2026-08-01",
        status: "coming-soon",
      }),
    ],
    { now },
  );
  assert(comingSoonToday.primary?.id === "cs-today", "coming-soon today is primary");
  assert(
    !comingSoonToday.upcoming.some((entry) => entry.id === "cs-today"),
    "coming-soon today not in upcoming",
  );
  assert(
    comingSoonToday.upcoming.some((entry) => entry.id === "cs-future"),
    "future coming-soon still upcoming",
  );

  // Multiple today: prefer current window (ordering unchanged; mixed statuses ok)
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
    status: "full",
    startTime: "09:45",
    endTime: "12:00",
  });
  const evening = tournament({
    id: "evening",
    name: "Abend",
    date: "2026-07-04",
    status: "completed",
    startTime: "15:00",
    endTime: "19:00",
  });
  assert(
    pickPrimaryLiveTournament([morning, midday, evening], now)?.id === "midday",
    "window preference picks current slot",
  );
  assert(
    selectLivePageTournaments([morning, midday, evening], { now }).primary?.id === "midday",
    "MULTIPLE TODAY: existing window ordering unchanged",
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

  // After Berlin midnight, yesterday's completed leaves primary and can appear in past
  const yesterdayCompleted = tournament({
    id: "y-done",
    name: "Gestern fertig",
    date: "2026-07-04",
    status: "completed",
    startTime: "09:00",
  });
  const afterMidnightPast = selectLivePageTournaments([yesterdayCompleted], {
    now: afterMidnight,
  });
  assert(afterMidnightPast.primary === null, "completed yesterday not primary after midnight");
  assert(
    afterMidnightPast.past.some((entry) => entry.id === "y-done"),
    "completed yesterday appears in past after midnight",
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
    hasActiveLiveTournamentToday(
      [
        tournament({
          id: "u14",
          name: "U14",
          date: "2026-07-04",
          status: "full",
        }),
      ],
      now,
    ) === true,
    "helper live true for full today",
  );

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

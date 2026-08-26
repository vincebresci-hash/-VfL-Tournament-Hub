import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  daysUntilTournamentDate,
  isTournamentDayFinished,
  resolveHomepageHeroMoment,
} from "@/lib/home/homepage-moment";
import type { LiveTournamentSelection } from "@/lib/live/select-live-tournament";
import type { PublicTournament } from "@/types/tournament";
import type { TournamentMatchRecord } from "@/types/schedule";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function baseTournament(overrides: Partial<PublicTournament> = {}): PublicTournament {
  return {
    id: "t1",
    slug: "victory-cup",
    name: "Victory Cup",
    ageGroup: "U14",
    date: "2026-08-26",
    location: "Sportpark Kirchheim",
    image: "/u14.webp",
    description: "",
    shortDescription: "",
    status: "active",
    maxTeams: 16,
    confirmedTeams: 8,
    availableSlots: 8,
    isFull: false,
    waitlistCount: 0,
    waitlistEnabled: true,
    applicationsOpen: true,
    archivedAt: null,
    applicationStart: null,
    applicationDeadline: null,
    startTime: "09:00",
    endTime: "16:00",
    address: null,
    birthYear: 2013,
    meinTurnierplanUrl: null,
    meinTurnierplanEnabled: false,
    meinTurnierplanLabel: null,
    meinTurnierplanEmbedUrl: null,
    liveDataSource: "hub",
    meinTurnierplanTournamentId: null,
    meinTurnierplanMatchesWidgetUrl: null,
    meinTurnierplanTableWidgetUrl: null,
    publicScheduleNote: null,
    publicLiveNote: null,
    playFormat: null,
    playingTime: null,
    pitchFormat: null,
    entryFee: null,
    travelInfo: null,
    changingRooms: null,
    catering: null,
    teamInfo: null,
    ...overrides,
  };
}

function match(
  partial: Partial<TournamentMatchRecord> & Pick<TournamentMatchRecord, "id" | "status">,
): TournamentMatchRecord {
  return {
    tournamentId: "t1",
    groupId: null,
    fieldId: "f1",
    homeApplicationId: "a1",
    awayApplicationId: "a2",
    homeExternalTeamId: null,
    awayExternalTeamId: null,
    homeScore: null,
    awayScore: null,
    scheduledAt: "2026-08-26T10:00:00.000Z",
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

export function runHomepageSelfChecks() {
  const selectionLive: LiveTournamentSelection = {
    todayBerlin: "2026-08-26",
    primary: {
      id: "t1",
      slug: "victory-cup",
      name: "Victory Cup",
      date: "2026-08-26",
      status: "active",
      startTime: "09:00",
      endTime: "16:00",
      archivedAt: null,
    },
    todayAlso: [],
    upcoming: [
      {
        id: "t2",
        slug: "u10-cup",
        name: "U10 Cup",
        date: "2026-09-04",
        status: "coming-soon",
        startTime: "10:00",
        endTime: "16:00",
        archivedAt: null,
      },
    ],
    past: [],
    hasLiveToday: true,
  };

  const livePrimary = baseTournament();
  const upcomingFull = [
    baseTournament({
      id: "t2",
      slug: "u10-cup",
      name: "U10 Cup",
      ageGroup: "U10",
      date: "2026-09-04",
      status: "coming-soon",
      confirmedTeams: 4,
      availableSlots: 12,
    }),
    baseTournament({
      id: "t3",
      slug: "u8-mini",
      name: "U8 Mini Cup",
      ageGroup: "U8",
      date: "2026-09-10",
      status: "active",
    }),
  ];

  const liveMoment = resolveHomepageHeroMoment({
    selection: selectionLive,
    primary: livePrimary,
    upcoming: upcomingFull,
    past: [],
    matches: [
      match({ id: "m1", status: "live", homeScore: 2, awayScore: 1 }),
      match({ id: "m2", status: "scheduled" }),
    ],
  });
  assert(liveMoment.kind === "live", "A live hero");
  assert(liveMoment.matchMoment?.kind === "live", "A live match teaser");
  assert(liveMoment.tournament?.slug === "victory-cup", "A live tournament");

  const nextMoment = resolveHomepageHeroMoment({
    selection: {
      ...selectionLive,
      primary: null,
      hasLiveToday: false,
      upcoming: selectionLive.upcoming,
    },
    primary: null,
    upcoming: upcomingFull,
    past: [],
    matches: [],
  });
  assert(nextMoment.kind === "next", "B next hero");
  assert(nextMoment.tournament?.id === "t2", "C earliest upcoming");

  const completedMoment = resolveHomepageHeroMoment({
    selection: selectionLive,
    primary: baseTournament({ status: "completed" }),
    upcoming: upcomingFull,
    past: [baseTournament({ status: "completed" })],
    matches: [match({ id: "m1", status: "completed", homeScore: 1, awayScore: 0 })],
  });
  assert(completedMoment.kind !== "live", "D completed not live");

  const finishedDay = resolveHomepageHeroMoment({
    selection: selectionLive,
    primary: livePrimary,
    upcoming: upcomingFull,
    past: [],
    matches: [
      match({ id: "m1", status: "completed", homeScore: 1, awayScore: 3 }),
      match({ id: "m2", status: "completed", homeScore: 2, awayScore: 0 }),
    ],
  });
  assert(finishedDay.kind === "next", "D2 finished day falls to next");
  assert(finishedDay.recentTournament?.id === "t1", "D2 recent uses finished primary");

  const hub = resolveHomepageHeroMoment({
    selection: {
      todayBerlin: "2026-08-26",
      primary: null,
      todayAlso: [],
      upcoming: [],
      past: [],
      hasLiveToday: false,
    },
    primary: null,
    upcoming: [],
    past: [],
    matches: [],
  });
  assert(hub.kind === "hub", "J hub empty");

  assert(isTournamentDayFinished([]) === false, "empty matches not finished");
  assert(
    isTournamentDayFinished([
      match({ id: "m1", status: "completed", homeScore: 1, awayScore: 0 }),
    ]) === true,
    "completed-only finished",
  );
  assert(
    isTournamentDayFinished([
      match({ id: "m1", status: "live" }),
      match({ id: "m2", status: "completed", homeScore: 1, awayScore: 0 }),
    ]) === false,
    "live prevents finished",
  );

  const now = new Date("2026-08-20T10:00:00.000Z");
  assert(daysUntilTournamentDate("2026-08-26", now) === 6, "days until future");
  assert(daysUntilTournamentDate("2026-08-20", now) === null, "no countdown today");
  assert(daysUntilTournamentDate("2026-08-19", now) === null, "no countdown past");
  assert(daysUntilTournamentDate(null, now) === null, "no fake countdown");

  const page = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
  assert(page.includes("getLivePageData"), "page reuses live data");
  assert(page.includes("HomePageView"), "page uses HomePageView");
  assert(!page.includes("23050efa"), "no hardcoded tournament id");

  const view = readFileSync(
    join(process.cwd(), "src/components/home/HomePageView.tsx"),
    "utf8",
  );
  assert(view.includes("resolveHomepageHeroMoment"), "view uses moment helper");
  assert(view.includes("HomeUpcomingSection"), "upcoming section");
  assert(view.includes("HomeRecentSection"), "recent section");
  assert(view.includes("HomeClubsTeaser"), "clubs teaser");
  assert(view.includes("HomeHowItWorks"), "how it works");

  const hero = readFileSync(join(process.cwd(), "src/components/home/HomeHero.tsx"), "utf8");
  assert(hero.includes("Live verfolgen"), "live CTA");
  assert(hero.includes("Nächstes Turnier"), "next badge");
  assert(hero.includes("VfL Tournament Center"), "hub hero");
  assert(hero.includes("/live"), "live href");

  return "ok";
}

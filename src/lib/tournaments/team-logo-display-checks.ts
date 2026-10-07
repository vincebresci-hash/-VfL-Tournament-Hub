import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveApplicationParticipantLogoUrl,
  resolveParticipantLogoUrl,
} from "@/lib/tournament-participants";
import { computeGroupStandings } from "@/lib/schedule/standings";
import {
  computeKnockoutPlacements,
  qualifyTopTwo,
  resolveKnockoutOutcome,
} from "@/lib/schedule/knockout";
import { LIVE_LOGO_SIZE } from "@/lib/live/match-center";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Focused presentation checks for Team Logo Display Enhancement.
 * Does not exercise DOM; verifies wiring, resolvers, and frozen logic sources.
 */
export function runTeamLogoDisplayChecks(): string {
  const logo = read("src/components/tournaments/ParticipantClubLogo.tsx");
  const withLogo = read("src/components/tournaments/TeamNameWithLogo.tsx");
  const schedule = read("src/components/tournaments/TournamentScheduleCards.tsx");
  const standings = read("src/components/tournaments/TournamentStandingsSection.tsx");
  const knockout = read("src/components/tournaments/TournamentKnockoutRounds.tsx");
  const stage = read("src/components/tournaments/TournamentPublicStage.tsx");
  const liveKo = read("src/lib/live/build-live-knockout-views.ts");
  const standingsLogic = read("src/lib/schedule/standings.ts");
  const knockoutLogic = read("src/lib/schedule/knockout.ts");
  const participants = read("src/lib/tournament-participants.ts");
  const adminSchedule = read("src/components/admin/TournamentScheduleBoard.tsx");
  const adminResults = read("src/components/admin/TournamentResultsBoard.tsx");
  const adminKo = read("src/components/admin/TournamentKnockoutBoard.tsx");

  // Shared primitive: opt-in fallback=none + broken-image hide + compact size
  assert(logo.includes('"use client"'), "ParticipantClubLogo is client for onError");
  assert(logo.includes('fallback?: "initial" | "none"'), "explicit fallback prop");
  assert(logo.includes('fallback = "initial"'), "default fallback remains letter tile");
  assert(logo.includes('fallback === "none"'), "none path hides logo");
  assert(logo.includes("onError"), "broken image handling");
  assert(logo.includes("failedSrc"), "failure state is keyed to src");
  assert(logo.includes("failedSrc === trimmed"), "new logoUrl cannot inherit prior failure");
  assert(logo.includes("setFailedSrc(trimmed)"), "onError records the failed src");
  assert(!logo.includes("useEffect"), "no effect-lag reset for logoUrl changes");
  assert(logo.includes('title="Kein Logo"'), "letter fallback retained for default surfaces");
  assert(logo.includes("clubName.trim().slice(0, 1)"), "initial fallback retained");
  assert(
    logo.includes('alt={fallback === "none" ? "" : `Logo ${clubName}`}'),
    "decorative alt when text name is adjacent (fallback none)",
  );
  assert(LIVE_LOGO_SIZE.xs === 24, "compact xs size ~24px");
  assert(logo.includes('size === "xs"'), "xs size class present");

  // Pure runtime ID → mark mapping (mirrors stage matchTeamId + teamMarks)
  const matchTeamId = (
    applicationId: string | null,
    externalTeamId?: string | null,
  ) => applicationId ?? externalTeamId ?? null;
  const sharedMark = { logoUrl: "https://cdn.example/shared.png", clubName: "Shared FC" };
  const teamMarks: Record<string, { logoUrl: string | null; clubName: string }> = {
    "app-home": { logoUrl: "https://cdn.example/home.png", clubName: "Home FC" },
    "ext-away": { logoUrl: "https://cdn.example/away.png", clubName: "Away FC" },
    "dual-app": sharedMark,
    "dual-ext": sharedMark,
    "no-logo": { logoUrl: null, clubName: "Text Only" },
  };
  const sideMark = (applicationId: string | null, externalTeamId?: string | null) => {
    const id = matchTeamId(applicationId, externalTeamId);
    return id ? teamMarks[id] : undefined;
  };
  assert(
    sideMark("app-home", null)?.logoUrl === "https://cdn.example/home.png",
    "application home id maps to home mark",
  );
  assert(
    sideMark(null, "ext-away")?.logoUrl === "https://cdn.example/away.png",
    "external away id maps to away mark",
  );
  assert(
    sideMark("dual-app", "dual-ext")?.logoUrl === sharedMark.logoUrl &&
      sideMark(null, "dual-ext")?.logoUrl === sharedMark.logoUrl,
    "linked identity resolves same mark via application or external id",
  );
  assert(sideMark("no-logo", null)?.logoUrl === null, "missing logo mark stays null");
  assert(sideMark(null, null) === undefined, "unset side has no mark");
  assert(
    sideMark("app-home", "ext-away")?.logoUrl === "https://cdn.example/home.png",
    "applicationId wins over externalTeamId (matchTeamId precedence)",
  );

  assert(withLogo.includes("TeamNameWithLogo"), "TeamNameWithLogo exported");
  assert(withLogo.includes('fallback="none"'), "wrapper never shows letter tile");
  assert(withLogo.includes("{label}"), "textual name always rendered");
  assert(withLogo.includes("min-w-0"), "text container min-w-0");
  assert(withLogo.includes("shrink-0"), "logo slot shrink-0");
  // Alignment hotfix: fixed invisible logo slot for logo and no-logo rows
  assert(withLogo.includes("logoSlotClass"), "fixed logo slot helper");
  assert(
    withLogo.includes("inline-flex shrink-0 items-center justify-center") &&
      withLogo.includes("h-5 w-5 sm:h-6 sm:w-6"),
    "logo team and no-logo team reserve the same xs slot",
  );
  assert(withLogo.includes("aria-hidden"), "empty slot is not announced");
  assert(
    !withLogo.includes("Kein Logo") &&
      !withLogo.includes("title=") &&
      !withLogo.includes("slice(0, 1)"),
    "no visible letter-tile placeholder markup in TeamNameWithLogo",
  );
  assert(
    !withLogo.includes("resolveApplicationParticipantLogoUrl") &&
      !withLogo.includes("resolveParticipantLogoUrl") &&
      !withLogo.includes("teamMarks"),
    "TeamNameWithLogo remains ID-agnostic presentation component",
  );

  // 1 + 2: schedule wiring — logo when mark present; text always
  assert(schedule.includes("teamMarks"), "Spielplan accepts teamMarks");
  assert(schedule.includes("<MatchSidesScoreBlock"), "Spielplan renders shared match sides");
  assert(schedule.includes("home={home}"), "home side passed to match block");
  assert(schedule.includes("away={away}"), "away side passed to match block");
  assert(
    schedule.includes('match.status === "completed"') &&
      schedule.includes("homeScore={match.homeScore}") &&
      schedule.includes("awayScore={match.awayScore}"),
    "score/status presentation intact via prepared match scores",
  );
  const matchBlock = read("src/components/tournaments/MatchSidesScoreBlock.tsx");
  assert(
    matchBlock.includes("shrink-0") && matchBlock.includes("min-w-0"),
    "mobile flex guards on match side rows",
  );
  assert(
    !schedule.includes("resolveApplicationParticipantLogoUrl") &&
      !schedule.includes("resolveParticipantLogoUrl") &&
      !schedule.includes(".find((") &&
      !/clubName\s*===/.test(schedule) &&
      !/teamName\s*===/.test(schedule),
    "no name-based logo lookup in Spielplan",
  );

  // Standings: shared aligned name+logo, computation untouched
  assert(standings.includes("<TeamNameWithLogo"), "standings use shared aligned primitive");
  assert(standings.includes("teamMarks?.[row.applicationId]"), "ID-keyed standings marks");
  assert(standings.includes("label={label}"), "standings textual name retained");
  assert(
    !standingsLogic.includes("logoUrl") && !standingsLogic.includes("ParticipantClubLogo"),
    "standings computation untouched by logos",
  );
  const memberIds = ["a", "b"];
  const computed = computeGroupStandings(memberIds, []);
  assert(computed.length === 2, "standings still computes empty rows");
  assert(computed[0]?.points === 0 && computed[1]?.points === 0, "standings math unchanged");

  // Qualification untouched
  assert(
    !knockoutLogic.includes("TeamNameWithLogo") &&
      !knockoutLogic.includes("ParticipantClubLogo") &&
      knockoutLogic.includes("export function qualifyTopTwo"),
    "qualification computation has no logo coupling",
  );
  const qualified = qualifyTopTwo([{ id: "g1" }], {
    g1: [
      {
        applicationId: "a",
        rank: 1,
        played: 1,
        won: 1,
        drawn: 0,
        lost: 0,
        goalsFor: 2,
        goalsAgainst: 0,
        goalDiff: 2,
        points: 3,
      },
      {
        applicationId: "b",
        rank: 2,
        played: 1,
        won: 0,
        drawn: 0,
        lost: 1,
        goalsFor: 0,
        goalsAgainst: 2,
        goalDiff: -2,
        points: 0,
      },
    ],
  });
  assert(
    qualified[0]?.applicationId === "a" && qualified[1]?.applicationId === "b",
    "qualification computation untouched",
  );

  // KO presentation + identity
  assert(knockout.includes("<MatchSidesScoreBlock"), "KO uses shared match sides");
  assert(knockout.includes("match.home"), "KO textual home side retained");
  assert(knockout.includes("<TournamentPlacementsList"), "KO placements list retained");
  const placementsListSrc = read("src/components/tournaments/TournamentPlacementsList.tsx");
  assert(placementsListSrc.includes("{row.place}."), "placement rank numbering retained");
  assert(
    !knockoutLogic.includes("TeamNameWithLogo") &&
      !knockoutLogic.includes("ParticipantClubLogo"),
    "KO participant identity logic untouched",
  );
  const outcome = resolveKnockoutOutcome({
    homeApplicationId: "h",
    awayApplicationId: "a",
    homeScore: 1,
    awayScore: 0,
    status: "completed",
    round: "final",
  });
  assert(outcome.winnerId === "h" && outcome.loserId === "a", "KO winner/loser identity intact");

  // Stage wiring: ID-keyed teamMarks, placements, schedule
  assert(stage.includes("teamMarks={teamMarks}"), "stage passes teamMarks to standings");
  assert(
    stage.includes("<TournamentScheduleCards") && stage.includes("teamMarks={teamMarks}"),
    "stage passes teamMarks to Spielplan",
  );
  assert(
    stage.includes("logoUrl: mark?.logoUrl ?? null") &&
      stage.includes("clubName: mark?.clubName ?? null"),
    "KO/placement views resolve marks by participant id",
  );
  assert(stage.includes("<PublicPlacements"), "overview placements retained");
  assert(stage.includes("teamMarks={teamMarks}"), "overview placements receive teamMarks");
  assert(
    !stage.includes("resolveApplicationParticipantLogoUrl") &&
      !stage.includes("resolveParticipantLogoUrl") &&
      !/Object\.values\(teamMarks\)\.find/.test(stage) &&
      !stage.includes("clubName ==="),
    "no name-based logo lookup in public stage",
  );

  // Placement ordering untouched
  const placed = computeKnockoutPlacements([
    {
      homeApplicationId: "f-home",
      awayApplicationId: "f-away",
      homeScore: 2,
      awayScore: 1,
      status: "completed",
      round: "final",
    },
    {
      homeApplicationId: "t-home",
      awayApplicationId: "t-away",
      homeScore: 3,
      awayScore: 0,
      status: "completed",
      round: "third-place",
    },
  ]);
  assert(
    placed.map((row) => row.place).join(",") === "1,2,3,4",
    "final placement ordering untouched",
  );

  // LIVE placements get logos from existing teamMap (no new queries)
  assert(liveKo.includes("logoUrl: team?.logoUrl ?? null"), "LIVE placements reuse teamMap logos");
  assert(liveKo.includes("clubName: team?.clubName ?? null"), "LIVE placements reuse clubName");

  // 3 + 4: authoritative resolvers unchanged
  assert(
    participants.includes("export function resolveApplicationParticipantLogoUrl") &&
      participants.includes("export function resolveParticipantLogoUrl"),
    "authoritative resolvers remain",
  );
  assert(
    resolveApplicationParticipantLogoUrl({
      logoManualOverride: true,
      applicationLogoUrl: "https://cdn.example/app.png",
      clubLogoUrl: "https://cdn.example/club.png",
    }) === "https://cdn.example/app.png",
    "application override wins",
  );
  assert(
    resolveApplicationParticipantLogoUrl({
      logoManualOverride: false,
      applicationLogoUrl: "https://cdn.example/app.png",
      clubLogoUrl: "https://cdn.example/club.png",
    }) === "https://cdn.example/club.png",
    "application without override uses club logo",
  );
  assert(
    resolveParticipantLogoUrl({
      hubClubLogoUrl: "https://cdn.example/hub.png",
      storedLogoUrl: "https://cdn.example/stored.png",
    }) === "https://cdn.example/hub.png",
    "external/manual prefers Hub club logo",
  );
  assert(
    resolveParticipantLogoUrl({
      hubClubLogoUrl: null,
      storedLogoUrl: "https://cdn.example/stored.png",
    }) === "https://cdn.example/stored.png",
    "external/manual falls back to stored logo",
  );

  // 5: no name-based lookup introduced in presentation files
  for (const [name, source] of [
    ["schedule", schedule],
    ["standings", standings],
    ["knockout", knockout],
    ["withLogo", withLogo],
  ] as const) {
    assert(
      !source.includes("find((entry) => entry.clubName") &&
        !source.includes("find((entry) => entry.teamName") &&
        !source.includes("find((p) => p.name"),
      `${name}: no name-based logo lookup`,
    );
  }

  // 9: missing logo never removes textual name (structural)
  assert(
    withLogo.includes("{label}") &&
      !withLogo.includes("if (!logoUrl) return null") &&
      !withLogo.includes("if (!trimmed) return null"),
    "missing logo never removes textual name",
  );

  // 10: no private field exposure in presentation
  for (const source of [schedule, standings, knockout, withLogo, stage]) {
    assert(
      !source.includes("service_role") &&
        !source.includes("SERVICE_ROLE") &&
        !source.includes("email") &&
        !source.includes("phone") &&
        !source.includes("contactEmail"),
      "no unintended private fields in logo presentation",
    );
  }

  // Admin: no forced logo expansion (labels-only boards remain)
  assert(
    !adminSchedule.includes("TeamNameWithLogo") &&
      !adminResults.includes("TeamNameWithLogo") &&
      !adminKo.includes("TeamNameWithLogo"),
    "admin Spielplan/Ergebnisse/KO not expanded without available marks",
  );

  return "ok";
}

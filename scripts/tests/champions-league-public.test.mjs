import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  championsLeagueQualificationBand,
  championsLeagueQualificationLabel,
  isChampionsLeaguePhaseComplete,
} from "../../src/lib/tournaments/champions-league-public.ts";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("marks exactly the configured top four or top eight qualification places", () => {
  assert.equal(championsLeagueQualificationBand(4, 4), "knockout");
  assert.equal(championsLeagueQualificationBand(5, 4), "outside");
  assert.equal(championsLeagueQualificationBand(8, 8), "knockout");
  assert.equal(championsLeagueQualificationBand(9, 8), "outside");
});

test("keeps qualification provisional until every configured league match is complete", () => {
  const finished = { status: "completed", homeScore: 2, awayScore: 1 };
  assert.equal(
    isChampionsLeaguePhaseComplete({
      standings: [{ played: 3 }, { played: 3 }, { played: 3 }, { played: 3 }],
      matches: [finished, finished, finished, finished, finished, finished],
      matchesPerTeam: 3,
    }),
    true,
  );
  assert.equal(
    isChampionsLeaguePhaseComplete({
      standings: [{ played: 2 }, { played: 2 }],
      matches: [{ status: "scheduled", homeScore: null, awayScore: null }],
      matchesPerTeam: 3,
    }),
    false,
  );
  assert.match(
    championsLeagueQualificationLabel({ complete: false, knockoutCutoff: 8 }),
    /aktueller K\.-o\.-Qualifikationsplatz/,
  );
});

test("public route detects stored CL mode with the safe missing-column fallback", () => {
  const page = read("src/app/turniere/[slug]/page.tsx");
  const stage = read("src/components/tournaments/TournamentPublicStage.tsx");

  assert.match(page, /readStoredLeagueScheduleConfig\(tournament\.id\)/);
  assert.match(page, /leagueConfig\.status === "ok"/);
  assert.match(page, /competitionFormat: null/);
  assert.match(stage, /competitionFormat === "champions-league"/);
  assert.match(stage, /ChampionsLeagueStandings/);
  assert.match(stage, /ChampionsLeagueSchedule/);
});

test("CL public components stay read-only and classic presenters remain wired", () => {
  const schedule = read("src/components/tournaments/ChampionsLeagueSchedule.tsx");
  const standings = read("src/components/tournaments/ChampionsLeagueStandings.tsx");
  const stage = read("src/components/tournaments/TournamentPublicStage.tsx");
  const combined = `${schedule}\n${standings}`;

  assert.doesNotMatch(combined, /createClient|use server|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  assert.match(schedule, /Alle Mannschaften/);
  assert.match(schedule, /Alle Spielfelder/);
  assert.match(schedule, /Alle Status/);
  assert.match(standings, /goalsAgainst/);
  assert.match(stage, /TournamentGroupCards/);
  assert.match(stage, /TournamentStandingsSection/);
  assert.match(stage, /TournamentScheduleCards/);
});

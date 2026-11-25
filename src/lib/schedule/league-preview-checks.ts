import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildTournamentPlanPreview,
  previewParticipantKey,
  type PlanPreviewMatch,
} from "@/lib/schedule/plan-preview";
import { expectedGroupMatchCount } from "@/lib/schedule/round-robin";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`league-preview-checks: ${message}`);
  }
}

function ids(count: number) {
  return Array.from({ length: count }, (_, index) => `t${index + 1}`);
}

function participants(count: number) {
  return ids(count).map((id) => ({ applicationId: id, externalTeamId: null }));
}

function fields(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `field-${index + 1}`,
    name: `Platz ${index + 1}`,
  }));
}

function timing() {
  return {
    startIso: "2026-12-27T08:00:00.000Z",
    durationMinutes: 12,
    breakMinutes: 3,
    minimumRestMinutes: 15,
    lunchStartIso: null,
    lunchEndIso: null,
  };
}

function previewLeague(teamCount: number, matchesPerTeam: number, knockoutCutoff: 4 | 8, fieldCount: number) {
  const teamIds = ids(teamCount);
  return buildTournamentPlanPreview({
    mode: "champions-league",
    participants: participants(teamCount),
    fields: fields(fieldCount),
    timing: timing(),
    championsLeague: {
      participantIds: teamIds,
      matchesPerTeam,
      knockoutCutoff,
    },
  });
}

function pairKey(match: PlanPreviewMatch) {
  const home = previewParticipantKey(match.home) ?? "";
  const away = previewParticipantKey(match.away) ?? "";
  return home < away ? `${home}|${away}` : `${away}|${home}`;
}

function degrees(teamIds: string[], matches: PlanPreviewMatch[]) {
  const played = new Map(teamIds.map((id) => [id, 0]));
  for (const match of matches) {
    const home = previewParticipantKey(match.home);
    const away = previewParticipantKey(match.away);
    if (home) {
      played.set(home, (played.get(home) ?? 0) + 1);
    }
    if (away) {
      played.set(away, (played.get(away) ?? 0) + 1);
    }
  }
  return played;
}

function assertNoOverlap(matches: PlanPreviewMatch[]) {
  const byTeam = new Map<string, Array<{ start: number; end: number }>>();
  for (const match of matches) {
    if (!match.scheduledAt) {
      continue;
    }
    const start = Date.parse(match.scheduledAt);
    const end = start + match.durationMinutes * 60_000;
    for (const teamId of [previewParticipantKey(match.home), previewParticipantKey(match.away)]) {
      if (!teamId) {
        continue;
      }
      const slots = byTeam.get(teamId) ?? [];
      for (const slot of slots) {
        assert(end <= slot.start || start >= slot.end, `${teamId} is booked twice at once`);
      }
      slots.push({ start, end });
      byTeam.set(teamId, slots);
    }
  }
}

function assertLeagueSchedule(teamCount: number, matchesPerTeam: number, cutoff: 4 | 8) {
  const teamIds = ids(teamCount);
  const preview = previewLeague(teamCount, matchesPerTeam, cutoff, 3);
  const expected = (teamCount * matchesPerTeam) / 2;
  assert(preview.mode === "champions-league", `${teamCount}: mode`);
  assert(preview.summary.participantCount === teamCount, `${teamCount}: participants`);
  assert(preview.summary.matchesPerParticipant === matchesPerTeam, `${teamCount}: matches per team`);
  assert(preview.summary.knockoutCutoff === cutoff, `${teamCount}: cutoff`);
  assert(preview.summary.expectedLeagueMatchCount === expected, `${teamCount}: expected`);
  assert(preview.summary.scheduledLeagueMatchCount === expected, `${teamCount}: scheduled`);
  assert(preview.summary.groupMatchCount === expected, `${teamCount}: group count`);
  assert(preview.matches.length === expected, `${teamCount}: fixture rows`);
  assert(preview.warnings.every((warning) => warning.code !== "TIMETABLE_INCOMPLETE"), `${teamCount}: complete timetable`);
  assert(preview.matches.every((match) => match.scheduledAt && match.fieldId), `${teamCount}: every match placed`);
  assert(new Set(preview.matches.map(pairKey)).size === preview.matches.length, `${teamCount}: distinct opponents`);
  const played = degrees(teamIds, preview.matches);
  for (const teamId of teamIds) {
    assert(played.get(teamId) === matchesPerTeam, `${teamCount}: degree ${teamId}`);
  }
  assertNoOverlap(preview.matches);
  return preview;
}

export function runChampionsLeaguePreviewChecks() {
  const prepare = read("src/lib/db/plan-preview-prepare.ts");
  const apply = read("src/lib/db/plan-apply-actions.ts");
  const cli = read("src/lib/schedule/run-checks-cli.ts");
  assert(
    prepare.includes("resolveGenerationMode") &&
      prepare.indexOf("resolveGenerationMode") < prepare.indexOf("buildTournamentPlanPreview") &&
      !prepare.includes('mode: "champions-league"'),
    "database preview preparation blocks Champions League before building a preview",
  );
  assert(!apply.includes("champions-league") && !apply.includes("buildLeagueFixtures"), "apply path stays unchanged");
  assert(cli.includes("runChampionsLeaguePreviewChecks"), "preview checks wired into run-checks-cli");

  const eight = assertLeagueSchedule(8, 3, 4);
  assert(eight.summary.expectedLeagueMatchCount === 12, "8 x 3 is 12 matches");
  assert(eight.koPlan == null, "league preview does not invent knockout matches");

  const twelve = assertLeagueSchedule(12, 5, 8);
  assert(twelve.summary.expectedLeagueMatchCount === 30, "12 x 5 is 30 matches");

  const nine = assertLeagueSchedule(9, 4, 4);
  assert(nine.summary.expectedLeagueMatchCount === 18, "9 x 4 is 18 matches");
  const nineKickoffs = new Map<string, number>();
  for (const match of nine.matches) {
    for (const teamId of [previewParticipantKey(match.home), previewParticipantKey(match.away)]) {
      if (!teamId || !match.scheduledAt) {
        continue;
      }
      const key = `${teamId}|${match.scheduledAt}`;
      nineKickoffs.set(key, (nineKickoffs.get(key) ?? 0) + 1);
      assert(nineKickoffs.get(key) === 1, "odd league has no simultaneous double booking");
    }
  }

  const uneven = previewLeague(9, 3, 8, 2);
  assert(uneven.matches.length === 0, "odd times odd produces no fixtures");
  assert(
    uneven.warnings.some(
      (warning) => warning.code === "LEAGUE_CONFIG_INVALID" && warning.context?.code === "UNEVEN_MATCH_TOTAL",
    ),
    "9 x 3 is rejected",
  );
  assert(uneven.summary.scheduledLeagueMatchCount === 0, "invalid config schedules nothing");

  const tooSmall = previewLeague(6, 2, 8, 2);
  assert(tooSmall.matches.length === 0, "too few teams produce no fixtures");
  assert(
    tooSmall.warnings.some(
      (warning) => warning.code === "LEAGUE_CONFIG_INVALID" && warning.context?.code === "CUTOFF_EXCEEDS_TEAMS",
    ),
    "6 teams cannot fill 8 places",
  );

  const incomplete = previewLeague(8, 3, 4, 0);
  assert(incomplete.summary.expectedLeagueMatchCount === 12, "incomplete preview keeps the expected count");
  assert(incomplete.summary.scheduledLeagueMatchCount === 0, "no field means nothing is scheduled");
  assert(incomplete.matches.length === 12, "unplaced league matches stay visible");
  assert(incomplete.matches.every((match) => match.scheduledAt == null && match.fieldId == null), "unplaced matches have no kickoff");
  assert(
    incomplete.warnings.some(
      (warning) =>
        warning.code === "TIMETABLE_INCOMPLETE" &&
        warning.context?.expected === 12 &&
        warning.context.scheduled === 0,
    ),
    "incomplete placement is marked with counts",
  );

  const roundRobin = buildTournamentPlanPreview({
    mode: "round-robin",
    participants: participants(4),
    fields: fields(1),
    timing: timing(),
    championsLeague: {
      participantIds: ids(4),
      matchesPerTeam: 1,
      knockoutCutoff: 4,
    },
  });
  assert(roundRobin.mode === "round-robin", "round robin stays round robin");
  assert(roundRobin.summary.groupMatchCount === 6, "round robin of 4 teams stays 6 matches");
  assert(roundRobin.summary.matchesPerParticipant == null, "round robin does not adopt league summary fields");

  const grouped = buildTournamentPlanPreview({
    mode: "groups-knockout",
    participants: participants(8),
    groups: [
      { key: "g1", name: "Gruppe A", participantIds: ids(8).slice(0, 4) },
      { key: "g2", name: "Gruppe B", participantIds: ids(8).slice(4) },
    ],
    fields: fields(2),
    timing: timing(),
  });
  assert(grouped.mode === "groups-knockout", "groups mode stays groups");
  assert(grouped.summary.groupMatchCount === 12, "two groups of 4 stay at 12 matches");

  const singleGroup = buildTournamentPlanPreview({
    mode: "groups-knockout",
    participants: participants(8),
    groups: [{ key: "g1", name: "Gruppe A", participantIds: ids(8) }],
    fields: fields(2),
    timing: timing(),
  });
  assert(singleGroup.mode === "groups-knockout", "one group is not inferred as Champions League");
  assert(
    singleGroup.summary.groupMatchCount === expectedGroupMatchCount(8),
    "one existing group remains a full round robin",
  );

  return "ok";
}

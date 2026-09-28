import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildTournamentPlanPreview,
  canRegenerateGroupSchedule,
  fingerprintCanonicalJson,
  isResolvedPreviewParticipant,
  isUnresolvedPreviewParticipant,
  normalizePreviewParticipant,
  previewParticipantKey,
  type PlanPreviewParticipantRef,
} from "@/lib/schedule/plan-preview";
import { expectedGroupMatchCount } from "@/lib/schedule/round-robin";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`plan-preview-checks: ${message}`);
  }
}

function participant(id: string, kind: "application" | "external" = "application") {
  return kind === "application"
    ? { applicationId: id, externalTeamId: null }
    : { applicationId: null, externalTeamId: id };
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

function ids(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
}

function chunkIds(all: string[], groupCount: number) {
  const size = all.length / groupCount;
  assert(Number.isInteger(size), "group chunks must be even");
  return Array.from({ length: groupCount }, (_, index) =>
    all.slice(index * size, (index + 1) * size),
  );
}

function pairingKey(home: PlanPreviewParticipantRef, away: PlanPreviewParticipantRef) {
  const a = previewParticipantKey(home);
  const b = previewParticipantKey(away);
  assert(a && b, "pairing requires resolved participants");
  return [a, b].sort().join("|");
}

function assertNoSelfPlay(matches: Array<{ home: PlanPreviewParticipantRef; away: PlanPreviewParticipantRef }>) {
  for (const match of matches) {
    assert(
      previewParticipantKey(match.home) !== previewParticipantKey(match.away),
      "self-play detected",
    );
  }
}

function assertNoDuplicatePairings(
  matches: Array<{
    groupKey: string;
    home: PlanPreviewParticipantRef;
    away: PlanPreviewParticipantRef;
  }>,
) {
  const seen = new Set<string>();
  for (const match of matches) {
    const key = `${match.groupKey}:${pairingKey(match.home, match.away)}`;
    assert(!seen.has(key), `duplicate pairing ${key}`);
    seen.add(key);
  }
}

function assertNoDoubleBooking(
  matches: Array<{
    home: PlanPreviewParticipantRef;
    away: PlanPreviewParticipantRef;
    scheduledAt: string | null;
    fieldId: string | null;
  }>,
) {
  const byKickoff = new Map<string, string[]>();
  for (const match of matches) {
    if (!match.scheduledAt) {
      continue;
    }
    const home = previewParticipantKey(match.home);
    const away = previewParticipantKey(match.away);
    assert(home && away, "double-booking check needs resolved sides");
    const list = byKickoff.get(match.scheduledAt) ?? [];
    assert(!list.includes(home), `double-booked ${home} at ${match.scheduledAt}`);
    assert(!list.includes(away), `double-booked ${away} at ${match.scheduledAt}`);
    list.push(home, away);
    byKickoff.set(match.scheduledAt, list);

    if (match.fieldId) {
      const fieldKey = `${match.scheduledAt}|${match.fieldId}`;
      const fieldList = byKickoff.get(fieldKey) ?? [];
      assert(fieldList.length === 0, `field conflict ${fieldKey}`);
      byKickoff.set(fieldKey, ["used"]);
    }
  }
}

function assertXorParticipants(
  refs: PlanPreviewParticipantRef[],
) {
  for (const ref of refs) {
    assert(isResolvedPreviewParticipant(ref), "participant must be XOR-resolved");
    assert(
      !(ref.applicationId && ref.externalTeamId),
      "participant must never carry both identities",
    );
  }
}

function runRoundRobinCases() {
  const four = ids("t", 4).map((id) => participant(id));
  const preview1 = buildTournamentPlanPreview({
    mode: "round-robin",
    participants: four,
    fields: fields(1),
    timing: timing(),
  });
  assert(preview1.summary.groupMatchCount === 6, "4 teams / 1 field => 6 matches");
  assert(preview1.summary.totalMatchCount === 6, "RR total matches");
  assertNoSelfPlay(preview1.matches);
  assertNoDuplicatePairings(preview1.matches);
  assertNoDoubleBooking(preview1.matches);
  assertXorParticipants(preview1.matches.flatMap((match) => [match.home, match.away]));

  const preview2 = buildTournamentPlanPreview({
    mode: "round-robin",
    participants: four,
    fields: fields(2),
    timing: timing(),
  });
  assert(preview2.summary.groupMatchCount === 6, "4 teams / 2 fields => 6 matches");
  assertNoDoubleBooking(preview2.matches);

  const five = ids("t", 5).map((id) => participant(id));
  const preview5 = buildTournamentPlanPreview({
    mode: "round-robin",
    participants: five,
    fields: fields(1),
    timing: timing(),
  });
  assert(preview5.summary.groupMatchCount === 10, "5 teams / bye => 10 matches");
  assert(
    preview5.summary.groupMatchCount === expectedGroupMatchCount(5),
    "bye match count matches expectedGroupMatchCount",
  );
  assertNoSelfPlay(preview5.matches);
  assertNoDuplicatePairings(preview5.matches);
}

function runGroupsCases() {
  const eight = ids("t", 8);
  const eightGroups = chunkIds(eight, 2).map((participantIds, index) => ({
    key: `g${index + 1}`,
    name: `Gruppe ${index + 1}`,
    participantIds,
  }));
  const preview8 = buildTournamentPlanPreview({
    mode: "groups-knockout",
    participants: eight.map((id) => participant(id)),
    groups: eightGroups,
    fields: fields(2),
    timing: timing(),
    knockout: { format: 4, includeThirdPlace: true },
  });
  assert(preview8.summary.groupMatchCount === 12, "8 teams / 2 groups => 12 group matches");
  assert(preview8.qualifierPlan.firstRoundPairings.length === 2, "format-4 pairings");
  assert(
    preview8.qualifierPlan.firstRoundPairings[0]?.homeSeed === "A1" &&
      preview8.qualifierPlan.firstRoundPairings[0]?.awaySeed === "B2",
    "A1 vs B2 pairing",
  );
  assert(preview8.koPlan != null && preview8.koPlan.length >= 3, "KO plan present");
  assert(
    preview8.koPlan!.some(
      (match) =>
        match.round === "semifinal" &&
        match.homeSeed === "A1" &&
        match.awaySeed === "B2",
    ),
    "logical KO seed sides",
  );
  assert(
    preview8.koPlan!.some(
      (match) =>
        match.round === "final" &&
        match.homeSeed == null &&
        match.awaySeed == null,
    ),
    "unresolved later KO rounds stay logical-null (not fake participants)",
  );
  assertNoSelfPlay(preview8.matches);
  assertNoDuplicatePairings(preview8.matches);
  assertNoDoubleBooking(preview8.matches);

  const twelve = ids("t", 12);
  const preview12 = buildTournamentPlanPreview({
    mode: "groups-knockout",
    participants: twelve.map((id) => participant(id)),
    groups: chunkIds(twelve, 3).map((participantIds, index) => ({
      key: `g${index + 1}`,
      participantIds,
    })),
    fields: fields(2),
    timing: timing(),
  });
  assert(preview12.summary.groupMatchCount === 18, "12 teams / 3 groups => 18");

  const sixteen = ids("t", 16);
  const preview16 = buildTournamentPlanPreview({
    mode: "groups-knockout",
    participants: sixteen.map((id) => participant(id)),
    groups: chunkIds(sixteen, 4).map((participantIds, index) => ({
      key: `g${index + 1}`,
      participantIds,
    })),
    fields: fields(3),
    timing: timing(),
    knockout: { format: 8, includeThirdPlace: true },
  });
  assert(preview16.summary.groupMatchCount === 24, "16 teams / 4 groups => 24");
  assert(preview16.qualifierPlan.firstRoundPairings.length === 4, "format-8 pairings");
  assert(preview16.koPlan != null && preview16.koPlan.length >= 7, "format-8 KO plan");
}

function runDeterminismAndFingerprint() {
  const participants = ids("t", 4).map((id) => participant(id));
  const input = {
    mode: "round-robin" as const,
    participants,
    fields: fields(1),
    timing: timing(),
  };
  const a = buildTournamentPlanPreview(input);
  const b = buildTournamentPlanPreview(input);
  assert(a.inputFingerprint === b.inputFingerprint, "same input => same fingerprint");
  assert(JSON.stringify(a.matches) === JSON.stringify(b.matches), "deterministic matches");
  assert(JSON.stringify(a) === JSON.stringify(b), "full preview deterministic JSON");

  const shuffledParticipants = [...participants].reverse();
  const c = buildTournamentPlanPreview({
    ...input,
    participants: shuffledParticipants,
  });
  // Normalization sorts participants; fingerprint of raw input differs, preview matches align after normalize.
  assert(
    c.summary.groupMatchCount === a.summary.groupMatchCount,
    "normalized participant order still yields same match count",
  );

  const different = buildTournamentPlanPreview({
    ...input,
    fields: fields(2),
  });
  assert(
    different.inputFingerprint !== a.inputFingerprint,
    "plan-changing input changes fingerprint",
  );

  assert(
    fingerprintCanonicalJson({ b: 1, a: 2 }) ===
      fingerprintCanonicalJson({ a: 2, b: 1 }),
    "canonical fingerprint ignores object key order",
  );
}

function runDualIdentityCases() {
  const mixed = [
    participant("app-1", "application"),
    participant("ext-1", "external"),
    participant("app-2", "application"),
    participant("ext-2", "external"),
  ];
  const preview = buildTournamentPlanPreview({
    mode: "round-robin",
    participants: mixed,
    fields: fields(1),
    timing: timing(),
  });
  assertXorParticipants(preview.memberships.map((item) => item.participant));
  assertXorParticipants(preview.matches.flatMap((match) => [match.home, match.away]));

  const both = normalizePreviewParticipant({
    applicationId: "app",
    externalTeamId: "ext",
  });
  assert(both == null, "both identities rejected");

  const unresolved = { applicationId: null, externalTeamId: null };
  assert(isUnresolvedPreviewParticipant(unresolved), "unresolved null/null");
  assert(!isResolvedPreviewParticipant(unresolved), "unresolved is not resolved");

  // Qualifier slots are logical labels, not participant refs.
  const groupsPreview = buildTournamentPlanPreview({
    mode: "groups-knockout",
    participants: ids("t", 8).map((id) => participant(id)),
    groups: chunkIds(ids("t", 8), 2).map((participantIds, index) => ({
      key: `g${index + 1}`,
      participantIds,
    })),
    fields: fields(1),
    timing: timing(),
    knockout: { format: 4 },
  });
  for (const slot of groupsPreview.qualifierPlan.slots) {
    assert(typeof slot.seedLabel === "string", "seed label present");
    assert(
      !("applicationId" in slot) && !("externalTeamId" in slot),
      "qualifier slot must not look like participant identity",
    );
  }
  for (const match of groupsPreview.koPlan ?? []) {
    if (match.homeSeed == null && match.awaySeed == null) {
      // later rounds: logical unresolved, not fake XOR participant
      continue;
    }
    assert(
      typeof match.homeSeed === "string" || match.homeSeed == null,
      "KO home is seed label",
    );
  }
}

function runRegenerationPolicyCases() {
  const empty = canRegenerateGroupSchedule({ groupCount: 0, matches: [] });
  assert(empty.state === "EMPTY" && empty.decision === "allowed", "A empty allowed");

  const groupsOnly = canRegenerateGroupSchedule({ groupCount: 2, matches: [] });
  assert(
    groupsOnly.state === "GROUPS_ONLY" && groupsOnly.decision === "allowed",
    "A groups-only allowed",
  );

  const scheduleNoResults = canRegenerateGroupSchedule({
    groupCount: 2,
    matches: [{ phase: "group", status: "scheduled", homeScore: null, awayScore: null }],
  });
  assert(
    scheduleNoResults.state === "SCHEDULE_NO_RESULTS" &&
      scheduleNoResults.decision === "allowedWithConfirmation",
    "B schedule no results confirmation",
  );

  const result10 = canRegenerateGroupSchedule({
    groupCount: 2,
    matches: [{ phase: "group", status: "completed", homeScore: 1, awayScore: 0 }],
  });
  assert(result10.state === "RESULTS_EXIST" && result10.decision === "blocked", "C 1-0 blocked");

  const result00 = canRegenerateGroupSchedule({
    groupCount: 2,
    matches: [{ phase: "group", status: "completed", homeScore: 0, awayScore: 0 }],
  });
  assert(
    result00.state === "RESULTS_EXIST" && result00.decision === "blocked",
    "D completed 0-0 blocked (status-based, not truthiness)",
  );

  const live = canRegenerateGroupSchedule({
    groupCount: 2,
    matches: [{ phase: "group", status: "live", homeScore: null, awayScore: null }],
  });
  assert(live.state === "LIVE" && live.decision === "blocked", "E live blocked");

  const koStarted = canRegenerateGroupSchedule({
    groupCount: 2,
    matches: [
      { phase: "group", status: "scheduled", homeScore: null, awayScore: null },
      { phase: "knockout", status: "scheduled", homeScore: null, awayScore: null },
    ],
  });
  assert(koStarted.state === "KO_STARTED" && koStarted.decision === "blocked", "F KO blocked");

  const completed = canRegenerateGroupSchedule({
    tournamentStatus: "completed",
    groupCount: 2,
    matches: [],
  });
  assert(
    completed.state === "COMPLETED" && completed.decision === "blocked",
    "G completed tournament blocked",
  );

  const ambiguous = canRegenerateGroupSchedule({
    groupCount: Number.NaN,
    matches: [],
  });
  assert(
    ambiguous.state === "AMBIGUOUS" && ambiguous.decision === "blocked",
    "H ambiguous blocked",
  );
}

function runStructuralChecks() {
  const previewSource = read("src/lib/schedule/plan-preview.ts");
  const checksSource = read("src/lib/schedule/plan-preview-checks.ts");
  const scheduleActions = read("src/lib/db/schedule-actions.ts");
  const knockoutActions = read("src/lib/db/knockout-actions.ts");
  const runChecksCli = read("src/lib/schedule/run-checks-cli.ts");
  const syncActions = read("src/lib/db/mein-turnierplan-sync-actions.ts");
  const publicSource = read("src/lib/mein-turnierplan-public-source.ts");
  const adminForm = read("src/components/admin/TournamentAdminForm.tsx");

  assert(
    !previewSource.includes("from \"@supabase") &&
      !previewSource.includes("from '@supabase") &&
      !previewSource.includes("createClient") &&
      !previewSource.includes("createServerClient"),
    "preview module has no Supabase client dependency",
  );
  assert(
    !previewSource.includes("mein-turnierplan-api") &&
      !previewSource.includes("sync_mein_turnierplan") &&
      !previewSource.includes("live_data_source") &&
      !previewSource.includes("showsMeinTurnierplanLiveTab"),
    "preview module has no MTP / live_data_source dependency",
  );
  assert(
    !previewSource.includes("from \"react") &&
      !previewSource.includes("use client") &&
      !previewSource.includes("server-only"),
    "preview module stays pure (no React / server-only)",
  );
  assert(
    !previewSource.includes("generateTournamentScheduleAction") &&
      !previewSource.includes("generateKnockoutAction") &&
      !previewSource.includes("schedule-actions") &&
      !previewSource.includes("knockout-actions"),
    "preview module is not wired into generation actions",
  );
  const forbiddenImportRoots = [
    ["@", "/", "app", "/"].join(""),
    ["@", "/", "components", "/", "tournaments", "/"].join(""),
    ["@", "/", "components", "/", "admin", "/"].join(""),
  ];
  for (const root of forbiddenImportRoots) {
    const fromDouble = `from "${root}`;
    const fromSingle = `from '${root}`;
    assert(
      !previewSource.includes(fromDouble) && !previewSource.includes(fromSingle),
      `preview module must not import ${root}`,
    );
    assert(
      !checksSource.includes(fromDouble) && !checksSource.includes(fromSingle),
      `checks module must not import ${root}`,
    );
  }

  // Existing production actions unchanged by C6-A (no canRegenerateGroupSchedule wiring).
  assert(
    !scheduleActions.includes("canRegenerateGroupSchedule") &&
      !scheduleActions.includes("buildTournamentPlanPreview") &&
      !scheduleActions.includes("plan-preview"),
    "schedule-actions not wired to C6-A yet",
  );
  assert(
    !knockoutActions.includes("canRegenerateGroupSchedule") &&
      !knockoutActions.includes("buildTournamentPlanPreview") &&
      !knockoutActions.includes("plan-preview"),
    "knockout-actions not wired to C6-A",
  );

  assert(
    syncActions.includes("MEIN_TURNIERPLAN_COMPETITION_SYNC_DISABLED_MESSAGE") &&
      syncActions.includes("error: MEIN_TURNIERPLAN_COMPETITION_SYNC_DISABLED_MESSAGE"),
    "B1-A confirm sync block intact",
  );
  assert(
    publicSource.includes("HUB_ONLY_TAB") &&
      !publicSource.includes('source: "mein-turnierplan"'),
    "B1-B1 Hub authority intact",
  );
  assert(
    adminForm.includes('label="Live-Darstellung"') &&
      adminForm.includes('<option value="hub">Nur Hub</option>'),
    "B1-B2 terminology intact",
  );

  assert(
    runChecksCli.includes("runPlanPreviewChecks") &&
      runChecksCli.includes("plan-preview-checks"),
    "C6-A suite wired into run-checks-cli",
  );

  // No migration in C6-A scope: preview module must not reference migrations paths as runtime deps.
  assert(
    !previewSource.includes("supabase/migrations"),
    "preview module does not reference migrations",
  );
}

/**
 * C6-A pure plan/preview foundation checks.
 * Unit coverage + structural freeze (no DB/UI/action wiring).
 */
export function runPlanPreviewChecks() {
  runRoundRobinCases();
  runGroupsCases();
  runDeterminismAndFingerprint();
  runDualIdentityCases();
  runRegenerationPolicyCases();
  runStructuralChecks();
  return "ok";
}

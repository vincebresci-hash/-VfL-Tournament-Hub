/**
 * C6-A: Pure deterministic tournament plan preview.
 * No DB writes, no Supabase, no React, no server actions.
 * Composes existing round-robin / timetable / KO seed helpers.
 */

import {
  expectedGroupMatchCount,
  hasSelfPlay,
  interleaveGroupFixtures,
  roundRobinFixtures,
} from "@/lib/schedule/round-robin";
import { buildTimetable, type ScheduleField, type TimetableSettings } from "@/lib/schedule/timetable";
import {
  defaultFirstRoundSeeds,
  type KnockoutFormat,
  type KnockoutOptions,
  type KnockoutRound,
  type KnockoutSlot,
} from "@/lib/schedule/knockout";
import type { MatchStatus } from "@/types/schedule";

export const PLAN_PREVIEW_MODES = ["round-robin", "groups-knockout"] as const;
export type PlanPreviewMode = (typeof PLAN_PREVIEW_MODES)[number];

export const PLAN_PREVIEW_WARNING_CODES = [
  "NO_PARTICIPANTS",
  "INSUFFICIENT_PARTICIPANTS",
  "EMPTY_GROUP",
  "GROUP_TOO_SMALL",
  "NO_FIELDS",
  "SELF_PLAY",
  "MATCH_COUNT_MISMATCH",
  "TIMETABLE_INCOMPLETE",
  "MINIMUM_REST_VIOLATION",
  "UNSUPPORTED_KO_GROUP_COUNT",
  "UNSUPPORTED_KO_FORMAT",
  "KO_PLAN_UNAVAILABLE",
] as const;

export type PlanPreviewWarningCode = (typeof PLAN_PREVIEW_WARNING_CODES)[number];

export type PlanPreviewWarning = {
  code: PlanPreviewWarningCode;
  message: string;
  context?: Record<string, string | number | boolean | null>;
};

/**
 * Resolved participant identity for persisted Hub schedule sides.
 * Exactly one of applicationId / externalTeamId must be set.
 */
export type PlanPreviewParticipantRef = {
  applicationId: string | null;
  externalTeamId: string | null;
};

/**
 * Preview-only logical qualifier (e.g. A1). Never a persisted identity.
 */
export type PlanPreviewQualifierSlot = {
  seedLabel: string;
  groupKey: string;
  groupIndex: number;
  rank: number;
};

export type PlanPreviewQualifierPairing = {
  homeSeed: string;
  awaySeed: string;
};

export type PlanPreviewGroup = {
  key: string;
  name: string;
  sortOrder: number;
};

export type PlanPreviewMembership = {
  groupKey: string;
  participant: PlanPreviewParticipantRef;
};

export type PlanPreviewMatch = {
  key: string;
  groupKey: string;
  home: PlanPreviewParticipantRef;
  away: PlanPreviewParticipantRef;
  fieldId: string | null;
  scheduledAt: string | null;
  durationMinutes: number;
  sortOrder: number;
  restWarning: boolean;
};

export type PlanPreviewKoMatch = {
  key: string;
  round: KnockoutRound;
  /** Logical seeds only — not persisted participant identity. */
  homeSeed: string | null;
  awaySeed: string | null;
  nextKey: string | null;
  nextSlot: KnockoutSlot | null;
  loserNextKey: string | null;
  loserNextSlot: KnockoutSlot | null;
  sortOrder: number;
};

export type PlanPreviewSummary = {
  participantCount: number;
  groupCount: number;
  groupMatchCount: number;
  koMatchCount: number;
  totalMatchCount: number;
  fieldCount: number;
  firstKickoff: string | null;
  estimatedLastKickoff: string | null;
  estimatedEnd: string | null;
  warningCount: number;
};

export type TournamentPlanPreview = {
  mode: PlanPreviewMode;
  groups: PlanPreviewGroup[];
  memberships: PlanPreviewMembership[];
  matches: PlanPreviewMatch[];
  qualifierPlan: {
    slots: PlanPreviewQualifierSlot[];
    firstRoundPairings: PlanPreviewQualifierPairing[];
  };
  koPlan: PlanPreviewKoMatch[] | null;
  warnings: PlanPreviewWarning[];
  summary: PlanPreviewSummary;
  inputFingerprint: string;
};

export type PlanPreviewParticipantInput = {
  applicationId?: string | null;
  externalTeamId?: string | null;
};

export type PlanPreviewGroupInput = {
  key?: string;
  name?: string;
  participantIds: string[];
};

export type PlanPreviewTimingInput = {
  startIso: string;
  durationMinutes: number;
  breakMinutes: number;
  minimumRestMinutes: number;
  lunchStartIso?: string | null;
  lunchEndIso?: string | null;
};

export type PlanPreviewKnockoutInput = {
  format: KnockoutFormat;
  includeThirdPlace?: boolean;
  includePlacement5?: boolean;
  includePlacement7?: boolean;
};

export type BuildTournamentPlanPreviewInput = {
  mode: PlanPreviewMode;
  participants: PlanPreviewParticipantInput[];
  /**
   * For round-robin: optional single group (defaults to one group of all participants).
   * For groups-knockout: required groups with member participant keys.
   */
  groups?: PlanPreviewGroupInput[];
  fields: ScheduleField[];
  timing: PlanPreviewTimingInput;
  knockout?: PlanPreviewKnockoutInput | null;
};

export const REGENERATION_DECISIONS = [
  "allowed",
  "allowedWithConfirmation",
  "blocked",
] as const;
export type RegenerationDecision = (typeof REGENERATION_DECISIONS)[number];

export const REGENERATION_STATES = [
  "EMPTY",
  "GROUPS_ONLY",
  "SCHEDULE_NO_RESULTS",
  "RESULTS_EXIST",
  "LIVE",
  "KO_STARTED",
  "COMPLETED",
  "AMBIGUOUS",
] as const;
export type RegenerationState = (typeof REGENERATION_STATES)[number];

export type RegenerationPolicyResult = {
  state: RegenerationState;
  decision: RegenerationDecision;
  reason: string;
};

export type RegenerationStageSnapshot = {
  tournamentStatus?: string | null;
  groupCount: number;
  matches: Array<{
    phase?: string | null;
    status?: string | null;
    homeScore?: number | null;
    awayScore?: number | null;
  }>;
};

function warn(
  code: PlanPreviewWarningCode,
  message: string,
  context?: PlanPreviewWarning["context"],
): PlanPreviewWarning {
  return context ? { code, message, context } : { code, message };
}

export function isResolvedPreviewParticipant(
  ref: PlanPreviewParticipantRef,
): boolean {
  const hasApp = Boolean(ref.applicationId);
  const hasExternal = Boolean(ref.externalTeamId);
  return hasApp !== hasExternal;
}

export function isUnresolvedPreviewParticipant(
  ref: PlanPreviewParticipantRef,
): boolean {
  return ref.applicationId == null && ref.externalTeamId == null;
}

export function normalizePreviewParticipant(
  input: PlanPreviewParticipantInput,
): PlanPreviewParticipantRef | null {
  const applicationId = input.applicationId?.trim() || null;
  const externalTeamId = input.externalTeamId?.trim() || null;
  if (applicationId && externalTeamId) {
    return null;
  }
  if (!applicationId && !externalTeamId) {
    return null;
  }
  return { applicationId, externalTeamId };
}

export function previewParticipantKey(ref: PlanPreviewParticipantRef): string | null {
  return ref.applicationId ?? ref.externalTeamId ?? null;
}

function groupLetter(index: number) {
  return "ABCDEFGH"[index] ?? String(index + 1);
}

function defaultGroupName(index: number) {
  return `Gruppe ${groupLetter(index)}`;
}

function seedLabelFor(groupIndex: number, rank: number) {
  return `${groupLetter(groupIndex)}${rank}`;
}

/** Portable deterministic fingerprint (FNV-1a 32-bit) over canonical JSON. */
export function fingerprintCanonicalJson(value: unknown): string {
  const json = canonicalize(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
    .join(",")}}`;
}

function normalizeParticipants(inputs: PlanPreviewParticipantInput[]) {
  const byKey = new Map<string, PlanPreviewParticipantRef>();
  const warnings: PlanPreviewWarning[] = [];

  for (const input of inputs) {
    const normalized = normalizePreviewParticipant(input);
    if (!normalized) {
      warnings.push(
        warn(
          "INSUFFICIENT_PARTICIPANTS",
          "Ein Teilnehmer hat keine gültige XOR-Identität (applicationId XOR externalTeamId).",
        ),
      );
      continue;
    }
    const key = previewParticipantKey(normalized);
    if (!key) {
      continue;
    }
    byKey.set(key, normalized);
  }

  const participants = [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, ref]) => ref);

  return { participants, warnings, byKey };
}

function resolveGroups(
  mode: PlanPreviewMode,
  participants: PlanPreviewParticipantRef[],
  groupInputs: PlanPreviewGroupInput[] | undefined,
  byKey: Map<string, PlanPreviewParticipantRef>,
): {
  groups: PlanPreviewGroup[];
  memberships: PlanPreviewMembership[];
  memberIdsByGroupKey: Record<string, string[]>;
  warnings: PlanPreviewWarning[];
} {
  const warnings: PlanPreviewWarning[] = [];

  if (mode === "round-robin") {
    const key = groupInputs?.[0]?.key?.trim() || "g1";
    const name = groupInputs?.[0]?.name?.trim() || defaultGroupName(0);
    const ids =
      groupInputs?.[0]?.participantIds?.length
        ? groupInputs[0].participantIds
        : participants.map((ref) => previewParticipantKey(ref)!);

    const memberships: PlanPreviewMembership[] = [];
    const memberIds: string[] = [];
    for (const id of ids) {
      const ref = byKey.get(id);
      if (!ref) {
        continue;
      }
      memberships.push({ groupKey: key, participant: ref });
      memberIds.push(id);
    }

    return {
      groups: [{ key, name, sortOrder: 0 }],
      memberships,
      memberIdsByGroupKey: { [key]: memberIds },
      warnings,
    };
  }

  const inputs = groupInputs ?? [];
  if (inputs.length === 0) {
    warnings.push(
      warn("EMPTY_GROUP", "Für Gruppen + KO muss mindestens eine Gruppe angegeben werden."),
    );
    return { groups: [], memberships: [], memberIdsByGroupKey: {}, warnings };
  }

  const groups: PlanPreviewGroup[] = [];
  const memberships: PlanPreviewMembership[] = [];
  const memberIdsByGroupKey: Record<string, string[]> = {};

  inputs.forEach((input, index) => {
    const key = input.key?.trim() || `g${index + 1}`;
    const name = input.name?.trim() || defaultGroupName(index);
    groups.push({ key, name, sortOrder: index });
    const memberIds: string[] = [];
    for (const id of input.participantIds) {
      const ref = byKey.get(id);
      if (!ref) {
        continue;
      }
      memberships.push({ groupKey: key, participant: ref });
      memberIds.push(id);
    }
    memberIdsByGroupKey[key] = memberIds;
    if (memberIds.length === 0) {
      warnings.push(
        warn("EMPTY_GROUP", `Gruppe ${name} hat keine Teilnehmer.`, { groupKey: key }),
      );
    } else if (memberIds.length < 2) {
      warnings.push(
        warn("GROUP_TOO_SMALL", `Gruppe ${name} braucht mindestens zwei Teams.`, {
          groupKey: key,
          memberCount: memberIds.length,
        }),
      );
    }
  });

  return { groups, memberships, memberIdsByGroupKey, warnings };
}

function buildQualifierPlan(groups: PlanPreviewGroup[]): TournamentPlanPreview["qualifierPlan"] {
  const slots: PlanPreviewQualifierSlot[] = [];
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (!group) {
      continue;
    }
    slots.push({
      seedLabel: seedLabelFor(index, 1),
      groupKey: group.key,
      groupIndex: index,
      rank: 1,
    });
    slots.push({
      seedLabel: seedLabelFor(index, 2),
      groupKey: group.key,
      groupIndex: index,
      rank: 2,
    });
  }

  const format: KnockoutFormat | null =
    groups.length === 2 ? 4 : groups.length === 4 ? 8 : null;
  const firstRoundPairings =
    format == null
      ? []
      : defaultFirstRoundSeeds(format).map(([homeSeed, awaySeed]) => ({
          homeSeed,
          awaySeed,
        }));

  return { slots, firstRoundPairings };
}

function buildLogicalKoPlan(
  options: KnockoutOptions,
): { matches: PlanPreviewKoMatch[]; error: string | null } {
  const seeds = defaultFirstRoundSeeds(options.format);
  const matches: PlanPreviewKoMatch[] = [];

  if (options.format === 4) {
    matches.push(
      {
        key: "sf1",
        round: "semifinal",
        homeSeed: seeds[0]?.[0] ?? null,
        awaySeed: seeds[0]?.[1] ?? null,
        nextKey: "final",
        nextSlot: "home",
        loserNextKey: options.includeThirdPlace ? "third" : null,
        loserNextSlot: options.includeThirdPlace ? "home" : null,
        sortOrder: 200,
      },
      {
        key: "sf2",
        round: "semifinal",
        homeSeed: seeds[1]?.[0] ?? null,
        awaySeed: seeds[1]?.[1] ?? null,
        nextKey: "final",
        nextSlot: "away",
        loserNextKey: options.includeThirdPlace ? "third" : null,
        loserNextSlot: options.includeThirdPlace ? "away" : null,
        sortOrder: 201,
      },
      {
        key: "final",
        round: "final",
        homeSeed: null,
        awaySeed: null,
        nextKey: null,
        nextSlot: null,
        loserNextKey: null,
        loserNextSlot: null,
        sortOrder: 400,
      },
    );
    if (options.includeThirdPlace) {
      matches.push({
        key: "third",
        round: "third-place",
        homeSeed: null,
        awaySeed: null,
        nextKey: null,
        nextSlot: null,
        loserNextKey: null,
        loserNextSlot: null,
        sortOrder: 300,
      });
    }
    return { matches, error: null };
  }

  if (options.format !== 8) {
    return { matches: [], error: "Unsupported KO format." };
  }

  matches.push(
    {
      key: "qf1",
      round: "quarterfinal",
      homeSeed: seeds[0]?.[0] ?? null,
      awaySeed: seeds[0]?.[1] ?? null,
      nextKey: "sf1",
      nextSlot: "home",
      loserNextKey: options.includePlacement5 ? "p5" : null,
      loserNextSlot: options.includePlacement5 ? "home" : null,
      sortOrder: 100,
    },
    {
      key: "qf2",
      round: "quarterfinal",
      homeSeed: seeds[1]?.[0] ?? null,
      awaySeed: seeds[1]?.[1] ?? null,
      nextKey: "sf1",
      nextSlot: "away",
      loserNextKey: options.includePlacement5 ? "p5" : null,
      loserNextSlot: options.includePlacement5 ? "away" : null,
      sortOrder: 101,
    },
    {
      key: "qf3",
      round: "quarterfinal",
      homeSeed: seeds[2]?.[0] ?? null,
      awaySeed: seeds[2]?.[1] ?? null,
      nextKey: "sf2",
      nextSlot: "home",
      loserNextKey: options.includePlacement7 ? "p7" : null,
      loserNextSlot: options.includePlacement7 ? "home" : null,
      sortOrder: 102,
    },
    {
      key: "qf4",
      round: "quarterfinal",
      homeSeed: seeds[3]?.[0] ?? null,
      awaySeed: seeds[3]?.[1] ?? null,
      nextKey: "sf2",
      nextSlot: "away",
      loserNextKey: options.includePlacement7 ? "p7" : null,
      loserNextSlot: options.includePlacement7 ? "away" : null,
      sortOrder: 103,
    },
    {
      key: "sf1",
      round: "semifinal",
      homeSeed: null,
      awaySeed: null,
      nextKey: "final",
      nextSlot: "home",
      loserNextKey: options.includeThirdPlace ? "third" : null,
      loserNextSlot: options.includeThirdPlace ? "home" : null,
      sortOrder: 200,
    },
    {
      key: "sf2",
      round: "semifinal",
      homeSeed: null,
      awaySeed: null,
      nextKey: "final",
      nextSlot: "away",
      loserNextKey: options.includeThirdPlace ? "third" : null,
      loserNextSlot: options.includeThirdPlace ? "away" : null,
      sortOrder: 201,
    },
    {
      key: "final",
      round: "final",
      homeSeed: null,
      awaySeed: null,
      nextKey: null,
      nextSlot: null,
      loserNextKey: null,
      loserNextSlot: null,
      sortOrder: 400,
    },
  );

  if (options.includeThirdPlace) {
    matches.push({
      key: "third",
      round: "third-place",
      homeSeed: null,
      awaySeed: null,
      nextKey: null,
      nextSlot: null,
      loserNextKey: null,
      loserNextSlot: null,
      sortOrder: 300,
    });
  }
  if (options.includePlacement5) {
    matches.push({
      key: "p5",
      round: "placement-5",
      homeSeed: null,
      awaySeed: null,
      nextKey: null,
      nextSlot: null,
      loserNextKey: null,
      loserNextSlot: null,
      sortOrder: 310,
    });
  }
  if (options.includePlacement7) {
    matches.push({
      key: "p7",
      round: "placement-7",
      homeSeed: null,
      awaySeed: null,
      nextKey: null,
      nextSlot: null,
      loserNextKey: null,
      loserNextSlot: null,
      sortOrder: 320,
    });
  }

  return { matches, error: null };
}

function hasScoreData(match: RegenerationStageSnapshot["matches"][number]) {
  // Explicit null checks: 0 is a valid score and must count as result data.
  return match.homeScore != null || match.awayScore != null;
}

function hasResultData(match: RegenerationStageSnapshot["matches"][number]) {
  // Completed status blocks even when scores are missing.
  // Any non-null score also blocks (scheduled/live/cancelled with residual scores).
  return match.status === "completed" || hasScoreData(match);
}

/**
 * Pure regeneration policy for group-schedule regeneration / deletion.
 * Conservative: ambiguous/missing data → blocked.
 * Residual TOCTOU (read then concurrent write then DELETE) is accepted for C6-B;
 * this helper is action-level only and is not a transactional lock.
 */
export function canRegenerateGroupSchedule(
  stage: RegenerationStageSnapshot,
): RegenerationPolicyResult {
  if (
    typeof stage.groupCount !== "number" ||
    !Number.isFinite(stage.groupCount) ||
    !Array.isArray(stage.matches)
  ) {
    return {
      state: "AMBIGUOUS",
      decision: "blocked",
      reason: "Stage-Daten sind unvollständig oder ungültig.",
    };
  }

  for (const match of stage.matches) {
    if (match == null || typeof match !== "object") {
      return {
        state: "AMBIGUOUS",
        decision: "blocked",
        reason: "Match-Eintrag in Stage-Daten ist ungültig.",
      };
    }
  }

  if (stage.tournamentStatus === "completed") {
    return {
      state: "COMPLETED",
      decision: "blocked",
      reason: "Das Turnier ist abgeschlossen.",
    };
  }

  const knockoutMatches = stage.matches.filter((match) => match.phase === "knockout");
  if (knockoutMatches.length > 0) {
    return {
      state: "KO_STARTED",
      decision: "blocked",
      reason: "KO-Phase ist bereits vorhanden; Gruppenspielplan darf nicht regeneriert werden.",
    };
  }

  if (stage.matches.some((match) => match.status === "live")) {
    return {
      state: "LIVE",
      decision: "blocked",
      reason: "Mindestens ein Spiel läuft bereits.",
    };
  }

  if (stage.matches.some((match) => hasResultData(match))) {
    return {
      state: "RESULTS_EXIST",
      decision: "blocked",
      reason: "Es existieren bereits Ergebnisse (inkl. 0:0).",
    };
  }

  const groupMatches = stage.matches.filter(
    (match) => match.phase !== "knockout" && (match.phase == null || match.phase === "group"),
  );

  if (groupMatches.length > 0) {
    return {
      state: "SCHEDULE_NO_RESULTS",
      decision: "allowedWithConfirmation",
      reason: "Ein Spielplan ohne Ergebnisse kann mit Bestätigung ersetzt werden.",
    };
  }

  if (stage.groupCount > 0) {
    return {
      state: "GROUPS_ONLY",
      decision: "allowed",
      reason: "Nur Gruppen vorhanden; Generierung ist erlaubt.",
    };
  }

  return {
    state: "EMPTY",
    decision: "allowed",
    reason: "Kein Spielplan vorhanden; Generierung ist erlaubt.",
  };
}

function timingSettings(input: PlanPreviewTimingInput): TimetableSettings | null {
  const start = new Date(input.startIso);
  if (Number.isNaN(start.getTime())) {
    return null;
  }
  const lunchStart = input.lunchStartIso ? new Date(input.lunchStartIso) : null;
  const lunchEnd = input.lunchEndIso ? new Date(input.lunchEndIso) : null;
  return {
    start,
    durationMinutes: input.durationMinutes,
    breakMinutes: input.breakMinutes,
    minimumRestMinutes: input.minimumRestMinutes,
    lunchStart:
      lunchStart && !Number.isNaN(lunchStart.getTime()) ? lunchStart : null,
    lunchEnd: lunchEnd && !Number.isNaN(lunchEnd.getTime()) ? lunchEnd : null,
  };
}

export function buildTournamentPlanPreview(
  input: BuildTournamentPlanPreviewInput,
): TournamentPlanPreview {
  const warnings: PlanPreviewWarning[] = [];
  const mode = input.mode;

  const fingerprintSource = {
    mode: input.mode,
    participants: input.participants.map((participant) => ({
      applicationId: participant.applicationId ?? null,
      externalTeamId: participant.externalTeamId ?? null,
    })),
    groups: (input.groups ?? []).map((group) => ({
      key: group.key ?? null,
      name: group.name ?? null,
      participantIds: [...group.participantIds],
    })),
    fields: input.fields.map((field) => ({ id: field.id, name: field.name })),
    timing: {
      startIso: input.timing.startIso,
      durationMinutes: input.timing.durationMinutes,
      breakMinutes: input.timing.breakMinutes,
      minimumRestMinutes: input.timing.minimumRestMinutes,
      lunchStartIso: input.timing.lunchStartIso ?? null,
      lunchEndIso: input.timing.lunchEndIso ?? null,
    },
    knockout: input.knockout
      ? {
          format: input.knockout.format,
          includeThirdPlace: Boolean(input.knockout.includeThirdPlace),
          includePlacement5: Boolean(input.knockout.includePlacement5),
          includePlacement7: Boolean(input.knockout.includePlacement7),
        }
      : null,
  };
  const inputFingerprint = fingerprintCanonicalJson(fingerprintSource);

  const {
    participants,
    warnings: participantWarnings,
    byKey,
  } = normalizeParticipants(input.participants);
  warnings.push(...participantWarnings);

  if (participants.length === 0) {
    warnings.push(warn("NO_PARTICIPANTS", "Keine gültigen Teilnehmer für die Vorschau."));
  } else if (participants.length < 2) {
    warnings.push(
      warn("INSUFFICIENT_PARTICIPANTS", "Mindestens zwei Teilnehmer werden benötigt."),
    );
  }

  const {
    groups,
    memberships,
    memberIdsByGroupKey,
    warnings: groupWarnings,
  } = resolveGroups(mode, participants, input.groups, byKey);
  warnings.push(...groupWarnings);

  const populatedGroups = groups.filter(
    (group) => (memberIdsByGroupKey[group.key] ?? []).length >= 2,
  );

  let matches: PlanPreviewMatch[] = [];
  if (populatedGroups.length > 0) {
    if (input.fields.length === 0) {
      warnings.push(
        warn("NO_FIELDS", "Bitte zuerst mindestens ein Spielfeld anlegen."),
      );
    } else {
      const fixtures = interleaveGroupFixtures(
        populatedGroups.map((group) => {
          const teamIds = memberIdsByGroupKey[group.key] ?? [];
          return roundRobinFixtures(teamIds).map((fixture) => ({
            ...fixture,
            groupId: group.key,
          }));
        }),
      );

      if (hasSelfPlay(fixtures)) {
        warnings.push(
          warn("SELF_PLAY", "Der Spielplan enthielt eine ungültige Begegnung gegen sich selbst."),
        );
      }

      const expected = populatedGroups.reduce(
        (sum, group) =>
          sum + expectedGroupMatchCount((memberIdsByGroupKey[group.key] ?? []).length),
        0,
      );
      if (fixtures.length !== expected) {
        warnings.push(
          warn("MATCH_COUNT_MISMATCH", "Die Anzahl der Gruppenspiele stimmt nicht.", {
            expected,
            actual: fixtures.length,
          }),
        );
      }

      const settings = timingSettings(input.timing);
      if (!settings) {
        warnings.push(
          warn("TIMETABLE_INCOMPLETE", "Ungültiger Startzeitpunkt für den Spielplan."),
        );
      } else {
        const timetable = buildTimetable(fixtures, input.fields, settings);
        for (const message of timetable.warnings) {
          if (message.includes("Mindestruhezeit")) {
            warnings.push(
              warn("MINIMUM_REST_VIOLATION", message, {
                minimumRestMinutes: input.timing.minimumRestMinutes,
              }),
            );
          } else if (message.includes("Spielfeld")) {
            warnings.push(warn("NO_FIELDS", message));
          } else if (message.includes("vollständig")) {
            warnings.push(warn("TIMETABLE_INCOMPLETE", message));
          } else {
            warnings.push(warn("TIMETABLE_INCOMPLETE", message));
          }
        }

        matches = timetable.matches.flatMap((match, index) => {
          const home = byKey.get(match.homeId);
          const away = byKey.get(match.awayId);
          if (!home || !away) {
            return [];
          }
          return [
            {
              key: `m${index + 1}`,
              groupKey: match.groupId,
              home,
              away,
              fieldId: match.fieldId,
              scheduledAt: match.scheduledAt.toISOString(),
              durationMinutes: match.durationMinutes,
              sortOrder: match.sortOrder,
              restWarning: match.restWarning,
            },
          ];
        });
      }
    }
  }

  let qualifierPlan: TournamentPlanPreview["qualifierPlan"] = {
    slots: [],
    firstRoundPairings: [],
  };
  let koPlan: PlanPreviewKoMatch[] | null = null;

  if (mode === "groups-knockout") {
    qualifierPlan = buildQualifierPlan(groups);
    const format: KnockoutFormat | null =
      groups.length === 2 ? 4 : groups.length === 4 ? 8 : null;

    if (input.knockout && format == null) {
      warnings.push(
        warn(
          "UNSUPPORTED_KO_GROUP_COUNT",
          "Gruppen + KO unterstützt in V1 genau 2 Gruppen (Format 4) oder 4 Gruppen (Format 8).",
          { groupCount: groups.length },
        ),
      );
    } else if (input.knockout && format != null && input.knockout.format !== format) {
      warnings.push(
        warn(
          "UNSUPPORTED_KO_FORMAT",
          `KO-Format ${input.knockout.format} passt nicht zu ${groups.length} Gruppen.`,
          { format: input.knockout.format, groupCount: groups.length },
        ),
      );
    } else if (input.knockout && format != null) {
      const options: KnockoutOptions = {
        format: input.knockout.format,
        includeThirdPlace: Boolean(input.knockout.includeThirdPlace),
        includePlacement5:
          input.knockout.format === 8 && Boolean(input.knockout.includePlacement5),
        includePlacement7:
          input.knockout.format === 8 && Boolean(input.knockout.includePlacement7),
      };
      const logical = buildLogicalKoPlan(options);
      if (logical.error) {
        warnings.push(warn("KO_PLAN_UNAVAILABLE", logical.error));
      } else {
        koPlan = logical.matches;
      }
    }
  }

  const kickoffs = matches
    .map((match) => match.scheduledAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  const firstKickoff = kickoffs[0] ?? null;
  const lastKickoff = kickoffs[kickoffs.length - 1] ?? null;
  let estimatedEnd: string | null = null;
  if (lastKickoff) {
    const lastMatch = matches.find((match) => match.scheduledAt === lastKickoff);
    const duration = lastMatch?.durationMinutes ?? input.timing.durationMinutes;
    estimatedEnd = new Date(
      new Date(lastKickoff).getTime() + duration * 60_000,
    ).toISOString();
  }

  const summary: PlanPreviewSummary = {
    participantCount: participants.length,
    groupCount: groups.length,
    groupMatchCount: matches.length,
    koMatchCount: koPlan?.length ?? 0,
    totalMatchCount: matches.length + (koPlan?.length ?? 0),
    fieldCount: input.fields.length,
    firstKickoff,
    estimatedLastKickoff: lastKickoff,
    estimatedEnd,
    warningCount: warnings.length,
  };

  return {
    mode,
    groups,
    memberships,
    matches,
    qualifierPlan,
    koPlan,
    warnings,
    summary,
    inputFingerprint,
  };
}

/** Helper for tests: treat MatchStatus-compatible strings. */
export type { MatchStatus };

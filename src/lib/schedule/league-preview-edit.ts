/**
 * CL Release 5 — pure re-validation and reordering for an editable Champions
 * League schedule preview.
 *
 * No database, no React, no server actions. The admin may reorder matches,
 * move them between time slots, change a field or a kickoff. Every edit is
 * re-validated here before it may be applied. This NEVER relaxes a league
 * invariant: the same checks the server RPC enforces (unique pairings, exact
 * per-team opponent count, same-club exclusion) are mirrored, plus the
 * scheduling conflicts the RPC cannot see (double field bookings, simultaneous
 * team appearances, minimum-rest violations).
 */

import { buildTimetable, type ScheduleField, type TimetableSettings } from "@/lib/schedule/timetable";
import {
  previewParticipantKey,
  type PlanPreviewMatch,
  type PlanPreviewParticipantRef,
  type PlanPreviewTimingInput,
} from "@/lib/schedule/plan-preview";

export type EditablePreviewMatch = {
  key: string;
  home: PlanPreviewParticipantRef;
  away: PlanPreviewParticipantRef;
  fieldId: string | null;
  scheduledAt: string | null;
  durationMinutes: number;
  sortOrder: number;
  restWarning: boolean;
};

export const PREVIEW_EDIT_ISSUE_CODES = [
  "MATCH_COUNT_MISMATCH",
  "SELF_PLAY",
  "UNKNOWN_PARTICIPANT",
  "DUPLICATE_PAIRING",
  "WRONG_OPPONENT_COUNT",
  "SAME_CLUB_VIOLATION",
  "UNKNOWN_FIELD",
  "MISSING_FIELD",
  "MISSING_KICKOFF",
  "INVALID_DURATION",
  "FIELD_DOUBLE_BOOKED",
  "TEAM_DOUBLE_BOOKED",
  "MINIMUM_REST_VIOLATION",
] as const;

export type PreviewEditIssueCode = (typeof PREVIEW_EDIT_ISSUE_CODES)[number];

export type PreviewEditIssue = {
  code: PreviewEditIssueCode;
  message: string;
  matchKeys?: string[];
  /**
   * Blocking issues forbid applying the plan. Minimum-rest shortfalls are
   * surfaced as non-blocking warnings, matching the generator, which cannot
   * always honour the rest window on dense schedules and still allows apply.
   */
  blocking: boolean;
};

export type ValidateEditedLeaguePlanInput = {
  matches: readonly EditablePreviewMatch[];
  participantIds: readonly string[];
  matchesPerTeam: number;
  fieldIds: readonly string[];
  minimumRestMinutes: number;
  restrictSameClub: boolean;
  clubByParticipantId?: Readonly<Record<string, string | null>>;
};

export type ValidateEditedLeaguePlanResult = {
  /** True when no BLOCKING issue exists; non-blocking rest warnings may remain. */
  ok: boolean;
  issues: PreviewEditIssue[];
  /** Keys of matches that participate in at least one blocking issue. */
  invalidMatchKeys: string[];
  /** Keys of matches flagged by a non-blocking minimum-rest warning. */
  restWarningMatchKeys: string[];
};

const NON_BLOCKING_CODES = new Set<PreviewEditIssueCode>(["MINIMUM_REST_VIOLATION"]);

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Validate a fully edited league plan. Returns every violation found (not just
 * the first), so the UI can mark each offending match.
 */
export function validateEditedLeaguePlan(
  input: ValidateEditedLeaguePlanInput,
): ValidateEditedLeaguePlanResult {
  const issues: PreviewEditIssue[] = [];
  const invalid = new Set<string>();
  const restWarnings = new Set<string>();
  const participantSet = new Set(input.participantIds);
  const fieldSet = new Set(input.fieldIds);
  const clubBy = input.clubByParticipantId ?? {};

  const add = (code: PreviewEditIssueCode, message: string, keys?: string[]) => {
    const blocking = !NON_BLOCKING_CODES.has(code);
    issues.push(keys ? { code, message, matchKeys: keys, blocking } : { code, message, blocking });
    for (const key of keys ?? []) {
      (blocking ? invalid : restWarnings).add(key);
    }
  };

  const expectedCount = (input.participantIds.length * input.matchesPerTeam) / 2;
  if (!Number.isInteger(expectedCount) || input.matches.length !== expectedCount) {
    add(
      "MATCH_COUNT_MISMATCH",
      `Es müssen genau ${Number.isInteger(expectedCount) ? expectedCount : "?"} Ligabegegnungen eingeplant sein, aktuell sind es ${input.matches.length}.`,
    );
  }

  const degree = new Map<string, number>();
  const seenPairs = new Set<string>();
  const perField = new Map<string, Array<{ key: string; start: number; end: number }>>();
  const perTeam = new Map<string, Array<{ key: string; start: number; end: number }>>();

  for (const match of input.matches) {
    const home = previewParticipantKey(match.home);
    const away = previewParticipantKey(match.away);

    if (!home || !away) {
      add("UNKNOWN_PARTICIPANT", "Eine Begegnung hat keine gültige Mannschaft.", [match.key]);
      continue;
    }
    if (home === away) {
      add("SELF_PLAY", "Eine Mannschaft kann nicht gegen sich selbst spielen.", [match.key]);
      continue;
    }
    if (!participantSet.has(home) || !participantSet.has(away)) {
      add("UNKNOWN_PARTICIPANT", "Eine Begegnung nutzt eine nicht bestätigte Mannschaft.", [match.key]);
      continue;
    }

    degree.set(home, (degree.get(home) ?? 0) + 1);
    degree.set(away, (degree.get(away) ?? 0) + 1);

    const pair = pairKey(home, away);
    if (seenPairs.has(pair)) {
      add("DUPLICATE_PAIRING", "Zwei Mannschaften treffen in der Ligaphase mehrfach aufeinander.", [match.key]);
    }
    seenPairs.add(pair);

    if (input.restrictSameClub) {
      const homeClub = clubBy[home] ?? null;
      const awayClub = clubBy[away] ?? null;
      if (homeClub && awayClub && homeClub === awayClub) {
        add(
          "SAME_CLUB_VIOLATION",
          "Zwei Mannschaften desselben Vereins dürfen in der Ligaphase nicht gegeneinander spielen.",
          [match.key],
        );
      }
    }

    if (!match.fieldId) {
      add("MISSING_FIELD", "Eine Begegnung hat kein Spielfeld.", [match.key]);
    } else if (!fieldSet.has(match.fieldId)) {
      add("UNKNOWN_FIELD", "Eine Begegnung nutzt ein Spielfeld, das nicht zum Turnier gehört.", [match.key]);
    }

    if (!Number.isInteger(match.durationMinutes) || match.durationMinutes < 5 || match.durationMinutes > 90) {
      add("INVALID_DURATION", "Die Spielzeit einer Begegnung ist ungültig (5–90 Minuten).", [match.key]);
    }

    if (!match.scheduledAt) {
      add("MISSING_KICKOFF", "Eine Begegnung hat keine Anstoßzeit.", [match.key]);
      continue;
    }
    const start = Date.parse(match.scheduledAt);
    if (Number.isNaN(start)) {
      add("MISSING_KICKOFF", "Eine Begegnung hat keine gültige Anstoßzeit.", [match.key]);
      continue;
    }
    const end = start + Math.max(match.durationMinutes, 0) * 60_000;

    if (match.fieldId) {
      const slots = perField.get(match.fieldId) ?? [];
      for (const slot of slots) {
        if (intervalsOverlap(start, end, slot.start, slot.end)) {
          add("FIELD_DOUBLE_BOOKED", "Zwei Begegnungen belegen dasselbe Spielfeld zur gleichen Zeit.", [match.key, slot.key]);
        }
      }
      slots.push({ key: match.key, start, end });
      perField.set(match.fieldId, slots);
    }

    for (const teamId of [home, away]) {
      const slots = perTeam.get(teamId) ?? [];
      for (const slot of slots) {
        if (intervalsOverlap(start, end, slot.start, slot.end)) {
          add("TEAM_DOUBLE_BOOKED", "Eine Mannschaft hat zwei Begegnungen zur gleichen Zeit.", [match.key, slot.key]);
        }
      }
      slots.push({ key: match.key, start, end });
      perTeam.set(teamId, slots);
    }
  }

  // Minimum rest between a team's consecutive matches.
  if (input.minimumRestMinutes > 0) {
    for (const slots of perTeam.values()) {
      const ordered = [...slots].sort((left, right) => left.start - right.start);
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1];
        const current = ordered[index];
        const gapMinutes = (current.start - previous.end) / 60_000;
        if (gapMinutes < input.minimumRestMinutes) {
          add(
            "MINIMUM_REST_VIOLATION",
            `Die Mindestruhezeit von ${input.minimumRestMinutes} Minuten wird unterschritten.`,
            [previous.key, current.key],
          );
        }
      }
    }
  }

  for (const teamId of input.participantIds) {
    const actual = degree.get(teamId) ?? 0;
    if (actual !== input.matchesPerTeam) {
      add(
        "WRONG_OPPONENT_COUNT",
        `Nicht jede Mannschaft hat genau ${input.matchesPerTeam} verschiedene Gegner.`,
      );
      break;
    }
  }

  return {
    ok: issues.every((issue) => !issue.blocking),
    issues,
    invalidMatchKeys: [...invalid],
    restWarningMatchKeys: [...restWarnings],
  };
}

/** Move a match up or down in the ordering and renumber sortOrder. */
export function reorderMatch(
  matches: readonly EditablePreviewMatch[],
  key: string,
  direction: "up" | "down",
): EditablePreviewMatch[] {
  const index = matches.findIndex((match) => match.key === key);
  if (index < 0) {
    return [...matches];
  }
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= matches.length) {
    return [...matches];
  }
  const next = [...matches];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((match, position) => ({ ...match, sortOrder: position }));
}

/** Swap the time slot (kickoff + field) of two matches without changing pairings. */
export function swapTimeSlots(
  matches: readonly EditablePreviewMatch[],
  keyA: string,
  keyB: string,
): EditablePreviewMatch[] {
  const a = matches.find((match) => match.key === keyA);
  const b = matches.find((match) => match.key === keyB);
  if (!a || !b || keyA === keyB) {
    return [...matches];
  }
  return matches.map((match) => {
    if (match.key === keyA) {
      return { ...match, scheduledAt: b.scheduledAt, fieldId: b.fieldId, durationMinutes: b.durationMinutes };
    }
    if (match.key === keyB) {
      return { ...match, scheduledAt: a.scheduledAt, fieldId: a.fieldId, durationMinutes: a.durationMinutes };
    }
    return match;
  });
}

/**
 * Recompute kickoff times and field assignments for the current ordering using
 * the shared timetable engine. Pairings and order are preserved; only the clock
 * is rebuilt. This powers the "recompute times on reorder" option.
 */
export function recomputeTimes(
  matches: readonly EditablePreviewMatch[],
  timing: PlanPreviewTimingInput,
  fields: readonly ScheduleField[],
): EditablePreviewMatch[] {
  const start = new Date(timing.startIso);
  if (Number.isNaN(start.getTime()) || fields.length === 0) {
    return [...matches];
  }
  const settings: TimetableSettings = {
    start,
    durationMinutes: timing.durationMinutes,
    breakMinutes: timing.breakMinutes,
    minimumRestMinutes: timing.minimumRestMinutes,
    lunchStart: timing.lunchStartIso ? new Date(timing.lunchStartIso) : null,
    lunchEnd: timing.lunchEndIso ? new Date(timing.lunchEndIso) : null,
  };
  const fixtures = matches.map((match) => ({
    groupId: "league",
    homeId: previewParticipantKey(match.home) ?? "",
    awayId: previewParticipantKey(match.away) ?? "",
  }));
  const timetable = buildTimetable(fixtures, [...fields], settings);
  const byPair = new Map<string, { scheduledAt: string; fieldId: string | null; durationMinutes: number; restWarning: boolean }>();
  for (const placed of timetable.matches) {
    byPair.set(pairKey(placed.homeId, placed.awayId), {
      scheduledAt: placed.scheduledAt.toISOString(),
      fieldId: placed.fieldId,
      durationMinutes: placed.durationMinutes,
      restWarning: placed.restWarning,
    });
  }
  return matches.map((match, position) => {
    const home = previewParticipantKey(match.home);
    const away = previewParticipantKey(match.away);
    const placed = home && away ? byPair.get(pairKey(home, away)) : undefined;
    if (!placed) {
      return { ...match, sortOrder: position };
    }
    return {
      ...match,
      scheduledAt: placed.scheduledAt,
      fieldId: placed.fieldId,
      durationMinutes: placed.durationMinutes,
      restWarning: placed.restWarning,
      sortOrder: position,
    };
  });
}

/** Convert preview matches into the editable shape (stable keys preserved). */
export function toEditableMatches(matches: readonly PlanPreviewMatch[]): EditablePreviewMatch[] {
  return matches.map((match, position) => ({
    key: match.key,
    home: match.home,
    away: match.away,
    fieldId: match.fieldId,
    scheduledAt: match.scheduledAt,
    durationMinutes: match.durationMinutes,
    sortOrder: match.sortOrder ?? position,
    restWarning: match.restWarning,
  }));
}

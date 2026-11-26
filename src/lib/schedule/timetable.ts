import { addMinutes } from "@/lib/schedule/datetime";

export type ScheduleMatchInput = {
  groupId: string;
  homeId: string;
  awayId: string;
};

export type ScheduleField = {
  id: string;
  name: string;
};

export type TimetableSettings = {
  start: Date;
  durationMinutes: number;
  breakMinutes: number;
  minimumRestMinutes: number;
  lunchStart?: Date | null;
  lunchEnd?: Date | null;
};

export type ScheduledMatch = ScheduleMatchInput & {
  fieldId: string;
  scheduledAt: Date;
  durationMinutes: number;
  sortOrder: number;
  restWarning: boolean;
};

function skipLunch(time: Date, settings: TimetableSettings, durationMinutes: number) {
  const { lunchStart, lunchEnd } = settings;
  if (!lunchStart || !lunchEnd || lunchEnd.getTime() <= lunchStart.getTime()) {
    return time;
  }

  const matchEnd = addMinutes(time, durationMinutes);
  if (time.getTime() < lunchEnd.getTime() && matchEnd.getTime() > lunchStart.getTime()) {
    return new Date(lunchEnd);
  }

  return time;
}

function lastEnd(map: Map<string, Date>, teamId: string) {
  return map.get(teamId) ?? null;
}

function isFree(map: Map<string, Date>, teamId: string, start: Date) {
  const end = lastEnd(map, teamId);
  return !end || start.getTime() >= end.getTime();
}

function hasRest(map: Map<string, Date>, teamId: string, start: Date, restMs: number) {
  const end = lastEnd(map, teamId);
  return !end || start.getTime() >= end.getTime() + restMs;
}

export function buildTimetable(
  matches: ScheduleMatchInput[],
  fields: ScheduleField[],
  settings: TimetableSettings,
): { matches: ScheduledMatch[]; warnings: string[] } {
  if (fields.length === 0) {
    return { matches: [], warnings: ["Bitte zuerst mindestens ein Spielfeld anlegen."] };
  }

  if (matches.length === 0) {
    return { matches: [], warnings: [] };
  }

  const remaining = [...matches];
  const fieldFree = fields.map(() => new Date(settings.start));
  const teamLastEnd = new Map<string, Date>();
  const scheduled: ScheduledMatch[] = [];
  const restMs = settings.minimumRestMinutes * 60_000;
  let guard = 0;

  while (remaining.length > 0 && guard < matches.length * 40) {
    guard += 1;

    let fieldIndex = 0;
    for (let index = 1; index < fieldFree.length; index += 1) {
      if (fieldFree[index].getTime() < fieldFree[fieldIndex].getTime()) {
        fieldIndex = index;
      }
    }

    const start = skipLunch(fieldFree[fieldIndex], settings, settings.durationMinutes);
    if (start.getTime() > fieldFree[fieldIndex].getTime()) {
      fieldFree[fieldIndex] = start;
    }

    const pickIndex = remaining.findIndex(
      (match) =>
        isFree(teamLastEnd, match.homeId, start) &&
        isFree(teamLastEnd, match.awayId, start) &&
        hasRest(teamLastEnd, match.homeId, start, restMs) &&
        hasRest(teamLastEnd, match.awayId, start, restMs),
    );
    if (pickIndex < 0) {
      // Every remaining pairing is currently blocked by a team's match or
      // minimum-rest window. Waiting is always possible, so advance this field
      // to the earliest time at which one complete pairing is ready instead of
      // knowingly creating an avoidable rest violation.
      const nextReadyAt = Math.min(
        ...remaining.map((match) => {
          const homeEnd = lastEnd(teamLastEnd, match.homeId)?.getTime() ?? start.getTime() - restMs;
          const awayEnd = lastEnd(teamLastEnd, match.awayId)?.getTime() ?? start.getTime() - restMs;
          return Math.max(start.getTime(), homeEnd + restMs, awayEnd + restMs);
        }),
      );
      fieldFree[fieldIndex] = new Date(Math.max(nextReadyAt, start.getTime() + 60_000));
      continue;
    }

    const match = remaining.splice(pickIndex, 1)[0];
    if (!match) {
      break;
    }

    const end = addMinutes(start, settings.durationMinutes);
    scheduled.push({
      ...match,
      fieldId: fields[fieldIndex].id,
      scheduledAt: start,
      durationMinutes: settings.durationMinutes,
      sortOrder: scheduled.length,
      restWarning: false,
    });
    fieldFree[fieldIndex] = addMinutes(end, settings.breakMinutes);
    teamLastEnd.set(match.homeId, end);
    teamLastEnd.set(match.awayId, end);
  }

  const warnings: string[] = [];
  if (remaining.length > 0) {
    warnings.push("Der Spielplan konnte nicht vollständig erzeugt werden.");
  }

  return { matches: scheduled, warnings };
}

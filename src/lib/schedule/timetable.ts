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
  let restViolations = 0;
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

    let pickIndex = remaining.findIndex(
      (match) =>
        isFree(teamLastEnd, match.homeId, start) &&
        isFree(teamLastEnd, match.awayId, start) &&
        hasRest(teamLastEnd, match.homeId, start, restMs) &&
        hasRest(teamLastEnd, match.awayId, start, restMs),
    );
    let restWarning = false;

    if (pickIndex < 0) {
      pickIndex = remaining.findIndex(
        (match) =>
          isFree(teamLastEnd, match.homeId, start) &&
          isFree(teamLastEnd, match.awayId, start),
      );
      restWarning = pickIndex >= 0;
    }

    if (pickIndex < 0) {
      const nextEnds = remaining.flatMap((match) => {
        const home = lastEnd(teamLastEnd, match.homeId);
        const away = lastEnd(teamLastEnd, match.awayId);
        return [home, away].filter((value): value is Date => Boolean(value));
      });
      const jumpTo = nextEnds.length
        ? Math.min(...nextEnds.map((value) => value.getTime()))
        : start.getTime() + 60_000;
      fieldFree[fieldIndex] = new Date(Math.max(jumpTo, start.getTime() + 60_000));
      continue;
    }

    const match = remaining.splice(pickIndex, 1)[0];
    if (!match) {
      break;
    }

    if (restWarning) {
      restViolations += 1;
    }

    const end = addMinutes(start, settings.durationMinutes);
    scheduled.push({
      ...match,
      fieldId: fields[fieldIndex].id,
      scheduledAt: start,
      durationMinutes: settings.durationMinutes,
      sortOrder: scheduled.length,
      restWarning,
    });
    fieldFree[fieldIndex] = addMinutes(end, settings.breakMinutes);
    teamLastEnd.set(match.homeId, end);
    teamLastEnd.set(match.awayId, end);
  }

  const warnings: string[] = [];
  if (restViolations > 0) {
    warnings.push(
      `Mindestruhezeit von ${settings.minimumRestMinutes} Minuten konnte nicht für alle ${restViolations} betroffenen Spiele eingehalten werden.`,
    );
  }
  if (remaining.length > 0) {
    warnings.push("Der Spielplan konnte nicht vollständig erzeugt werden.");
  }

  return { matches: scheduled, warnings };
}

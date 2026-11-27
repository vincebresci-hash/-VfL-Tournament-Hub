import { addMinutes } from "@/lib/schedule/datetime";
import { KNOCKOUT_SCHEDULE_WAVES } from "@/lib/schedule/knockout";
import {
  buildTimetable,
  type ScheduleField,
  type TimetableSettings,
} from "@/lib/schedule/timetable";
import type { KnockoutRound } from "@/types/schedule";

export type KnockoutTimetableMatch = {
  key: string;
  round: KnockoutRound;
  homeId: string | null;
  awayId: string | null;
};

export type TimedKnockoutMatch = {
  key: string;
  fieldId: string;
  scheduledAt: Date;
};

/**
 * Time every configured knockout round in dependency waves. Unknown future
 * participants receive match-local planning identities; the gap between waves
 * enforces duration plus minimum rest for every possible advancing team.
 */
export function buildKnockoutTimetable(
  matches: readonly KnockoutTimetableMatch[],
  fields: readonly ScheduleField[],
  settings: TimetableSettings,
): { matches: TimedKnockoutMatch[]; warnings: string[] } {
  const scheduled: TimedKnockoutMatch[] = [];
  const warnings: string[] = [];
  let waveStart = settings.start;

  for (const wave of KNOCKOUT_SCHEDULE_WAVES) {
    const items = matches.filter((match) => wave.includes(match.round));
    if (items.length === 0) continue;

    const fixtures = items.map((match) => ({
        groupId: match.round,
        homeId: match.homeId ?? `tbd-home-${match.key}`,
        awayId: match.awayId ?? `tbd-away-${match.key}`,
      }));
    const timetable = buildTimetable(
      fixtures,
      [...fields],
      { ...settings, start: waveStart },
    );
    warnings.push(...timetable.warnings);

    for (const [index, match] of items.entries()) {
      const fixture = fixtures[index];
      const timed = fixture
        ? timetable.matches.find(
            (candidate) =>
              candidate.homeId === fixture.homeId && candidate.awayId === fixture.awayId,
          )
        : null;
      if (timed) {
        scheduled.push({
          key: match.key,
          fieldId: timed.fieldId,
          scheduledAt: timed.scheduledAt,
        });
      }
    }

    const lastKickoff = timetable.matches.reduce(
      (latest, match) => Math.max(latest, match.scheduledAt.getTime()),
      waveStart.getTime(),
    );
    waveStart = addMinutes(
      new Date(lastKickoff),
      settings.durationMinutes + settings.minimumRestMinutes,
    );
  }

  if (scheduled.length !== matches.length) {
    warnings.push(
      `Die Endrunde konnte nicht vollständig geplant werden (${scheduled.length}/${matches.length}).`,
    );
  }

  return { matches: scheduled, warnings };
}

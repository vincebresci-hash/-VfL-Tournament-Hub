export const TOURNAMENT_TIME_ZONE = "Europe/Berlin";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function normalizeClock(value: string | null | undefined, fallback = "09:00") {
  const match = value?.trim().match(/^(\d{2}):(\d{2})/);
  if (!match) {
    return fallback;
  }

  return `${match[1]}:${match[2]}`;
}

export function berlinWallTimeToIso(date: string, timeHHmm: string) {
  const time = normalizeClock(timeHHmm);
  const wall = `${date}T${time}:00`;

  for (const offset of ["+02:00", "+01:00"] as const) {
    const candidate = new Date(`${wall}${offset}`);
    const formatted = candidate
      .toLocaleString("sv-SE", { timeZone: TOURNAMENT_TIME_ZONE })
      .replace(" ", "T");

    if (formatted.startsWith(`${date}T${time}`)) {
      return candidate.toISOString();
    }
  }

  return new Date(`${wall}+01:00`).toISOString();
}

export function isoToBerlinParts(iso: string) {
  const formatted = new Date(iso)
    .toLocaleString("sv-SE", { timeZone: TOURNAMENT_TIME_ZONE })
    .replace(" ", "T");

  return {
    date: formatted.slice(0, 10),
    time: formatted.slice(11, 16),
  };
}

export function isoToDatetimeLocal(iso: string | null | undefined) {
  if (!iso) {
    return "";
  }

  const { date, time } = isoToBerlinParts(iso);
  return `${date}T${time}`;
}

export function datetimeLocalToIso(value: string) {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) {
    return null;
  }

  return berlinWallTimeToIso(match[1], match[2]);
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

export function formatBerlinClock(iso: string | null | undefined) {
  if (!iso) {
    return "—";
  }

  return `${isoToBerlinParts(iso).time} Uhr`;
}

export function wallTimeOnDate(date: string, timeHHmm: string | null | undefined) {
  if (!timeHHmm) {
    return null;
  }

  return new Date(berlinWallTimeToIso(date, timeHHmm));
}

export function formatSortClock(hours: number, minutes: number) {
  return `${pad(hours)}:${pad(minutes)}`;
}

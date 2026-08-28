const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseTournamentDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

export function daysUntilTournament(tournamentDate: string, now = new Date()) {
  const date = parseTournamentDate(tournamentDate);
  if (!date) {
    return null;
  }

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = date.getTime();
  return Math.ceil((target - today) / MS_PER_DAY);
}

export function isLateCancellationRequest(tournamentDate: string, now = new Date()) {
  const days = daysUntilTournament(tournamentDate, now);
  if (days === null) {
    return false;
  }

  return days < 14;
}

export function requiresCancellationReason(tournamentDate: string, now = new Date()) {
  return isLateCancellationRequest(tournamentDate, now);
}

export function cancellationDeadlineLabel(tournamentDate: string, now = new Date()) {
  const days = daysUntilTournament(tournamentDate, now);
  if (days === null) {
    return "Turnierdatum unbekannt";
  }

  if (days < 0) {
    return "Turnier hat bereits begonnen";
  }

  if (days === 0) {
    return "Turnier beginnt heute";
  }

  return `${days} Tag(e) bis zum Turnier`;
}

export function cancellationOnTimeLabel(isLateRequest: boolean) {
  return isLateRequest ? "Kurzfristig" : "Fristgerecht";
}

export function secureAccessTokenExpiresAt(tournamentDate: string) {
  const date = parseTournamentDate(tournamentDate);
  const base = date ?? new Date();
  const expires = new Date(base.getTime());
  expires.setUTCDate(expires.getUTCDate() + 30);
  return expires.toISOString();
}

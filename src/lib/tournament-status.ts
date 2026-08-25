import { isTournamentFull } from "@/lib/tournament-capacity";
import type { TournamentStatus } from "@/types/tournament";

export const tournamentStatusOrder: Record<TournamentStatus, number> = {
  active: 0,
  "coming-soon": 1,
  full: 2,
  completed: 3,
};

export const tournamentStatusLabel: Record<TournamentStatus, string> = {
  "coming-soon": "Demnächst",
  active: "Bewerbung offen",
  full: "Teilnehmerfeld voll",
  completed: "Abgeschlossen",
};

export const tournamentStatusClassName: Record<TournamentStatus, string> = {
  "coming-soon": "bg-brand-blue/12 text-brand-blue",
  active: "bg-brand-yellow text-navy",
  full: "bg-navy text-white/78",
  completed: "bg-[#e8eaee] text-muted",
};

export const tournamentCtaLabel: Record<TournamentStatus, string> = {
  "coming-soon": "Turnier ansehen",
  active: "Turnier ansehen",
  full: "Turnier ansehen",
  completed: "Turnier ansehen",
};

export type EffectiveTournamentStatusInput = {
  dbStatus: TournamentStatus;
  maxTeams: number | null | undefined;
  confirmedParticipants: number;
  archivedAt?: string | null;
};

/**
 * Public-facing tournament status derived from DB status + occupancy.
 * - completed always wins
 * - capacity full (max_teams set) => "full" even if DB says otherwise
 * - DB "full" with free slots => demoted (typically "active")
 * - max_teams NULL => no automatic full derivation
 * archivedAt is ignored here; callers must hide archived tournaments.
 */
export function getEffectiveTournamentStatus(
  input: EffectiveTournamentStatusInput,
): TournamentStatus {
  void input.archivedAt;

  if (input.dbStatus === "completed") {
    return "completed";
  }

  const confirmed = Math.max(0, input.confirmedParticipants);
  const maxTeams = input.maxTeams;

  if (maxTeams != null && maxTeams >= 0) {
    if (isTournamentFull(maxTeams, confirmed)) {
      return "full";
    }

    if (input.dbStatus === "full") {
      return "active";
    }
  }

  return input.dbStatus;
}

export function getTournamentStatusCapacityWarning(
  input: EffectiveTournamentStatusInput,
): string | null {
  if (input.dbStatus === "completed") {
    return null;
  }

  const maxTeams = input.maxTeams;
  if (maxTeams == null || maxTeams < 0) {
    return null;
  }

  const confirmed = Math.max(0, input.confirmedParticipants);
  const capacityFull = isTournamentFull(maxTeams, confirmed);

  if (input.dbStatus === "full" && !capacityFull) {
    return `Der Turnierstatus steht auf „Teilnehmerfeld voll“, aktuell sind jedoch nur ${confirmed} von ${maxTeams} Plätzen belegt.`;
  }

  if (input.dbStatus !== "full" && capacityFull) {
    return `Das Teilnehmerfeld ist vollständig belegt, der Turnierstatus steht jedoch noch auf „${tournamentStatusLabel[input.dbStatus]}“.`;
  }

  return null;
}

/** Suggested DB status when admin chooses “Status an Belegung anpassen”. */
export function getSuggestedTournamentStatusFromCapacity(
  input: EffectiveTournamentStatusInput,
): TournamentStatus {
  return getEffectiveTournamentStatus(input);
}

export function canApplyToTournament(status: TournamentStatus) {
  return status === "active";
}

export function getTournamentHref(slug: string) {
  return `/turniere/${slug}`;
}

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

export function canApplyToTournament(status: TournamentStatus) {
  return status === "active";
}

export function getTournamentHref(slug: string) {
  return `/turniere/${slug}`;
}

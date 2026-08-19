"use client";

import { TournamentAdminCard } from "@/components/admin/TournamentAdminCard";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { getTournamentAdminSummary } from "@/lib/admin";
import { getTournaments, sortTournaments } from "@/lib/tournaments";

export function TournamentsAdminBoard() {
  const { applications } = useAdminData();
  const tournaments = sortTournaments(getTournaments());

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        Turniere
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        Interne Übersicht mit Kapazitäten, Bewerbungen und Teilnehmerfeld.
      </p>

      <div className="mt-8 grid gap-4">
        {tournaments.map((tournament) => {
          const summary = getTournamentAdminSummary(tournament, applications);

          return (
            <TournamentAdminCard
              key={tournament.id}
              tournament={tournament}
              confirmedTeams={summary.confirmedTeams}
              applicationsCount={summary.applicationsCount}
              waitlistCount={summary.waitlistCount}
              composition={summary.composition}
            />
          );
        })}
      </div>
    </div>
  );
}

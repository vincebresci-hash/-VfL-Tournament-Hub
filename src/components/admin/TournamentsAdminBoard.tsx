"use client";

import Link from "next/link";
import { TournamentAdminCard } from "@/components/admin/TournamentAdminCard";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { getTournamentAdminSummary } from "@/lib/admin";
import { sortTournaments, toBoardTournament } from "@/lib/tournaments";
import type { AdminTournamentRecord } from "@/types/admin";

type TournamentsAdminBoardProps = {
  tournaments: AdminTournamentRecord[];
};

export function TournamentsAdminBoard({ tournaments }: TournamentsAdminBoardProps) {
  const { applications, databaseReady } = useAdminData();
  const list = sortTournaments(
    tournaments.map((tournament) => ({
      ...tournament,
      date: tournament.date,
      status: tournament.status,
    })),
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
            Turniere
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            Alle Turniere aus der Datenbank mit Kapazitäten und Bewerbungsstand.
          </p>
        </div>
        <Link
          href="/admin/turniere/neu"
          className="inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          + Neues Turnier
        </Link>
      </div>

      {databaseReady ? null : (
        <p className="mt-6 border border-line bg-white px-5 py-4 text-[14px] text-muted">
          Bewerbungszahlen können nicht geladen werden. Es werden keine
          Beispieldaten angezeigt.
        </p>
      )}

      <div className="mt-8 grid gap-4">
        {list.length === 0 ? (
          <p className="border border-line bg-white px-5 py-8 text-[15px] text-muted">
            Noch keine Turniere in der Datenbank.
          </p>
        ) : (
          list.map((tournament) => {
            const summary = getTournamentAdminSummary(
              toBoardTournament(tournament),
              applications,
            );

            return (
              <TournamentAdminCard
                key={tournament.id}
                tournament={tournament}
                confirmedTeams={summary.confirmedTeams}
                availableSlots={summary.availableSlots}
                applicationsCount={summary.applicationsCount}
                waitlistCount={summary.waitlistCount}
                newCount={summary.newCount}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

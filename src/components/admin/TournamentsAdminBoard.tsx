"use client";

import Link from "next/link";
import { TournamentAdminCard } from "@/components/admin/TournamentAdminCard";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { AdminPageHeader, adminPrimaryButtonClass } from "@/components/admin/AdminPanel";
import { getTournamentAdminSummary } from "@/lib/admin";
import { sortTournaments, toBoardTournament } from "@/lib/tournaments";
import type { AdminTournamentRecord } from "@/types/admin";

type TournamentsAdminBoardProps = {
  tournaments: AdminTournamentRecord[];
};

export function TournamentsAdminBoard({ tournaments }: TournamentsAdminBoardProps) {
  const { applications, externalTeams, databaseReady } = useAdminData();
  const list = sortTournaments(
    tournaments.map((tournament) => ({
      ...tournament,
      date: tournament.date,
      status: tournament.status,
    })),
  );

  return (
    <div>
      <AdminPageHeader
        title="Turniere"
        description="Turniere anlegen, Teilnehmer verwalten und den Spielbetrieb organisieren."
        actions={
          <Link href="/admin/turniere/neu" className={adminPrimaryButtonClass}>
            + Neues Turnier
          </Link>
        }
      />

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
              externalTeams.filter((team) => team.tournamentId === tournament.id),
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

"use client";

import { TournamentAdminCard } from "@/components/admin/TournamentAdminCard";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { getTournamentAdminSummary } from "@/lib/admin";
import { sortTournaments } from "@/lib/tournaments";
import { AGE_GROUPS } from "@/types/tournament";
import type { AdminTournamentRecord } from "@/types/admin";
import type { AgeGroup, Tournament } from "@/types/tournament";

type TournamentsAdminBoardProps = {
  tournaments: AdminTournamentRecord[];
};

export function TournamentsAdminBoard({ tournaments }: TournamentsAdminBoardProps) {
  const { applications } = useAdminData();
  const list = sortTournaments(
    tournaments.map((tournament) => toBoardTournament(tournament)),
  );

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        Turniere
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        Interne Übersicht mit Kapazitäten, Bewerbungen und Teilnehmerfeld.
      </p>

      <div className="mt-8 grid gap-4">
        {list.map((tournament) => {
          const summary = getTournamentAdminSummary(tournament, applications);

          return (
            <TournamentAdminCard
              key={tournament.slug}
              tournament={tournament}
              confirmedTeams={summary.confirmedTeams}
              availableSlots={summary.availableSlots}
              applicationsCount={summary.applicationsCount}
              waitlistCount={summary.waitlistCount}
              underReviewCount={summary.underReviewCount}
              composition={summary.composition}
            />
          );
        })}
      </div>
    </div>
  );
}

function toBoardTournament(record: AdminTournamentRecord): Tournament {
  return {
    id: record.slug,
    slug: record.slug,
    name: record.name,
    ageGroup: AGE_GROUPS.includes(record.ageGroup as AgeGroup)
      ? (record.ageGroup as AgeGroup)
      : "U10",
    date: record.date,
    location: record.location ?? "",
    image: "",
    description: record.description ?? "",
    status: record.status,
    maxTeams: record.maxTeams ?? 0,
    confirmedTeams: 0,
    applicationsCount: 0,
    waitlistCount: 0,
    applicationStart: null,
    applicationDeadline: null,
  };
}

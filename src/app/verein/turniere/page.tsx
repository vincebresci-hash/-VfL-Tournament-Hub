import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import { formatDateDe } from "@/lib/format";
import { getPublicTournaments, sortTournaments } from "@/lib/tournaments";
import { getTournamentHref, tournamentCtaLabel } from "@/lib/tournament-status";

export const metadata: Metadata = { title: "Turniere" };

export default function ClubTournamentsPage() {
  const tournaments = sortTournaments(getPublicTournaments());

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        Turniere
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-7 text-muted">
        Bewerbungen für geöffnete Turniere starten mit eurem Vereinskonto. Vorhandene
        Vereins- und Teamdaten können später automatisch übernommen werden.
      </p>

      <div className="mt-8 grid gap-3">
        {tournaments.map((tournament) => (
          <article
            key={tournament.id}
            className="flex flex-col gap-4 border border-line bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                {tournament.name}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {formatDateDe(tournament.date)} · {tournament.location}
              </p>
              <div className="mt-3">
                <StatusBadge status={tournament.status} />
              </div>
            </div>
            {tournament.status === "coming-soon" ? (
              <span className="text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
                {tournamentCtaLabel[tournament.status]}
              </span>
            ) : (
              <Link
                href={getTournamentHref(tournament.slug, tournament.status)}
                className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
              >
                {tournamentCtaLabel[tournament.status]}
              </Link>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";
import { CoverImage } from "@/components/brand/CoverImage";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import { IconCalendar, IconPin } from "@/components/ui/icons";
import {
  getPublicApplicationState,
  publicApplicationStateLabel,
} from "@/lib/public-application-state";
import { getDisplayCapacity } from "@/lib/public-tournament";
import { formatDateDe, formatDateTimeDe } from "@/lib/format";
import { tournamentStatusClassName } from "@/lib/tournament-status";
import { cn } from "@/lib/cn";
import type { PublicTournament } from "@/types/tournament";

type TournamentCardProps = {
  tournament: PublicTournament;
  applicationsEnabled?: boolean;
  waitlistEnabled?: boolean;
};

export function TournamentCard({
  tournament,
  applicationsEnabled = true,
  waitlistEnabled = true,
}: TournamentCardProps) {
  const applicationState = getPublicApplicationState({
    status: tournament.status,
    applicationsEnabled,
    applicationsOpen: tournament.applicationsOpen,
    archivedAt: tournament.archivedAt,
    availableSlots: tournament.availableSlots,
    waitlistEnabled: waitlistEnabled && tournament.waitlistEnabled,
    isFull: tournament.isFull,
    applicationStart: tournament.applicationStart,
    applicationDeadline: tournament.applicationDeadline,
    maxTeams: tournament.maxTeams,
  });
  const capacity = getDisplayCapacity(tournament);
  const href = `/turniere/${tournament.slug}`;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[12px] border border-line bg-white shadow-[0_1px_2px_rgba(16,20,28,0.04)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-navy/12 hover:shadow-[0_8px_20px_rgba(16,20,28,0.06)]">
      <Link
        href={href}
        className="flex h-full flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
      >
        <CoverImage
          src={tournament.image}
          alt={tournament.name}
          className="aspect-[16/9] w-full"
          sizes="(min-width: 1280px) 320px, (min-width: 768px) 50vw, 100vw"
          objectPosition="50% 42%"
          imageClassName="transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        />

        <div className="flex flex-1 flex-col px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex bg-brand-yellow px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-navy uppercase">
              {tournament.ageGroup}
            </span>
            <p className="inline-flex items-center gap-1.5 text-[13px] text-muted">
              <IconCalendar className="h-3.5 w-3.5 text-brand-yellow" />
              <time dateTime={tournament.date}>{formatDateDe(tournament.date)}</time>
            </p>
          </div>

          <h3 className="mt-2.5 font-display text-lg font-bold tracking-wide text-ink uppercase">
            {tournament.name}
          </h3>

          {tournament.location ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] text-muted">
              <IconPin className="h-3.5 w-3.5 text-brand-yellow" />
              {tournament.location}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge status={tournament.status} />
            <span
              className={cn(
                "inline-flex px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase",
                applicationState === "open"
                  ? tournamentStatusClassName.active
                  : applicationState === "waitlist"
                    ? tournamentStatusClassName.full
                    : applicationState === "coming-soon"
                      ? tournamentStatusClassName["coming-soon"]
                      : tournamentStatusClassName.completed,
              )}
            >
              {publicApplicationStateLabel[applicationState]}
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-1 text-[11px] font-medium tracking-[0.06em] text-muted uppercase">
            {tournament.applicationDeadline ? (
              <p>Frist {formatDateTimeDe(tournament.applicationDeadline)}</p>
            ) : null}
            {capacity ? (
              <>
                <p>
                  {capacity.confirmedTeams} / {capacity.maxTeams} Teams
                </p>
                <p>{capacity.availableSlots} Plätze frei</p>
              </>
            ) : tournament.confirmedTeams > 0 ? (
              <p>{tournament.confirmedTeams} bestätigte Teams</p>
            ) : null}
            {applicationState === "waitlist" ||
            (tournament.waitlistEnabled && tournament.isFull) ? (
              <p>Warteliste möglich</p>
            ) : null}
          </div>

          <div className="mt-auto flex items-end justify-between gap-3 pt-3.5">
            <span className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors group-hover:text-brand-blue">
              Turnier ansehen
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

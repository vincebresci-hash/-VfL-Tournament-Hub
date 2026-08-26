import Link from "next/link";
import { TournamentImageFrame } from "@/components/brand/TournamentImageFrame";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import {
  getPublicApplicationState,
  isPublicApplicationAllowed,
  publicApplicationStateLabel,
} from "@/lib/public-application-state";
import { getDisplayCapacity } from "@/lib/public-tournament";
import { formatDateDe } from "@/lib/format";
import {
  getEffectiveTournamentStatus,
  tournamentStatusClassName,
} from "@/lib/tournament-status";
import { MeinTurnierplanBadge } from "@/components/tournaments/MeinTurnierplanPublicButton";
import { isMeinTurnierplanPublic } from "@/lib/mein-turnierplan";
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
  const applicationGate = {
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
  };
  const applicationState = getPublicApplicationState(applicationGate);
  const canApply = isPublicApplicationAllowed(applicationGate);
  const capacity = getDisplayCapacity(tournament);
  const effectiveStatus = getEffectiveTournamentStatus({
    dbStatus: tournament.status,
    maxTeams: tournament.maxTeams,
    confirmedParticipants: tournament.confirmedTeams,
    archivedAt: tournament.archivedAt,
  });
  const href = `/turniere/${tournament.slug}`;
  const applyHref = `/turniere/${tournament.slug}/bewerben`;
  const showMeinTurnierplan = isMeinTurnierplanPublic(tournament);
  const applyLabel =
    applicationState === "waitlist" ? "Warteliste →" : "Bewerben →";

  const capacityRatio =
    capacity && capacity.maxTeams > 0
      ? Math.min(1, capacity.confirmedTeams / capacity.maxTeams)
      : null;

  return (
    <article
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-[12px] border border-line bg-white",
        "shadow-[0_1px_2px_rgba(16,20,28,0.04)]",
        "transition-[transform,box-shadow,border-color] duration-200",
        "hover:-translate-y-0.5 hover:border-navy/12 hover:shadow-[0_10px_24px_rgba(16,20,28,0.07)]",
      )}
    >
      <Link
        href={href}
        className="relative block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
        aria-label={`${tournament.name} – Turnier ansehen`}
      >
        <TournamentImageFrame
          src={tournament.image}
          alt=""
          className="w-full"
          aspectClassName="aspect-[16/9]"
          sizes="(min-width: 1280px) 320px, (min-width: 768px) 50vw, 100vw"
          objectPosition="50% 50%"
          imageClassName="transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
      </Link>

      <div className="flex flex-1 flex-col px-4 pt-4 pb-4 sm:px-5 sm:pt-5 sm:pb-5">
        <p className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">
          <span className="text-ink">{tournament.ageGroup}</span>
          <span className="mx-1.5 text-line" aria-hidden="true">
            ·
          </span>
          <time dateTime={tournament.date}>{formatDateDe(tournament.date)}</time>
        </p>

        <h3 className="mt-2 font-display text-[1.15rem] leading-snug font-bold tracking-wide text-ink uppercase sm:text-lg">
          <Link
            href={href}
            className="transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
          >
            {tournament.name}
          </Link>
        </h3>

        {tournament.location ? (
          <p className="mt-1.5 text-[13px] leading-5 text-muted">{tournament.location}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={effectiveStatus} />
          {/* Application badge only when it adds info beyond tournament status */}
          {applicationState === "waitlist" ||
          applicationState === "coming-soon" ||
          (applicationState === "closed" && effectiveStatus !== "completed") ||
          (applicationState === "open" && effectiveStatus !== "active") ? (
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
          ) : null}
          {showMeinTurnierplan ? (
            <MeinTurnierplanBadge
              date={tournament.date}
              status={effectiveStatus}
              meinTurnierplanEnabled={tournament.meinTurnierplanEnabled}
              meinTurnierplanUrl={tournament.meinTurnierplanUrl}
            />
          ) : null}
        </div>

        {capacity ? (
          <div className="mt-3">
            <p className="text-[12px] font-medium tracking-[0.04em] text-ink">
              {capacity.confirmedTeams} / {capacity.maxTeams} Teams
            </p>
            {capacityRatio != null ? (
              <div
                className="mt-1.5 h-1 w-full overflow-hidden bg-line"
                role="presentation"
                aria-hidden="true"
              >
                <div
                  className="h-full bg-brand-yellow"
                  style={{ width: `${Math.round(capacityRatio * 100)}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : tournament.confirmedTeams > 0 ? (
          <p className="mt-3 text-[12px] font-medium tracking-[0.04em] text-muted">
            {tournament.confirmedTeams} bestätigte Teams
          </p>
        ) : null}

        <div className="mt-auto flex flex-col gap-2.5 pt-5">
          {canApply ? (
            <>
              <Link
                href={applyHref}
                className="inline-flex min-h-11 w-full items-center justify-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
              >
                {applyLabel}
              </Link>
              <Link
                href={href}
                className="inline-flex min-h-10 items-center justify-center text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
              >
                Turnier ansehen
              </Link>
            </>
          ) : applicationState === "coming-soon" ? (
            <>
              <span className="inline-flex min-h-11 w-full items-center justify-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
                Demnächst bewerben
              </span>
              <Link
                href={href}
                className="inline-flex min-h-10 items-center justify-center text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
              >
                Turnier ansehen
              </Link>
            </>
          ) : (
            <Link
              href={href}
              className="inline-flex min-h-11 w-full items-center justify-center border border-navy/15 bg-navy px-4 text-[12px] font-semibold tracking-[0.08em] text-white uppercase transition-colors hover:bg-navy-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
            >
              Turnier ansehen
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

import Link from "next/link";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import { IconCalendar, IconPin } from "@/components/ui/icons";
import { Container } from "@/components/layout/Container";
import { LIVE_TYPO } from "@/lib/live/match-center";
import {
  getPublicApplicationState,
  isPublicApplicationAllowed,
} from "@/lib/public-application-state";
import { formatHomepageCapacityLabel } from "@/lib/home/homepage-moment";
import {
  getEffectiveTournamentStatus,
} from "@/lib/tournament-status";
import { formatDateDe } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { PublicTournament } from "@/types/tournament";

type HomeUpcomingSectionProps = {
  tournaments: PublicTournament[];
  applicationsEnabled: boolean;
  waitlistEnabled: boolean;
};

function UpcomingCard({
  tournament,
  applicationsEnabled,
  waitlistEnabled,
}: {
  tournament: PublicTournament;
  applicationsEnabled: boolean;
  waitlistEnabled: boolean;
}) {
  const effectiveStatus = getEffectiveTournamentStatus({
    dbStatus: tournament.status,
    maxTeams: tournament.maxTeams,
    confirmedParticipants: tournament.confirmedTeams,
    archivedAt: tournament.archivedAt,
  });
  const capacityLabel = formatHomepageCapacityLabel(tournament);
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
  const canApply = isPublicApplicationAllowed({
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

  return (
    <article className="flex h-full flex-col bg-white p-4 ring-1 ring-line sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex bg-brand-yellow px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-navy uppercase">
          {tournament.ageGroup}
        </span>
        <StatusBadge status={effectiveStatus} />
      </div>

      <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-muted">
        <IconCalendar className="h-3.5 w-3.5 text-brand-yellow" />
        <time dateTime={tournament.date}>{formatDateDe(tournament.date)}</time>
      </p>

      <h3 className="mt-2 font-display text-lg font-bold tracking-wide text-ink uppercase break-words">
        {tournament.name}
      </h3>

      {tournament.location ? (
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] text-muted">
          <IconPin className="h-3.5 w-3.5 text-brand-yellow" />
          {tournament.location}
        </p>
      ) : null}

      {capacityLabel ? (
        <p className={cn(LIVE_TYPO.meta, "mt-3")}>{capacityLabel}</p>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {canApply ? (
          <Link
            href={`/turniere/${tournament.slug}/bewerben`}
            className="inline-flex h-10 items-center bg-brand-yellow px-3.5 text-[11px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            {applicationState === "waitlist" ? "Warteliste" : "Bewerben"}
          </Link>
        ) : null}
        <Link
          href={`/turniere/${tournament.slug}`}
          className="inline-flex h-10 items-center border border-line px-3.5 text-[11px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
        >
          Turnier ansehen
        </Link>
      </div>
    </article>
  );
}

export function HomeUpcomingSection({
  tournaments,
  applicationsEnabled,
  waitlistEnabled,
}: HomeUpcomingSectionProps) {
  if (tournaments.length === 0) {
    return null;
  }

  return (
    <section className="bg-surface py-10 sm:py-12" aria-labelledby="kommende-turniere">
      <Container>
        <div className="mb-6 flex flex-col gap-2 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="kommende-turniere" className={LIVE_TYPO.section}>
            Kommende Turniere
          </h2>
          <Link
            href="/turniere"
            className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
          >
            Alle Turniere →
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tournaments.map((tournament) => (
            <UpcomingCard
              key={tournament.id}
              tournament={tournament}
              applicationsEnabled={applicationsEnabled}
              waitlistEnabled={waitlistEnabled}
            />
          ))}
        </div>
      </Container>
    </section>
  );
}

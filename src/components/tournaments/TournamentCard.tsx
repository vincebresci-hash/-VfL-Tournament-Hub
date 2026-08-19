import Link from "next/link";
import { CoverImage } from "@/components/brand/CoverImage";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import { IconCalendar, IconPin } from "@/components/ui/icons";
import { formatDateDe } from "@/lib/format";
import { cn } from "@/lib/cn";
import { getTournamentHref, tournamentCtaLabel } from "@/lib/tournament-status";
import type { PublicTournament } from "@/types/tournament";

type TournamentCardProps = {
  tournament: PublicTournament;
};

export function TournamentCard({ tournament }: TournamentCardProps) {
  const ctaLabel = tournamentCtaLabel[tournament.status];
  const href = getTournamentHref(tournament.slug, tournament.status);
  const ctaClassName =
    "text-[12px] font-semibold tracking-[0.08em] uppercase focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow";

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[12px] border border-line bg-white shadow-[0_1px_2px_rgba(16,20,28,0.04)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-navy/12 hover:shadow-[0_8px_20px_rgba(16,20,28,0.06)]">
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

        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] text-muted">
          <IconPin className="h-3.5 w-3.5 text-brand-yellow" />
          {tournament.location}
        </p>

        <div className="mt-3">
          <StatusBadge status={tournament.status} />
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-3.5">
          <p className="text-[11px] font-medium tracking-[0.08em] text-ink uppercase">
            {tournament.maxTeams} Teams
          </p>
          {tournament.status === "coming-soon" ? (
            <span className={cn(ctaClassName, "text-muted")}>{ctaLabel}</span>
          ) : (
            <Link
              href={href}
              className={cn(
                ctaClassName,
                "text-ink transition-colors hover:text-brand-blue",
              )}
            >
              {ctaLabel}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

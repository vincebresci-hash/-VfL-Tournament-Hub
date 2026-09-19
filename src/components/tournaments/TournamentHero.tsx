import Link from "next/link";
import { TournamentImageFrame } from "@/components/brand/TournamentImageFrame";
import { IconCalendar, IconClock, IconPin, IconUsers } from "@/components/ui/icons";
import type { PublicApplicationStatusDisplay } from "@/lib/public-application-state";
import type { PublicApplicationState } from "@/lib/public-application-state";
import { tournamentImageObjectPosition } from "@/data/tournaments";
import type { AgeGroup } from "@/types/tournament";

type TournamentHeroProps = {
  name: string;
  slug: string;
  image?: string;
  ageGroup?: AgeGroup | null;
  dateIso: string;
  dateLabel: string;
  startTimeLabel?: string | null;
  location?: string | null;
  address?: string | null;
  shortDescription?: string | null;
  applicationState: PublicApplicationState;
  applicationStatusDisplay: PublicApplicationStatusDisplay;
  canApply: boolean;
  ctaLabel: string;
  /** Existing display-capacity availableSlots; presentation only. */
  availableSlots?: number | null;
  /** Show availability chip only when caller deems it appropriate. */
  showAvailability: boolean;
};

/**
 * V2-A presentational Hero. All values are pre-derived by the page;
 * no eligibility or capacity logic lives here.
 */
export function TournamentHero({
  name,
  slug,
  image,
  ageGroup,
  dateIso,
  dateLabel,
  startTimeLabel,
  location,
  address,
  shortDescription,
  applicationState,
  applicationStatusDisplay,
  canApply,
  ctaLabel,
  availableSlots,
  showAvailability,
}: TournamentHeroProps) {
  const venueLine = [location, address].filter(Boolean).join(" · ");

  return (
    <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-8">
      <TournamentImageFrame
        src={image}
        alt={name}
        variant="hero"
        className="w-full"
        aspectClassName="aspect-[16/9]"
        sizes="(min-width: 1024px) 50vw, 100vw"
        objectPosition={
          ageGroup
            ? tournamentImageObjectPosition(ageGroup)
            : "50% 50%"
        }
      />

      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-2">
          {ageGroup ? (
            <span className="inline-flex rounded-md bg-brand-yellow px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-navy uppercase">
              {ageGroup}
            </span>
          ) : null}
          <span
            className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase ${applicationStatusDisplay.className}`}
          >
            {applicationStatusDisplay.label}
          </span>
        </div>

        <h1 className="mt-4 font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
          {name}
        </h1>

        <ul className="mt-5 flex flex-col gap-2.5 text-[15px] text-muted">
          <li className="inline-flex items-start gap-2">
            <IconCalendar className="mt-0.5 h-4 w-4 shrink-0 text-navy/70" />
            <time dateTime={dateIso}>{dateLabel}</time>
          </li>
          {startTimeLabel ? (
            <li className="inline-flex items-start gap-2">
              <IconClock className="mt-0.5 h-4 w-4 shrink-0 text-navy/70" />
              <span>{startTimeLabel}</span>
            </li>
          ) : null}
          {venueLine ? (
            <li className="inline-flex items-start gap-2">
              <IconPin className="mt-0.5 h-4 w-4 shrink-0 text-navy/70" />
              <span>{venueLine}</span>
            </li>
          ) : null}
        </ul>

        {shortDescription ? (
          <p className="mt-5 max-w-xl text-[15px] leading-7 text-muted">
            {shortDescription}
          </p>
        ) : null}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch">
          {applicationState === "coming-soon" ? (
            <span className="inline-flex h-12 items-center justify-center rounded-lg border border-line bg-white px-5 text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
              Demnächst bewerben
            </span>
          ) : canApply ? (
            <Link
              href={`/turniere/${slug}/bewerben`}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-yellow px-5 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
            >
              <IconUsers className="h-4 w-4" />
              {ctaLabel}
            </Link>
          ) : null}

          {showAvailability && availableSlots != null ? (
            <div className="inline-flex min-h-12 items-center gap-2.5 rounded-lg border border-brand-yellow/50 bg-brand-yellow/20 px-4 py-2.5">
              <IconUsers className="h-4 w-4 shrink-0 text-navy" />
              <div className="min-w-0">
                <p className="text-[14px] font-bold leading-tight text-navy tabular-nums">
                  {availableSlots} freie Plätze
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

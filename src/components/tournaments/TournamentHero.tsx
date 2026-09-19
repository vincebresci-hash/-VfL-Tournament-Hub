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
    <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-7">
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

      <div className="flex min-w-0 flex-col justify-center">
        <div className="flex flex-wrap items-center gap-1.5">
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

        <h1 className="mt-3 font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl lg:text-[2.5rem] lg:leading-[1.08]">
          {name}
        </h1>

        <ul className="mt-3.5 flex flex-col gap-1.5 text-[14px] text-muted sm:text-[15px]">
          <li className="inline-flex items-start gap-2">
            <IconCalendar className="mt-0.5 h-4 w-4 shrink-0 text-navy/65" />
            <time dateTime={dateIso}>{dateLabel}</time>
          </li>
          {startTimeLabel ? (
            <li className="inline-flex items-start gap-2">
              <IconClock className="mt-0.5 h-4 w-4 shrink-0 text-navy/65" />
              <span>{startTimeLabel}</span>
            </li>
          ) : null}
          {venueLine ? (
            <li className="inline-flex items-start gap-2">
              <IconPin className="mt-0.5 h-4 w-4 shrink-0 text-navy/65" />
              <span>{venueLine}</span>
            </li>
          ) : null}
        </ul>

        {shortDescription ? (
          <p className="mt-3.5 max-w-xl text-[14px] leading-6 text-muted sm:text-[15px] sm:leading-7">
            {shortDescription}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          {applicationState === "coming-soon" ? (
            <span className="inline-flex h-11 items-center justify-center rounded-lg border border-line bg-white px-5 text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
              Demnächst bewerben
            </span>
          ) : canApply ? (
            <Link
              href={`/turniere/${slug}/bewerben`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-yellow px-5 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
            >
              <IconUsers className="h-4 w-4" />
              {ctaLabel}
            </Link>
          ) : null}

          {showAvailability && availableSlots != null ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-md border border-brand-yellow/40 bg-brand-yellow/15 px-2.5 py-1.5 text-[12px] font-semibold text-navy tabular-nums"
              aria-label={`${availableSlots} freie Plätze`}
            >
              <IconUsers className="h-3.5 w-3.5 shrink-0 text-navy/80" />
              {availableSlots} freie Plätze
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

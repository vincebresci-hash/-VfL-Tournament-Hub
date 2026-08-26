import Link from "next/link";
import { CoverImage } from "@/components/brand/CoverImage";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Container } from "@/components/layout/Container";
import { LIVE_TYPO } from "@/lib/live/match-center";
import { getDisplayCapacity } from "@/lib/public-tournament";
import {
  getPublicApplicationState,
  isPublicApplicationAllowed,
} from "@/lib/public-application-state";
import { daysUntilTournamentDate } from "@/lib/home/homepage-moment";
import { formatDateDe, formatTimeDe } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { HomepageHeroKind } from "@/lib/home/homepage-moment";
import type { PublicTournament } from "@/types/tournament";
import type { ReactNode } from "react";

type HomeHeroProps = {
  kind: HomepageHeroKind;
  tournament: PublicTournament | null;
  capacityLabel: string | null;
  fieldCount: number;
  matchCount: number;
  applicationsEnabled: boolean;
  waitlistEnabled: boolean;
  matchTeaser?: ReactNode;
};

function heroImageSrc(tournament: PublicTournament | null) {
  const src = tournament?.image?.trim();
  return src || null;
}

export function HomeHero({
  kind,
  tournament,
  capacityLabel,
  fieldCount,
  matchCount,
  applicationsEnabled,
  waitlistEnabled,
  matchTeaser,
}: HomeHeroProps) {
  const imageSrc = heroImageSrc(tournament);
  const capacity = tournament ? getDisplayCapacity(tournament) : null;

  const applicationState = tournament
    ? getPublicApplicationState({
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
      })
    : null;
  const canApply =
    tournament &&
    isPublicApplicationAllowed({
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

  const daysUntil =
    kind === "next" && tournament
      ? daysUntilTournamentDate(tournament.date)
      : null;

  return (
    <section className="relative overflow-hidden bg-navy text-white">
      {imageSrc ? (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[52%] lg:block xl:w-[54%]">
            <CoverImage
              src={imageSrc}
              alt={tournament?.name ? `Turnierbild ${tournament.name}` : "Turnierbild"}
              className="h-full w-full"
              sizes="54vw"
              preload
              objectPosition="62% 40%"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 hidden bg-[linear-gradient(90deg,#070b12_0%,#070b12_38%,rgba(7,11,18,0.92)_48%,rgba(7,11,18,0.55)_62%,rgba(7,11,18,0.18)_78%,rgba(7,11,18,0)_100%)] lg:block" />
        </>
      ) : null}

      <div className="relative">
        <SiteHeader variant="overlay" />

        <Container
          className={cn(
            kind === "hub" ? "py-12 sm:py-14 lg:py-16" : "py-8 sm:py-10 lg:py-12",
          )}
        >
          <div
            className={cn(
              "grid gap-8",
              imageSrc
                ? "lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)] lg:items-center lg:gap-10"
                : "max-w-3xl",
            )}
          >
            <div className="min-w-0">
              {kind === "live" ? (
                <span className={cn(LIVE_TYPO.badge, "bg-brand-yellow text-navy")}>
                  <span
                    className="h-2 w-2 animate-pulse rounded-full bg-brand-red"
                    aria-hidden
                  />
                  Live
                </span>
              ) : null}
              {kind === "next" ? (
                <span className={cn(LIVE_TYPO.badge, "bg-white/10 text-white")}>
                  Nächstes Turnier
                </span>
              ) : null}
              {kind === "hub" ? (
                <span className={cn(LIVE_TYPO.badge, "bg-white/10 text-brand-yellow")}>
                  Tournament Hub
                </span>
              ) : null}

              {kind === "hub" ? (
                <>
                  <h1 className="mt-4 font-display text-4xl font-bold tracking-wide uppercase sm:text-5xl lg:text-6xl">
                    VfL Tournament Center
                  </h1>
                  <p className="mt-4 max-w-xl text-[15px] leading-7 text-white/75 sm:text-base">
                    Neue Jugendturniere werden hier veröffentlicht. Spielplan, Ergebnisse
                    und Bewerbungen – zentral im Hub.
                  </p>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <Link
                      href="/turniere"
                      className="inline-flex h-11 items-center justify-center bg-brand-yellow px-5 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      Turniere entdecken
                    </Link>
                    <Link
                      href="/fuer-vereine"
                      className="inline-flex h-11 items-center justify-center border border-white/35 px-5 text-[12px] font-medium tracking-[0.1em] text-white uppercase transition-colors hover:border-white/70 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                    >
                      Für Vereine
                    </Link>
                  </div>
                </>
              ) : tournament ? (
                <>
                  <h1
                    className={cn(
                      "mt-3.5 font-display font-bold tracking-wide uppercase",
                      kind === "live"
                        ? "text-4xl sm:text-5xl lg:text-6xl"
                        : "text-3xl sm:text-4xl lg:text-5xl",
                    )}
                  >
                    {tournament.name}
                  </h1>

                  <p className="mt-3 text-[14px] text-white/75 sm:text-[15px]">
                    {[
                      tournament.ageGroup,
                      tournament.birthYear ? `Jahrgang ${tournament.birthYear}` : null,
                      formatDateDe(tournament.date),
                      kind === "next" ? formatTimeDe(tournament.startTime) : null,
                      tournament.location,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-white/80">
                    {capacityLabel ? <span>{capacityLabel}</span> : null}
                    {capacity && !capacityLabel ? (
                      <span>
                        {capacity.confirmedTeams} / {capacity.maxTeams} Teams
                      </span>
                    ) : null}
                    {kind === "live" && fieldCount > 0 ? (
                      <span>
                        {fieldCount} Feld{fieldCount === 1 ? "" : "er"}
                      </span>
                    ) : null}
                    {kind === "live" && matchCount > 0 ? (
                      <span>
                        {matchCount} Spiel{matchCount === 1 ? "" : "e"}
                      </span>
                    ) : null}
                    {daysUntil != null ? (
                      <span>
                        Noch {daysUntil} Tag{daysUntil === 1 ? "" : "e"}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    {kind === "live" ? (
                      <>
                        <Link
                          href="/live"
                          className="inline-flex h-11 items-center justify-center bg-brand-yellow px-5 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        >
                          Live verfolgen →
                        </Link>
                        <Link
                          href={`/turniere/${tournament.slug}`}
                          className="inline-flex h-11 items-center justify-center border border-white/35 px-5 text-[12px] font-medium tracking-[0.1em] text-white uppercase transition-colors hover:border-white/70 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                        >
                          Zum Turnier
                        </Link>
                      </>
                    ) : (
                      <>
                        {canApply ? (
                          <Link
                            href={`/turniere/${tournament.slug}/bewerben`}
                            className="inline-flex h-11 items-center justify-center bg-brand-yellow px-5 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                          >
                            {applicationState === "waitlist"
                              ? "Für Warteliste bewerben"
                              : "Bewerben"}
                          </Link>
                        ) : null}
                        <Link
                          href={`/turniere/${tournament.slug}`}
                          className={cn(
                            "inline-flex h-11 items-center justify-center px-5 text-[12px] font-semibold tracking-[0.08em] uppercase focus-visible:outline-2 focus-visible:outline-offset-2",
                            canApply
                              ? "border border-white/35 font-medium text-white hover:border-white/70 hover:bg-white/5 focus-visible:outline-brand-yellow"
                              : "bg-brand-yellow text-navy hover:bg-[#ffe066] focus-visible:outline-white",
                          )}
                        >
                          Turnier ansehen
                        </Link>
                      </>
                    )}
                  </div>

                  {matchTeaser ? <div className="mt-6 max-w-xl">{matchTeaser}</div> : null}
                </>
              ) : null}
            </div>

            {imageSrc ? (
              <div className="relative aspect-[16/11] w-full overflow-hidden lg:hidden">
                <CoverImage
                  src={imageSrc}
                  alt={tournament?.name ? `Turnierbild ${tournament.name}` : "Turnierbild"}
                  className="h-full w-full"
                  sizes="100vw"
                  objectPosition="50% 40%"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/25 to-transparent" />
              </div>
            ) : null}
          </div>
        </Container>
      </div>
    </section>
  );
}

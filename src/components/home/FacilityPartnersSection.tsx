import Link from "next/link";
import { CoverImage } from "@/components/brand/CoverImage";
import { Container } from "@/components/layout/Container";
import {
  CLUB_CITY,
  CLUB_NAME,
  CLUB_POSTAL_CODE,
  CLUB_STREET,
  OFFICIAL_CLUB_WEBSITE,
  TOURNAMENT_VENUE_OUTDOOR,
} from "@/data/club";
import { media } from "@/lib/constants";

/**
 * Anlage + Partner auf der Homepage.
 * Keine Sponsornamen oder Logos hardcoden — im Projekt liegen keine
 * verlässlichen Partner-Assets vor. CTA führt auf /partner und die
 * offizielle Vereins-Sponsorenübersicht.
 */
export function FacilityPartnersSection() {
  return (
    <section
      className="bg-background pt-2 pb-12 sm:pt-3 lg:pb-16"
      aria-labelledby="unsere-anlage unsere-partner"
    >
      <Container>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] lg:gap-5 xl:gap-6">
          <article className="overflow-hidden rounded-[12px] border border-line bg-white">
            <div className="px-5 pt-5 sm:px-6 sm:pt-6">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
                Standort
              </p>
              <h2
                id="unsere-anlage"
                className="mt-2 font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-[2rem]"
              >
                Unsere Anlage
              </h2>
            </div>

            <div className="mt-5 px-5 sm:px-6">
              <CoverImage
                src={media.facility}
                alt={`Sportanlage von ${CLUB_NAME} an der ${TOURNAMENT_VENUE_OUTDOOR}`}
                className="aspect-[16/10] w-full"
                sizes="(min-width: 1280px) 700px, (min-width: 1024px) 60vw, 100vw"
                objectPosition="50% 45%"
              />
            </div>

            <div className="px-5 pt-5 pb-6 sm:px-6 sm:pb-7">
              <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                {TOURNAMENT_VENUE_OUTDOOR}
              </p>
              <p className="mt-2 max-w-xl text-[14px] leading-6 text-muted">
                {CLUB_NAME}
                <br />
                {CLUB_STREET}
                <br />
                {CLUB_POSTAL_CODE} {CLUB_CITY}
              </p>
              <Link
                href="/anlage"
                className="mt-5 inline-flex min-h-11 items-center text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
              >
                Anfahrt →
              </Link>
            </div>
          </article>

          <article className="flex flex-col overflow-hidden rounded-[12px] border border-line bg-white">
            <div className="flex flex-1 flex-col px-5 py-5 sm:px-6 sm:py-6">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
                Sponsoring
              </p>
              <h2
                id="unsere-partner"
                className="mt-2 font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-[2rem]"
              >
                Unsere Partner
              </h2>
              <p className="mt-3 text-[14px] leading-6 text-muted">
                Gemeinsam für den Jugendfußball.
              </p>

              <div className="mt-8 flex flex-1 flex-col justify-center border border-dashed border-line bg-surface/60 px-5 py-8 text-center sm:py-10">
                <span
                  className="mx-auto block h-1 w-10 bg-brand-yellow"
                  aria-hidden="true"
                />
                <p className="mt-5 text-[13px] leading-6 text-muted">
                  Partner und Sponsoren unterstützen die Nachwuchsturniere von{" "}
                  {CLUB_NAME}. Die aktuelle Übersicht veröffentlicht der Verein
                  auf seiner Website.
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <Link
                  href="/partner"
                  className="inline-flex min-h-11 w-full items-center justify-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                >
                  Partner entdecken →
                </Link>
                <a
                  href={`${OFFICIAL_CLUB_WEBSITE}sponsoren/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center justify-center text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                >
                  Sponsoren auf der Vereinswebsite
                  <span className="sr-only"> (öffnet in neuem Tab)</span>
                </a>
              </div>
            </div>
          </article>
        </div>
      </Container>
    </section>
  );
}

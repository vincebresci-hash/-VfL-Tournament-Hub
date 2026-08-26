import Link from "next/link";
import { CoverImage } from "@/components/brand/CoverImage";
import { Container } from "@/components/layout/Container";
import { IconPin } from "@/components/ui/icons";
import {
  CLUB_CITY,
  CLUB_NAME,
  CLUB_POSTAL_CODE,
  CLUB_STREET,
  TOURNAMENT_VENUE_OUTDOOR,
} from "@/data/club";
import { media } from "@/lib/constants";

/**
 * Volle Breite „Unsere Anlage“ unter den drei Info-Karten.
 * Partner sitzt als gleichwertige Info-Karte in InfoSection.
 */
export function FacilityPartnersSection() {
  return (
    <section
      className="bg-background pt-2 pb-12 sm:pt-3 lg:pb-16"
      aria-labelledby="unsere-anlage"
    >
      <Container>
        <article className="overflow-hidden rounded-[12px] border border-line bg-white shadow-[0_1px_2px_rgba(16,20,28,0.04)]">
          <div className="px-5 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pt-7">
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

          <div className="mt-4 grid grid-cols-1 lg:mt-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-stretch lg:gap-0">
            <div className="lg:px-8 lg:pb-8">
              <CoverImage
                src={media.facility}
                alt={`Sportanlage von ${CLUB_NAME} an der ${TOURNAMENT_VENUE_OUTDOOR}`}
                className="aspect-[16/10] w-full lg:aspect-[16/11] lg:h-full lg:min-h-[280px] lg:rounded-[10px]"
                sizes="(min-width: 1280px) 720px, (min-width: 1024px) 55vw, 100vw"
                objectPosition="50% 45%"
              />
            </div>

            <div className="flex flex-col justify-center px-5 pt-5 pb-5 sm:px-6 sm:pt-6 sm:pb-6 lg:px-8 lg:pt-0 lg:pb-8">
              <div className="flex items-start gap-3">
                <IconPin
                  className="mt-0.5 h-5 w-5 shrink-0 text-brand-yellow"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold tracking-wide text-ink uppercase sm:text-xl">
                    {TOURNAMENT_VENUE_OUTDOOR}
                  </p>
                  <p className="mt-2.5 text-[14px] leading-6 text-muted sm:text-[15px] sm:leading-7">
                    {CLUB_NAME}
                    <br />
                    {CLUB_STREET}
                    <br />
                    {CLUB_POSTAL_CODE} {CLUB_CITY}
                  </p>
                </div>
              </div>

              <span
                className="mt-4 block h-0.5 w-10 bg-brand-yellow sm:mt-5"
                aria-hidden="true"
              />

              <p className="mt-4 max-w-sm text-[13px] leading-5 text-muted">
                Anreise- und Parkinformationen findest du über die Vereinsseite.
              </p>

              <Link
                href="/anlage"
                className="mt-5 inline-flex min-h-11 w-fit items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
              >
                Anfahrt →
              </Link>
            </div>
          </div>
        </article>
      </Container>
    </section>
  );
}

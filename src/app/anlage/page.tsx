import type { Metadata } from "next";
import { withCanonical } from "@/lib/site";
import Link from "next/link";
import { ContentPage } from "@/components/layout/ContentPage";
import { CoverImage } from "@/components/brand/CoverImage";
import {
  CLUB_CITY_LONG,
  CLUB_NAME,
  TOURNAMENT_VENUE_INDOOR_GENERIC,
  TOURNAMENT_VENUE_OUTDOOR,
} from "@/data/club";
import { media } from "@/lib/constants";

export const metadata: Metadata = withCanonical("/anlage", {
  title: "Unsere Anlage"
});

export default function AnlagePage() {
  return (
    <ContentPage
      title="Unsere Anlage"
      description={`Die Nachwuchsturniere von ${CLUB_NAME} finden an der ${TOURNAMENT_VENUE_OUTDOOR} in ${CLUB_CITY_LONG} statt – und teilweise in den ${TOURNAMENT_VENUE_INDOOR_GENERIC}. Die Sportanlagen sind ein wichtiger Bestandteil dieser Turniere.`}
    >
      <CoverImage
        src={media.facility}
        alt={`Sportanlage von ${CLUB_NAME} in ${CLUB_CITY_LONG}`}
        className="aspect-[16/9] w-full rounded-[12px]"
        sizes="(min-width: 1024px) 1100px, 100vw"
        preload
        objectPosition="50% 45%"
      />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="border border-line bg-white p-6">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Standort
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-muted">
            {CLUB_NAME} richtet Nachwuchsturniere an der {TOURNAMENT_VENUE_OUTDOOR}{" "}
            in {CLUB_CITY_LONG} aus. Einzelne Turniere finden in den{" "}
            {TOURNAMENT_VENUE_INDOOR_GENERIC} statt.
          </p>
          <p className="mt-3 text-[15px] leading-7 text-muted">
            Welche Sportstätte für ein konkretes Turnier gilt, steht in den
            jeweiligen Turnierdetails.
          </p>
        </section>
        <section className="border border-line bg-white p-6">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Turnierdetails
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-muted">
            Weitere Hinweise zum Ablauf – etwa Anfahrt oder organisatorische
            Informationen – veröffentlicht der Veranstalter je Turnier, sobald
            sie hinterlegt sind.
          </p>
          <Link
            href="/turniere"
            className="mt-5 inline-flex text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
          >
            Zu den Turnieren →
          </Link>
        </section>
      </div>
    </ContentPage>
  );
}

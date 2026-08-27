import type { Metadata } from "next";
import { withCanonical } from "@/lib/site";
import Link from "next/link";
import { ContentPage } from "@/components/layout/ContentPage";
import { CoverImage } from "@/components/brand/CoverImage";
import { CLUB_NAME, CLUB_SLOGAN } from "@/data/club";
import { HUB_NAME, media } from "@/lib/constants";

export const metadata: Metadata = withCanonical("/ueber-uns", {
  title: "Über uns"
});

const hubFeatures = [
  "Turniere entdecken",
  "Mannschaften bewerben",
  "Bewerbungsstatus verfolgen",
  "Teilnehmer anzeigen",
  "Gruppen anzeigen",
  "Spielplan anzeigen",
  "Ergebnisse und Tabellen verfolgen",
  "KO-Runden darstellen",
];

export default function UeberUnsPage() {
  return (
    <ContentPage
      title="Über uns"
      description={`${CLUB_NAME} – ${CLUB_SLOGAN}. Die Nachwuchsturniere haben Tradition. Dieser Tournament Hub unterstützt ihre Organisation digital.`}
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
        <div>
          <p className="font-display text-xl font-bold tracking-wide text-ink uppercase">
            {CLUB_NAME}
          </p>
          <p className="mt-2 text-[15px] font-medium tracking-[0.06em] text-muted uppercase">
            {CLUB_SLOGAN}
          </p>
          <p className="mt-6 max-w-2xl text-[15px] leading-7 text-muted">
            Die Nachwuchsturniere von {CLUB_NAME} haben Tradition. Der {HUB_NAME}{" "}
            soll die Organisation dieser Turniere digital unterstützen: von der
            Bewerbung bis zum Spielbetrieb.
          </p>
          <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted">
            Eine Bewerbung ist keine automatische Zusage. Die Turnierorganisation
            prüft die Angaben und gibt anschließend Rückmeldung.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/fuer-vereine"
              className="inline-flex h-11 items-center justify-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066]"
            >
              Für Vereine
            </Link>
            <Link
              href="/kontakt"
              className="inline-flex h-11 items-center justify-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20"
            >
              Kontakt
            </Link>
          </div>
        </div>
        <CoverImage
          src={media.hero}
          alt={`Jugendmannschaft von ${CLUB_NAME}`}
          className="aspect-[4/3] w-full rounded-[12px]"
          sizes="(min-width: 1024px) 480px, 100vw"
          objectPosition="74% 42%"
        />
      </div>

      <section className="mt-12 border border-line bg-white p-6 sm:p-8">
        <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
          Was der Tournament Hub leistet
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted">
          Im Hub können Vereine und Mannschaften die veröffentlichten
          Nachwuchsturniere digital begleiten.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {hubFeatures.map((item) => (
            <li
              key={item}
              className="border border-line bg-surface px-4 py-3 text-[14px] text-ink"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>
    </ContentPage>
  );
}

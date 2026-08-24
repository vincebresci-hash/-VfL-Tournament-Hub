import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/layout/ContentPage";
import { CoverImage } from "@/components/brand/CoverImage";
import { CLUB_NAME, HUB_NAME, media } from "@/lib/constants";

export const metadata: Metadata = { title: "Über uns" };

export default function UeberUnsPage() {
  return (
    <ContentPage
      title="Über uns"
      description={`${CLUB_NAME} organisiert Jugendfußballturniere. Dieser Tournament Hub ist die offizielle Plattform für Bewerbung, Status und Spielbetrieb.`}
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
        <div>
          <p className="max-w-2xl text-[15px] leading-7 text-muted">
            Der {HUB_NAME} bündelt die Jugendturniere von {CLUB_NAME}: offene
            Termine, Bewerbung – auch ohne Vereinskonto – und später Gruppen,
            Spielplan, Tabelle und KO-Runde. Eine Bewerbung ist keine automatische
            Zusage.
          </p>
          <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted">
            Veranstalter ist {CLUB_NAME}, Bereich Jugendturniere. Spielort der
            veröffentlichten Turniere ist in der Regel der Sportpark Kirchheim.
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
          alt="Jugendmannschaft des VfL Kirchheim mit Vereinsfahne im Sportpark Kirchheim"
          className="aspect-[4/3] w-full rounded-[12px]"
          sizes="(min-width: 1024px) 480px, 100vw"
          objectPosition="74% 42%"
        />
      </div>
    </ContentPage>
  );
}

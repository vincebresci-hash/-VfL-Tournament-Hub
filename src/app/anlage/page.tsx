import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/ContentPage";
import { CoverImage } from "@/components/brand/CoverImage";
import { media } from "@/lib/constants";
import Link from "next/link";

export const metadata: Metadata = { title: "Unsere Anlage" };

export default function AnlagePage() {
  return (
    <ContentPage
      title="Unsere Anlage"
      description="Jugendturniere des VfL Kirchheim finden im Sportpark Kirchheim statt. Konkrete Hinweise zu Anfahrt, Parken und Abläufen stehen in den jeweiligen Turnierdetails, sobald sie hinterlegt sind."
    >
      <CoverImage
        src={media.facility}
        alt="Sportpark Kirchheim bei Flutlicht"
        className="aspect-[16/9] w-full rounded-[12px]"
        sizes="(min-width: 1024px) 1100px, 100vw"
        preload
        objectPosition="50% 45%"
      />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="border border-line bg-white p-6">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Anlage
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-muted">
            Spielort der veröffentlichten Jugendturniere ist der Sportpark
            Kirchheim, sofern auf der Turnierseite kein anderer Ort angegeben ist.
          </p>
        </section>
        <section className="border border-line bg-white p-6">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Turnierdetails
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-muted">
            Anfahrt, Parken, Spielflächen, Umkleiden und Verpflegung werden je
            Turnier veröffentlicht – nur wenn der Veranstalter sie hinterlegt hat.
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

import Link from "next/link";
import { CoverImage } from "@/components/brand/CoverImage";
import { FeatureItem } from "@/components/home/FeatureItem";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Container } from "@/components/layout/Container";
import { media } from "@/lib/constants";
import {
  IconClipboard,
  IconMessage,
  IconShield,
} from "@/components/ui/icons";

const heroImageAlt =
  "Jugendmannschaft des VfL Kirchheim mit Vereinsfahne im Sportpark Kirchheim";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-navy text-white">
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[58%] lg:block xl:w-[60%]">
        <CoverImage
          src={media.hero}
          alt={heroImageAlt}
          className="h-full w-full"
          sizes="60vw"
          preload
          objectPosition="78% 46%"
        />
      </div>
      <div className="pointer-events-none absolute inset-0 hidden bg-[linear-gradient(90deg,#070b12_0%,#070b12_36%,rgba(7,11,18,0.94)_44%,rgba(7,11,18,0.62)_54%,rgba(7,11,18,0.28)_68%,rgba(7,11,18,0.08)_82%,rgba(7,11,18,0)_100%)] lg:block" />

      <div className="relative">
        <SiteHeader variant="overlay" />

        <Container className="py-10 lg:py-12 xl:py-14">
          <div className="max-w-xl xl:max-w-2xl">
            <h1 className="font-display text-5xl leading-[0.9] font-bold tracking-tight uppercase sm:text-6xl lg:text-[4.75rem]">
              <span className="block">Gemeinsam.</span>
              <span className="block">Leidenschaft.</span>
              <span className="block text-brand-yellow">Zukunft.</span>
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-7 text-white/74 sm:text-base">
              Der offizielle Tournament Hub des VfL Kirchheim.
              Einfach bewerben, schnell Rückmeldung erhalten.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/turniere"
                className="inline-flex h-11 items-center justify-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Aktuelle Turniere
              </Link>
              <Link
                href="/fuer-vereine"
                className="inline-flex h-11 items-center justify-center border border-white/35 px-4 text-[12px] font-medium tracking-[0.1em] text-white uppercase transition-colors hover:border-white/70 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
              >
                Für Vereine
              </Link>
            </div>

            <div className="mt-8 grid gap-5 border-t border-white/10 pt-6 sm:grid-cols-3 sm:gap-6">
              <FeatureItem
                icon={<IconClipboard className="h-5 w-5" />}
                title="Einfache Anmeldung"
                description="In wenigen Minuten bewerben"
              />
              <FeatureItem
                icon={<IconMessage className="h-5 w-5" />}
                title="Schnelle Rückmeldung"
                description="Wir melden uns so schnell wie möglich"
              />
              <FeatureItem
                icon={<IconShield className="h-5 w-5" />}
                title="Fair & Transparent"
                description="Klare Auswahl nach sportlichen Kriterien"
              />
            </div>
          </div>
        </Container>

        <div className="relative h-64 w-full sm:h-80 lg:hidden">
          <CoverImage
            src={media.hero}
            alt={heroImageAlt}
            className="h-full w-full"
            sizes="100vw"
            objectPosition="74% 42%"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy/40 to-navy/25" />
        </div>
      </div>
    </section>
  );
}

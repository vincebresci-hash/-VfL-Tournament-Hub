import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { CoverImage } from "@/components/brand/CoverImage";
import { Container } from "@/components/layout/Container";
import { cn } from "@/lib/cn";
import {
  CLUB_CITY,
  CLUB_NAME,
  CLUB_POSTAL_CODE,
  CLUB_STREET,
} from "@/data/club";
import { media } from "@/lib/constants";
import {
  IconCheck,
  IconClubs,
  IconPin,
  IconShield,
  IconUsers,
} from "@/components/ui/icons";

type InfoColumn = {
  title: string;
  href: string;
  linkLabel: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  items: string[];
};

const columns: InfoColumn[] = [
  {
    title: "Für Vereine",
    href: "/fuer-vereine",
    linkLabel: "Mehr erfahren →",
    icon: IconUsers,
    items: [
      "Online bewerben, auch als Gast",
      "Mehrere Mannschaften möglich",
      "Status im Vereinskonto verfolgen",
      "Spielplan und Ergebnisse im Hub",
    ],
  },
  {
    title: "Warum VfL Kirchheim/Teck?",
    href: "/ueber-uns",
    linkLabel: "Mehr erfahren →",
    icon: IconShield,
    items: [
      "Nachwuchsturniere mit Tradition",
      "Bewerbung ohne automatische Zusage",
      "Jesinger Allee in Kirchheim unter Teck",
      "Fußball aus Leidenschaft",
    ],
  },
  {
    title: "Unsere Partner",
    href: "/partner",
    linkLabel: "Partner entdecken →",
    icon: IconClubs,
    items: [
      "Gemeinsam für den Jugendfußball",
      "Starke Partner aus der Region",
      "Unterstützung unserer Jugendturniere",
      "Gemeinsam für Nachwuchs & Verein",
    ],
  },
];

const cardClassName = cn(
  "flex h-full flex-col overflow-hidden rounded-[12px] border border-line bg-white",
  "shadow-[0_1px_2px_rgba(16,20,28,0.04)]",
  "motion-safe:transition-[transform,box-shadow,border-color] motion-safe:duration-200",
  "[@media(hover:hover)]:hover:-translate-y-0.5",
  "[@media(hover:hover)]:hover:border-navy/12",
  "[@media(hover:hover)]:hover:shadow-[0_8px_18px_rgba(16,20,28,0.07)]",
);

const cardBodyClassName = "flex flex-1 flex-col px-5 py-5 sm:px-6 sm:py-6 lg:px-7 lg:py-7";

const ctaClassName =
  "mt-3 inline-flex min-h-11 items-center text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow sm:mt-3.5 lg:mt-4";

export function InfoSection() {
  return (
    <section
      className="bg-background pt-2 pb-12 sm:pt-3 lg:pb-16"
      aria-label="Informationen"
    >
      <Container>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-4 xl:grid-cols-4 xl:gap-5">
          {columns.map((column) => {
            const Icon = column.icon;

            return (
              <article key={column.title} className={cardClassName}>
                <div className={cardBodyClassName}>
                  <Icon
                    className="h-7 w-7 shrink-0 text-brand-yellow"
                    aria-hidden="true"
                  />
                  <h2 className="mt-3.5 font-display text-lg font-bold tracking-wide text-ink uppercase sm:mt-4">
                    {column.title}
                  </h2>

                  <ul className="mt-3.5 flex flex-1 flex-col gap-2.5 sm:mt-4">
                    {column.items.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-[13px] leading-5 text-muted"
                      >
                        <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-yellow" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <Link href={column.href} className={ctaClassName}>
                    {column.linkLabel}
                  </Link>
                </div>
              </article>
            );
          })}

          <article className={cardClassName}>
            <CoverImage
              src={media.facility}
              alt={`Sportanlage von ${CLUB_NAME}`}
              className="aspect-[16/9] w-full shrink-0 xl:aspect-[2/1]"
              sizes="(min-width: 1280px) 280px, (min-width: 768px) 45vw, 100vw"
              objectPosition="50% 42%"
            />
            <div className={cardBodyClassName}>
              <div className="flex items-start gap-2">
                <IconPin
                  className="mt-0.5 h-5 w-5 shrink-0 text-brand-yellow"
                  aria-hidden="true"
                />
                <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                  Unsere Anlage
                </h2>
              </div>

              <ul className="mt-3.5 flex flex-1 flex-col gap-2.5 sm:mt-4">
                <li className="flex items-start gap-2 text-[13px] leading-5 text-muted">
                  <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-yellow" />
                  <span>Jesinger Allee in Kirchheim unter Teck</span>
                </li>
                <li className="flex items-start gap-2 text-[13px] leading-5 text-muted">
                  <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-yellow" />
                  <span>{CLUB_NAME}</span>
                </li>
                <li className="flex items-start gap-2 text-[13px] leading-5 text-muted">
                  <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-yellow" />
                  <span>{CLUB_STREET}</span>
                </li>
                <li className="flex items-start gap-2 text-[13px] leading-5 text-muted">
                  <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-yellow" />
                  <span>
                    {CLUB_POSTAL_CODE} {CLUB_CITY}
                  </span>
                </li>
              </ul>

              <Link href="/anlage" className={ctaClassName}>
                Anlage entdecken →
              </Link>
            </div>
          </article>
        </div>
      </Container>
    </section>
  );
}

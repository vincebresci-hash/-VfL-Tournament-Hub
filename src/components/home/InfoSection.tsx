import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { CoverImage } from "@/components/brand/CoverImage";
import { Container } from "@/components/layout/Container";
import { cn } from "@/lib/cn";
import { media } from "@/lib/constants";
import {
  IconCheck,
  IconShield,
  IconStadium,
  IconTrophy,
  IconUsers,
} from "@/components/ui/icons";

type InfoColumn = {
  title: string;
  href: string;
  linkLabel: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  items?: string[];
  image?: boolean;
};

const columns: InfoColumn[] = [
  {
    title: "Für Vereine",
    href: "/fuer-vereine",
    linkLabel: "Mehr erfahren →",
    icon: IconUsers,
    items: [
      "Einfache Online-Anmeldung",
      "Mehrere Teams melden",
      "Turnierinfos auf einen Blick",
      "Schnelle Rückmeldung",
    ],
  },
  {
    title: "Für Veranstalter",
    href: "/login",
    linkLabel: "Mehr erfahren →",
    icon: IconTrophy,
    items: [
      "Übersichtliches Dashboard",
      "Bewerbungen verwalten",
      "Automatische Kommunikation",
      "Turniere optimal planen",
    ],
  },
  {
    title: "Warum VfL Kirchheim?",
    href: "/ueber-uns",
    linkLabel: "Mehr erfahren →",
    icon: IconShield,
    items: [
      "Top organisierte Jugendturniere",
      "Faire & ausgeglichene Spiele",
      "Moderne Sportanlage",
      "Leidenschaft für den Fußball",
    ],
  },
  {
    title: "Unsere Anlage",
    href: "/anlage",
    linkLabel: "Anlage ansehen →",
    icon: IconStadium,
    image: true,
  },
];

export function InfoSection() {
  return (
    <section className="bg-background pt-2 pb-12 sm:pt-3 lg:pb-14" aria-label="Informationen">
      <Container>
        <div className="overflow-hidden rounded-[12px] border border-line bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
            {columns.map((column, index) => {
              const Icon = column.icon;

              return (
                <article
                  key={column.title}
                  className={cn(
                    "flex flex-col p-6 sm:p-7",
                    index > 0 && "border-t border-line",
                    index <= 1 && "md:border-t-0",
                    index > 1 && "md:border-t xl:border-t-0",
                    index % 2 === 1 && "md:border-l",
                    index >= 1 && "xl:border-l",
                  )}
                >
                  <Icon className="h-7 w-7 text-brand-yellow" />
                  <h2 className="mt-4 font-display text-lg font-bold tracking-wide text-ink uppercase">
                    {column.title}
                  </h2>

                  {column.items ? (
                    <ul className="mt-4 flex flex-col gap-2.5">
                      {column.items.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-[13px] leading-5 text-muted">
                          <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-yellow" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {column.image ? (
                    <CoverImage
                      src={media.facility}
                      alt="Sportpark Kirchheim bei Flutlicht"
                      className="mt-4 aspect-[16/10] w-full rounded-[10px]"
                      sizes="(min-width: 1280px) 300px, (min-width: 768px) 50vw, 100vw"
                      objectPosition="50% 45%"
                    />
                  ) : null}

                  <Link
                    href={column.href}
                    className="mt-5 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
                  >
                    {column.linkLabel}
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}

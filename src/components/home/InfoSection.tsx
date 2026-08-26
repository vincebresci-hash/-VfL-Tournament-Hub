import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { cn } from "@/lib/cn";
import {
  IconCheck,
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
];

export function InfoSection() {
  return (
    <section className="bg-background pt-2 pb-8 sm:pt-3 lg:pb-10" aria-label="Informationen">
      <Container>
        <div className="overflow-hidden rounded-[12px] border border-line bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2">
            {columns.map((column, index) => {
              const Icon = column.icon;

              return (
                <article
                  key={column.title}
                  className={cn(
                    "flex flex-col p-6 sm:p-7",
                    index > 0 && "border-t border-line md:border-t-0 md:border-l",
                  )}
                >
                  <Icon className="h-7 w-7 text-brand-yellow" />
                  <h2 className="mt-4 font-display text-lg font-bold tracking-wide text-ink uppercase">
                    {column.title}
                  </h2>

                  <ul className="mt-4 flex flex-col gap-2.5">
                    {column.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-[13px] leading-5 text-muted">
                        <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-yellow" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

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

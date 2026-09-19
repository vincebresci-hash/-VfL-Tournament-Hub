import type { ReactNode } from "react";
import {
  IconCalendar,
  IconClipboard,
  IconClock,
  IconPin,
  IconShield,
  IconUsers,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export type TournamentInfoFact = {
  label: string;
  value: string;
  /** Optional quieter line under the primary value (e.g. planned end). */
  hint?: string;
};

const PRIMARY_LABELS = new Set([
  "Datum",
  "Startzeit",
  "Geplantes Ende",
  "Veranstaltungsort",
  "Adresse",
  "Altersklasse",
  "Jahrgang",
]);

function iconForLabel(label: string): ReactNode {
  const className = "h-4 w-4 text-navy/65";
  switch (label) {
    case "Datum":
    case "Bewerbungsstart":
    case "Bewerbungsfrist":
      return <IconCalendar className={className} />;
    case "Startzeit":
    case "Geplantes Ende":
      return <IconClock className={className} />;
    case "Veranstaltungsort":
    case "Adresse":
      return <IconPin className={className} />;
    case "Altersklasse":
    case "Jahrgang":
      return <IconShield className={className} />;
    case "Max. Teams":
    case "Bestätigte Teams":
    case "Freie Plätze":
    case "Warteliste":
      return <IconUsers className={className} />;
    default:
      return <IconClipboard className={className} />;
  }
}

type TournamentInfoGridProps = {
  facts: TournamentInfoFact[];
};

/**
 * V2-A Turnierinfos — presentation only. Fact values are prepared by the page.
 */
export function TournamentInfoGrid({ facts }: TournamentInfoGridProps) {
  if (facts.length === 0) {
    return null;
  }

  const primary = facts.filter((fact) => PRIMARY_LABELS.has(fact.label));
  const secondary = facts.filter((fact) => !PRIMARY_LABELS.has(fact.label));

  return (
    <section className="mt-10 sm:mt-12">
      <h2 className="font-display text-xl font-bold tracking-[0.06em] text-ink uppercase sm:text-2xl">
        <span className="mr-2 inline-block h-4 w-1 translate-y-0.5 bg-brand-yellow align-middle" aria-hidden="true" />
        Turnierinfos
      </h2>

      {primary.length > 0 ? (
        <dl className="mt-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {primary.map((fact) => (
            <InfoCard key={fact.label} fact={fact} emphasis="primary" />
          ))}
        </dl>
      ) : null}

      {secondary.length > 0 ? (
        <dl
          className={cn(
            "grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3",
            primary.length > 0 ? "mt-3" : "mt-5",
          )}
        >
          {secondary.map((fact) => (
            <InfoCard key={fact.label} fact={fact} emphasis="secondary" />
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function InfoCard({
  fact,
  emphasis,
}: {
  fact: TournamentInfoFact;
  emphasis: "primary" | "secondary";
}) {
  const isFreeSlots = fact.label === "Freie Plätze";

  return (
    <div
      className={cn(
        "rounded-[10px] border px-3.5 py-3",
        isFreeSlots
          ? "border-brand-yellow/60 bg-brand-yellow/25"
          : emphasis === "primary"
            ? "border-line bg-white shadow-[0_1px_2px_rgba(16,20,28,0.04)]"
            : "border-line/80 bg-white/90",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0" aria-hidden="true">
          {iconForLabel(fact.label)}
        </span>
        <div className="min-w-0 flex-1">
          <dt
            className={cn(
              "text-[10px] font-semibold tracking-[0.1em] uppercase",
              isFreeSlots ? "text-navy/70" : "text-muted",
            )}
          >
            {fact.label}
          </dt>
          <dd
            className={cn(
              "mt-1 text-[15px] leading-snug",
              isFreeSlots
                ? "font-bold text-navy tabular-nums"
                : emphasis === "primary"
                  ? "font-semibold text-ink"
                  : "text-ink",
            )}
          >
            {fact.value}
          </dd>
          {fact.hint ? (
            <p className="mt-0.5 text-[12px] leading-5 text-muted">{fact.hint}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

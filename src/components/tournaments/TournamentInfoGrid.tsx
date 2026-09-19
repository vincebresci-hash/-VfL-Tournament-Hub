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

/** Natural tournament reading order for primary facts. */
const PRIMARY_ORDER = [
  "Datum",
  "Startzeit",
  "Geplantes Ende",
  "Veranstaltungsort",
  "Adresse",
  "Altersklasse",
  "Jahrgang",
] as const;

const PRIMARY_LABELS = new Set<string>(PRIMARY_ORDER);

/** Quieter secondary reading order. */
const SECONDARY_ORDER = [
  "Max. Teams",
  "Bestätigte Teams",
  "Freie Plätze",
  "Bewerbungsstart",
  "Bewerbungsfrist",
  "Warteliste",
] as const;

function sortByOrder(
  facts: TournamentInfoFact[],
  order: readonly string[],
): TournamentInfoFact[] {
  const rank = new Map(order.map((label, index) => [label, index]));
  return [...facts].sort((a, b) => {
    const ai = rank.get(a.label) ?? 999;
    const bi = rank.get(b.label) ?? 999;
    return ai - bi;
  });
}

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

  const primary = sortByOrder(
    facts.filter((fact) => PRIMARY_LABELS.has(fact.label)),
    PRIMARY_ORDER,
  );
  const secondary = sortByOrder(
    facts.filter((fact) => !PRIMARY_LABELS.has(fact.label)),
    SECONDARY_ORDER,
  );

  return (
    <section className="mt-7 sm:mt-8">
      <h2 className="font-display text-lg font-bold tracking-[0.06em] text-ink uppercase sm:text-xl">
        <span
          className="mr-2 inline-block h-3.5 w-1 translate-y-0.5 bg-brand-yellow align-middle"
          aria-hidden="true"
        />
        Turnierinfos
      </h2>

      {primary.length > 0 ? (
        <dl className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {primary.map((fact) => (
            <InfoCard key={fact.label} fact={fact} emphasis="primary" />
          ))}
        </dl>
      ) : null}

      {secondary.length > 0 ? (
        <dl
          className={cn(
            "grid gap-2 sm:grid-cols-2 xl:grid-cols-3",
            primary.length > 0 ? "mt-2.5" : "mt-4",
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
        "rounded-[10px] border bg-white",
        emphasis === "primary"
          ? "border-line px-3.5 py-3 shadow-[0_1px_2px_rgba(16,20,28,0.04)]"
          : "border-line/70 px-3 py-2.5",
        isFreeSlots && "border-brand-yellow/45",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0" aria-hidden="true">
          {iconForLabel(fact.label)}
        </span>
        <div className="min-w-0 flex-1">
          <dt className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
            {fact.label}
          </dt>
          <dd
            className={cn(
              "mt-0.5 leading-snug text-ink",
              emphasis === "primary"
                ? "text-[15px] font-semibold sm:text-base"
                : "text-[14px]",
            )}
          >
            {isFreeSlots ? (
              <span className="inline-flex items-center rounded-sm bg-brand-yellow/30 px-1.5 py-0.5 font-bold text-navy tabular-nums">
                {fact.value}
              </span>
            ) : (
              fact.value
            )}
          </dd>
          {fact.hint ? (
            <p className="mt-0.5 text-[12px] leading-5 text-muted">{fact.hint}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

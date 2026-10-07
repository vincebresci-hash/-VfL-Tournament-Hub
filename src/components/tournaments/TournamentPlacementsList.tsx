import { TeamNameWithLogo } from "@/components/tournaments/TeamNameWithLogo";
import { cn } from "@/lib/cn";

export type PlacementListRow = {
  id: string;
  place: number;
  label: string;
  logoUrl?: string | null;
  clubName?: string | null;
};

type TournamentPlacementsListProps = {
  placements: PlacementListRow[];
  headingId?: string;
  title?: string;
  /** Compact KO card vs overview article surface. */
  density?: "compact" | "comfortable";
  headingLevel?: 2 | 3;
  className?: string;
};

/**
 * Presentation-only Abschlussplatzierung list.
 * Renders prepared order; does not calculate or reorder placements.
 */
export function TournamentPlacementsList({
  placements,
  headingId = "ko-placements-heading",
  title = "Abschlussplatzierung",
  density = "compact",
  headingLevel = 3,
  className,
}: TournamentPlacementsListProps) {
  if (placements.length === 0) {
    return null;
  }

  const HeadingTag = headingLevel === 2 ? "h2" : "h3";

  return (
    <section
      className={cn(
        "min-w-0 rounded-[10px] border border-line bg-white shadow-[0_1px_2px_rgba(16,20,28,0.04)]",
        density === "comfortable" ? "p-5" : "px-3.5 py-3.5",
        className,
      )}
      aria-labelledby={headingId}
    >
      <HeadingTag
        id={headingId}
        className={cn(
          "font-display font-bold tracking-wide text-ink uppercase",
          density === "comfortable" ? "text-xl" : "text-[15px] sm:text-base",
        )}
      >
        {title}
      </HeadingTag>
      <ol className={cn("grid", density === "comfortable" ? "mt-4 gap-2" : "mt-3 gap-1.5")}>
        {placements.map((row) => {
          const top = row.place <= 3;
          return (
            <li
              key={row.id}
              className={cn(
                "flex min-w-0 items-center gap-2.5 rounded-md px-1.5 py-1.5",
                top && "bg-surface/70",
                row.place === 1 && "border-l-[3px] border-brand-yellow pl-2",
              )}
            >
              <span
                className={cn(
                  "shrink-0 tabular-nums font-semibold text-ink",
                  row.place === 1
                    ? "font-display text-base font-bold sm:text-lg"
                    : top
                      ? "text-[14px] font-bold"
                      : "text-[14px]",
                )}
              >
                {row.place}.
              </span>
              <TeamNameWithLogo
                label={row.label}
                logoUrl={row.logoUrl}
                clubName={row.clubName}
                size="xs"
                nameClassName={
                  density === "comfortable" ? "text-[15px]" : "text-[14px]"
                }
              />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

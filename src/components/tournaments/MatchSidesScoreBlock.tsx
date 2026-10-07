import { TeamNameWithLogo } from "@/components/tournaments/TeamNameWithLogo";
import { cn } from "@/lib/cn";

export type MatchSideDisplay = {
  label: string;
  logoUrl?: string | null;
  clubName?: string | null;
};

type MatchSidesScoreBlockProps = {
  home: MatchSideDisplay;
  away: MatchSideDisplay;
  /** When true, show per-side scores; otherwise show centered VS between rows. */
  completed: boolean;
  homeScore?: number | null;
  awayScore?: number | null;
  /** Optional restrained secondary line (e.g. penalties). */
  scoreNote?: string | null;
  logoSize?: "xs" | "sm";
  className?: string;
};

/**
 * Presentation-only home/away rows with aligned score or centered VS.
 * Does not determine winners, standings, or match state beyond props.
 */
export function MatchSidesScoreBlock({
  home,
  away,
  completed,
  homeScore = null,
  awayScore = null,
  scoreNote = null,
  logoSize = "xs",
  className,
}: MatchSidesScoreBlockProps) {
  if (completed && homeScore != null && awayScore != null) {
    return (
      <div className={cn("min-w-0", className)}>
        <div className="grid gap-1.5">
          <SideScoreRow
            side={home}
            value={String(homeScore)}
            logoSize={logoSize}
            valueClassName="font-display text-xl font-bold leading-none tabular-nums text-ink sm:text-2xl"
          />
          <SideScoreRow
            side={away}
            value={String(awayScore)}
            logoSize={logoSize}
            valueClassName="font-display text-xl font-bold leading-none tabular-nums text-ink sm:text-2xl"
          />
        </div>
        {scoreNote ? (
          <p className="mt-1.5 text-right text-[11px] font-medium tracking-wide text-muted">
            {scoreNote}
          </p>
        ) : null}
      </div>
    );
  }

  // Upcoming: teams left, VS visually centered between the two rows (not owned by one team).
  return (
    <div className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3", className)}>
      <div className="min-w-0 grid gap-1.5">
        <TeamNameWithLogo
          label={home.label}
          logoUrl={home.logoUrl}
          clubName={home.clubName}
          size={logoSize}
          nameClassName="text-[14px]"
        />
        <TeamNameWithLogo
          label={away.label}
          logoUrl={away.logoUrl}
          clubName={away.clubName}
          size={logoSize}
          nameClassName="text-[14px]"
        />
      </div>
      <span
        className="shrink-0 self-center text-center text-[11px] font-semibold tracking-[0.12em] text-muted uppercase"
        aria-hidden
      >
        VS
      </span>
      <span className="sr-only">gegen</span>
    </div>
  );
}

function SideScoreRow({
  side,
  value,
  logoSize,
  valueClassName,
}: {
  side: MatchSideDisplay;
  value: string;
  logoSize: "xs" | "sm";
  valueClassName: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <TeamNameWithLogo
        label={side.label}
        logoUrl={side.logoUrl}
        clubName={side.clubName}
        size={logoSize}
        className="min-w-0 flex-1"
        nameClassName="text-[14px]"
      />
      <span className={cn("shrink-0 text-right", valueClassName)}>{value}</span>
    </div>
  );
}

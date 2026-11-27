import { MatchSidesScoreBlock } from "@/components/tournaments/MatchSidesScoreBlock";
import { TournamentPlacementsList } from "@/components/tournaments/TournamentPlacementsList";
import { cn } from "@/lib/cn";

export type KnockoutMatchSideView = {
  label: string;
  logoUrl: string | null;
  clubName: string | null;
};

export type KnockoutMatchView = {
  id: string;
  meta: string;
  home: KnockoutMatchSideView;
  away: KnockoutMatchSideView;
  resultText: string;
  winnerLabel: string | null;
  /** Presentation wiring from prepared match fields only. */
  homeScore?: number | null;
  awayScore?: number | null;
  status?: string | null;
  decidedBy?: string | null;
  homePenalties?: number | null;
  awayPenalties?: number | null;
};

export type KnockoutRoundView = {
  id: string;
  title: string;
  matches: KnockoutMatchView[];
};

export type KnockoutPlacementView = {
  id: string;
  place: number;
  label: string;
  logoUrl?: string | null;
  clubName?: string | null;
};

type TournamentKnockoutRoundsProps = {
  rounds: KnockoutRoundView[];
  placements: KnockoutPlacementView[];
  heading?: string;
  description?: string | null;
  notice?: string | null;
  emptyState?: string | null;
  showStatus?: boolean;
  logoFallback?: "initial" | "none";
  layout?: "stack" | "bracket";
  className?: string;
};

const statusLabels: Record<string, string> = {
  scheduled: "Geplant",
  live: "Live",
  completed: "Beendet",
  cancelled: "Abgesagt",
};

/**
 * V2-C4 presentational public KO-Runde.
 * Receives already prepared round, match, and placement display data.
 * No queries, filtering, sorting, scoring, or progression.
 */
export function TournamentKnockoutRounds({
  rounds,
  placements,
  heading = "KO-Runde",
  description = null,
  notice = null,
  emptyState = null,
  showStatus = false,
  logoFallback = "none",
  layout = "stack",
  className,
}: TournamentKnockoutRoundsProps) {
  const matchCount = rounds.reduce((sum, round) => sum + round.matches.length, 0);

  return (
    <section className={cn("mt-8 min-w-0 max-w-full", className)} aria-labelledby="ko-runde-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="ko-runde-heading"
          className="font-display text-2xl font-bold tracking-wide text-ink uppercase"
        >
          {heading}
        </h2>
        {rounds.length > 0 ? (
          <p className="text-[13px] font-medium tracking-wide text-muted">
            {rounds.length} {rounds.length === 1 ? "Runde" : "Runden"}
            {" · "}
            {matchCount} {matchCount === 1 ? "Spiel" : "Spiele"}
          </p>
        ) : null}
      </div>

      {description ? <p className="mt-2 max-w-3xl text-[14px] leading-6 text-muted">{description}</p> : null}
      {notice ? (
        <p className="mt-4 rounded-[8px] border border-brand-blue/20 bg-[#f2f7ff] px-3.5 py-3 text-[13px] leading-5 text-ink">
          {notice}
        </p>
      ) : null}

      {rounds.length > 0 ? (
        <>
          {layout === "bracket" && rounds.length > 2 ? (
            <p className="mt-3 text-[12px] font-medium text-muted lg:hidden">
              K.-o.-Baum seitlich wischen, um alle Runden zu sehen.
            </p>
          ) : null}
          <div className={cn(
            "mt-4 grid gap-3",
            layout === "bracket" && "flex snap-x snap-mandatory items-start gap-3 overflow-x-auto overscroll-x-contain pb-3",
          )} data-knockout-layout={layout}>
          {rounds.map((round) => {
            const headingId = `ko-round-${round.id}`;
            const isFinal = round.id === "final";
            return (
              <section
                key={round.id}
                aria-labelledby={headingId}
                className={cn(
                  "min-w-0 rounded-[10px] border bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(16,20,28,0.04)]",
                  layout === "bracket" && "min-w-[17rem] flex-none snap-start sm:min-w-[19rem] lg:min-w-[15rem] lg:flex-1",
                  isFinal ? "border-navy/35 ring-1 ring-inset ring-brand-yellow/50" : "border-line",
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line/80 pb-2">
                  <h3
                    id={headingId}
                    className={cn(
                      "font-display font-bold tracking-wide text-ink uppercase",
                      isFinal ? "text-base sm:text-lg" : "text-[15px] sm:text-base",
                    )}
                  >
                    <span
                      className="mr-2 inline-block h-3 w-1 translate-y-px bg-brand-yellow align-middle"
                      aria-hidden="true"
                    />
                    {round.title}
                  </h3>
                  <p className="text-[12px] font-medium tracking-wide text-muted">
                    {round.matches.length}{" "}
                    {round.matches.length === 1 ? "Spiel" : "Spiele"}
                  </p>
                </div>

                <ul
                  className={cn(
                    "mt-2.5 grid grid-cols-1 gap-2",
                    // Bracket columns keep one match per row so cards stay wide
                    // enough for full team names (no mid-word wrapping). The
                    // stacked layout may use two columns on wider screens.
                    layout !== "bracket" && round.matches.length > 1 && "md:grid-cols-2",
                  )}
                >
                  {round.matches.map((match) => {
                    const completed =
                      match.status === "completed" &&
                      match.homeScore != null &&
                      match.awayScore != null;
                    const scoreNote =
                      completed &&
                      match.decidedBy === "penalties" &&
                      match.homePenalties != null &&
                      match.awayPenalties != null
                        ? `n.E. ${match.homePenalties}:${match.awayPenalties}`
                        : null;

                    return (
                      <li
                        key={match.id}
                        className="min-w-0 rounded-[8px] border border-line bg-surface px-3 py-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                            {match.meta}
                          </p>
                          {showStatus && match.status ? (
                            <span className={match.status === "live" ? "rounded-full bg-brand-yellow px-2 py-1 text-[9px] font-bold tracking-[0.08em] text-navy uppercase" : "text-[9px] font-semibold tracking-[0.08em] text-muted uppercase"}>
                              {statusLabels[match.status] ?? match.status}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2">
                          <MatchSidesScoreBlock
                            home={match.home}
                            away={match.away}
                            completed={(completed || match.status === "live") && match.homeScore != null && match.awayScore != null}
                            homeScore={match.homeScore}
                            awayScore={match.awayScore}
                            scoreNote={scoreNote}
                            logoSize="xs"
                            logoFallback={logoFallback}
                          />
                        </div>
                        {match.winnerLabel ? (
                          <p className="mt-2 text-[12px] font-medium tracking-wide text-muted">
                            {match.winnerLabel}
                          </p>
                        ) : !completed && match.resultText === "Ergebnis folgt" ? (
                          <p className="sr-only">{match.resultText}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          </div>
        </>
      ) : emptyState ? (
        <p className="mt-4 rounded-[10px] border border-dashed border-line bg-white px-4 py-8 text-center text-[15px] leading-6 text-muted">
          {emptyState}
        </p>
      ) : null}

      {placements.length > 0 ? (
        <TournamentPlacementsList
          className="mt-3"
          placements={placements}
          density="compact"
        />
      ) : null}
    </section>
  );
}

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
};

/**
 * V2-C4 presentational public KO-Runde.
 * Receives already prepared round, match, and placement display data.
 * No queries, filtering, sorting, scoring, or progression.
 */
export function TournamentKnockoutRounds({
  rounds,
  placements,
}: TournamentKnockoutRoundsProps) {
  const matchCount = rounds.reduce((sum, round) => sum + round.matches.length, 0);

  return (
    <section className="mt-8 min-w-0 max-w-full" aria-labelledby="ko-runde-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="ko-runde-heading"
          className="font-display text-2xl font-bold tracking-wide text-ink uppercase"
        >
          KO-Runde
        </h2>
        {rounds.length > 0 ? (
          <p className="text-[13px] font-medium tracking-wide text-muted">
            {rounds.length} {rounds.length === 1 ? "Runde" : "Runden"}
            {" · "}
            {matchCount} {matchCount === 1 ? "Spiel" : "Spiele"}
          </p>
        ) : null}
      </div>

      {rounds.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {rounds.map((round) => {
            const headingId = `ko-round-${round.id}`;
            const isFinal = round.id === "final";
            return (
              <section
                key={round.id}
                aria-labelledby={headingId}
                className={cn(
                  "min-w-0 rounded-[10px] border bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(16,20,28,0.04)]",
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

                <ul className="mt-2.5 grid grid-cols-1 gap-2 md:grid-cols-2">
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
                        <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                          {match.meta}
                        </p>
                        <div className="mt-2">
                          <MatchSidesScoreBlock
                            home={match.home}
                            away={match.away}
                            completed={completed}
                            homeScore={match.homeScore}
                            awayScore={match.awayScore}
                            scoreNote={scoreNote}
                            logoSize="xs"
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

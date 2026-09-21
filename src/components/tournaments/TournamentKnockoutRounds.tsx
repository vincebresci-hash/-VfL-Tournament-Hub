import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";

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
        <div className="mt-4 grid gap-3.5">
          {rounds.map((round) => {
            const headingId = `ko-round-${round.id}`;
            return (
              <section
                key={round.id}
                aria-labelledby={headingId}
                className="min-w-0 rounded-[10px] border border-line bg-white px-3.5 py-3.5 shadow-[0_1px_2px_rgba(16,20,28,0.04)]"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line/80 pb-2.5">
                  <h3
                    id={headingId}
                    className="font-display text-[15px] font-bold tracking-wide text-ink uppercase sm:text-base"
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

                <ul className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {round.matches.map((match) => (
                    <li
                      key={match.id}
                      className="min-w-0 rounded-[8px] border border-line bg-[#fafbfc] px-3 py-2.5"
                    >
                      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                        {match.meta}
                      </p>
                      <div className="mt-2.5 grid gap-2">
                        <KnockoutTeamRow side={match.home} />
                        <KnockoutTeamRow side={match.away} />
                      </div>
                      <p
                        className={
                          match.resultText === "Ergebnis folgt"
                            ? "mt-2.5 text-[13px] text-muted"
                            : "mt-2.5 font-display text-lg font-bold tracking-wide text-ink"
                        }
                      >
                        {match.resultText}
                      </p>
                      {match.winnerLabel ? (
                        <p className="mt-1 text-[13px] text-ink">{match.winnerLabel}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}

      {placements.length > 0 ? (
        <section
          className="mt-3.5 min-w-0 rounded-[10px] border border-line bg-white px-3.5 py-3.5 shadow-[0_1px_2px_rgba(16,20,28,0.04)]"
          aria-labelledby="ko-placements-heading"
        >
          <h3
            id="ko-placements-heading"
            className="font-display text-[15px] font-bold tracking-wide text-ink uppercase sm:text-base"
          >
            Abschlussplatzierung
          </h3>
          <ol className="mt-3 grid gap-1.5">
            {placements.map((row) => (
              <li key={row.id} className="text-[14px] leading-snug break-words text-ink">
                {row.place}. {row.label}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </section>
  );
}

function KnockoutTeamRow({ side }: { side: KnockoutMatchSideView }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {side.clubName ? (
        <ParticipantClubLogo logoUrl={side.logoUrl} clubName={side.clubName} size="sm" />
      ) : null}
      <p className="min-w-0 text-[14px] leading-snug font-medium break-words text-ink">
        {side.label}
      </p>
    </div>
  );
}

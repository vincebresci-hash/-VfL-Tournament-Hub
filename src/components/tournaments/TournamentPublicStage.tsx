import type { ReactNode } from "react";
import Link from "next/link";
import { StandingsTable } from "@/components/tournaments/StandingsTable";
import { formatBerlinClock } from "@/lib/schedule/datetime";
import { publicTeamLabel, teamLabel } from "@/lib/schedule/names";
import {
  computeKnockoutPlacements,
  knockoutRoundLabel,
  resolveKnockoutOutcome,
  type PlacementRow,
} from "@/lib/schedule/knockout";
import { computeGroupStandings } from "@/lib/schedule/standings";
import type { PublicTournamentStage } from "@/lib/db/schedule-queries";
import type { KnockoutRound, TournamentMatchRecord } from "@/types/schedule";
import type { TournamentStatus } from "@/types/tournament";

const tabs = [
  { id: "uebersicht", label: "Übersicht" },
  { id: "teilnehmer", label: "Teilnehmer" },
  { id: "gruppen", label: "Gruppen" },
  { id: "spielplan", label: "Spielplan" },
  { id: "tabelle", label: "Tabelle" },
  { id: "ko-runde", label: "KO-Runde" },
] as const;

type PublicTab = (typeof tabs)[number]["id"];

type TournamentPublicStageProps = {
  slug: string;
  stage: PublicTournamentStage;
  tab?: string;
  overview: ReactNode | null;
  tournamentStatus?: TournamentStatus;
};

function asTab(value: string | undefined): PublicTab {
  if (tabs.some((tab) => tab.id === value)) {
    return value as PublicTab;
  }

  return "uebersicht";
}

export function TournamentPublicStage({
  slug,
  stage,
  tab,
  overview,
  tournamentStatus,
}: TournamentPublicStageProps) {
  const knockoutMatches = stage.matches.filter((match) => match.phase === "knockout");
  const groupMatches = stage.matches.filter((match) => match.phase !== "knockout");
  const showTabs = stage.groups.length > 0 || stage.matches.length > 0;
  const visibleTabs = tabs.filter((item) => item.id !== "ko-runde" || knockoutMatches.length > 0);
  const requested = showTabs ? asTab(tab) : "uebersicht";
  const current =
    requested === "ko-runde" && knockoutMatches.length === 0 ? "uebersicht" : requested;
  const teamLabels = Object.fromEntries(
    stage.roster.map((entry) => [
      entry.applicationId,
      publicTeamLabel(entry.clubName, entry.teamName),
    ]),
  );
  const fieldName = (id: string | null) =>
    stage.fields.find((field) => field.id === id)?.name ?? "Feld";
  const groupName = (id: string | null) =>
    stage.groups.find((group) => group.id === id)?.name ?? "Gruppe";
  const placements = computeKnockoutPlacements(knockoutMatches);
  const publicRounds: KnockoutRound[][] = [
    ["quarterfinal"],
    ["semifinal"],
    ["final", "third-place"],
  ];
  const publicPlacements: KnockoutRound[] = ["placement-5", "placement-7"];

  return (
    <div>
      {showTabs ? (
        <nav className="mt-10 flex flex-wrap gap-2" aria-label="Turnierbereiche">
          {visibleTabs.map((item) => (
            <Link
              key={item.id}
              href={item.id === "uebersicht" ? `/turniere/${slug}` : `/turniere/${slug}?tab=${item.id}`}
              className={
                current === item.id
                  ? "inline-flex h-9 items-center bg-navy px-3 text-[11px] font-semibold tracking-[0.08em] text-white uppercase"
                  : "inline-flex h-9 items-center border border-line bg-white px-3 text-[11px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}

      {tournamentStatus === "completed" ? (
        <p className={`${showTabs ? "mt-8" : "mt-10"} text-[13px] font-semibold tracking-[0.08em] text-ink uppercase`}>
          Turnier abgeschlossen
        </p>
      ) : null}

      {current === "uebersicht" && overview ? (
        <div className={showTabs || tournamentStatus === "completed" ? "mt-8" : "mt-10"}>{overview}</div>
      ) : null}

      {current === "uebersicht" && placements.length > 0 ? (
        <section className="mt-8">
          <PublicPlacements placements={placements} teamLabels={teamLabels} />
        </section>
      ) : null}

      {current === "teilnehmer" ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase">
            Teilnehmer
          </h2>
          {stage.roster.length === 0 ? (
            <p className="mt-4 text-[15px] text-muted">Noch keine bestätigten Teams.</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {stage.roster.map((entry) => (
                <li key={entry.applicationId} className="border border-line bg-white px-4 py-3">
                  <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                    {entry.clubName}
                  </p>
                  <p className="mt-1 text-[14px] text-ink">{entry.teamName}</p>
                  <p className="mt-2 text-[13px] text-muted">
                    {entry.ageGroup ?? "Altersklasse"}
                    {entry.birthYear ? ` · Jahrgang ${entry.birthYear}` : ""}
                    {entry.groupName ? ` · ${entry.groupName}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {current === "gruppen" ? (
        <section className="mt-8 grid gap-5">
          {stage.groups.map((group) => {
            const members = stage.roster.filter((entry) => entry.groupId === group.id);
            return (
              <article key={group.id} className="border border-line bg-white p-5">
                <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
                  {group.name}
                </h2>
                {members.length === 0 ? (
                  <p className="mt-3 text-[14px] text-muted">Noch keine Teams zugeordnet.</p>
                ) : (
                  <ul className="mt-3 grid gap-2">
                    {members.map((entry) => (
                      <li key={entry.applicationId} className="text-[15px] text-ink">
                        {publicTeamLabel(entry.clubName, entry.teamName)}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </section>
      ) : null}

      {current === "spielplan" ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase">
            Spielplan
          </h2>
          {stage.matches.length === 0 ? (
            <p className="mt-4 text-[15px] text-muted">Der Spielplan wird noch veröffentlicht.</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {stage.matches.map((match) => (
                <li key={match.id} className="border border-line bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                    {match.phase === "knockout" && match.round
                      ? knockoutRoundLabel[match.round]
                      : groupName(match.groupId)}{" "}
                    · {fieldName(match.fieldId)} · {formatBerlinClock(match.scheduledAt)}
                  </p>
                  <p className="mt-1 text-[15px] text-ink">
                    {teamLabel(teamLabels, match.homeApplicationId)} vs{" "}
                    {teamLabel(teamLabels, match.awayApplicationId)}
                  </p>
                  {match.status === "completed" && match.homeScore != null && match.awayScore != null ? (
                    <p className="mt-1 font-display text-lg font-bold text-ink">
                      {match.homeScore} : {match.awayScore}
                      {match.decidedBy === "penalties"
                        ? ` n.E. ${match.homePenalties ?? 0}:${match.awayPenalties ?? 0}`
                        : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-[13px] text-muted">Ergebnis folgt</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {current === "tabelle" ? (
        <section className="mt-8 grid gap-5">
          {stage.groups.map((group) => {
            const memberIds = stage.roster
              .filter((entry) => entry.groupId === group.id)
              .map((entry) => entry.applicationId);
            const standings = computeGroupStandings(
              memberIds,
              groupMatches.filter((match) => match.groupId === group.id),
            );

            return (
              <article key={group.id} className="border border-line bg-white p-5">
                <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
                  Tabelle {group.name}
                </h2>
                <div className="mt-4">
                  <StandingsTable standings={standings} teamLabels={teamLabels} />
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {current === "ko-runde" ? (
        <section className="mt-8 grid gap-5">
          <div className="grid gap-5 lg:grid-cols-3">
            {publicRounds.map((rounds) => {
              const columnHasMatches = rounds.some((round) =>
                knockoutMatches.some((match) => match.round === round),
              );
              if (!columnHasMatches) {
                return null;
              }

              return (
                <div key={rounds.join("-")} className="grid gap-5">
                  {rounds.map((round) => {
                    const roundMatches = knockoutMatches.filter((match) => match.round === round);
                    if (roundMatches.length === 0) {
                      return null;
                    }

                    return (
                      <PublicRoundCard
                        key={round}
                        round={round}
                        matches={roundMatches}
                        teamLabels={teamLabels}
                        fieldName={fieldName}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
          {publicPlacements.some((round) =>
            knockoutMatches.some((match) => match.round === round),
          ) ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {publicPlacements.map((round) => {
                const roundMatches = knockoutMatches.filter((match) => match.round === round);
                if (roundMatches.length === 0) {
                  return null;
                }

                return (
                  <PublicRoundCard
                    key={round}
                    round={round}
                    matches={roundMatches}
                    teamLabels={teamLabels}
                    fieldName={fieldName}
                  />
                );
              })}
            </div>
          ) : null}
          {placements.length > 0 ? (
            <PublicPlacements placements={placements} teamLabels={teamLabels} />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function PublicRoundCard({
  round,
  matches,
  teamLabels,
  fieldName,
}: {
  round: KnockoutRound;
  matches: TournamentMatchRecord[];
  teamLabels: Record<string, string>;
  fieldName: (id: string | null) => string;
}) {
  return (
    <article className="border border-line bg-white p-5">
      <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
        {knockoutRoundLabel[round]}
      </h2>
      <ul className="mt-4 grid gap-3">
        {matches.map((match) => {
          const outcome = resolveKnockoutOutcome(match);
          return (
            <li key={match.id} className="border border-line px-4 py-3">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                {fieldName(match.fieldId)} · {formatBerlinClock(match.scheduledAt)}
              </p>
              <p className="mt-1 text-[15px] text-ink">
                {teamLabel(teamLabels, match.homeApplicationId)} vs{" "}
                {teamLabel(teamLabels, match.awayApplicationId)}
              </p>
              {match.status === "completed" &&
              match.homeScore != null &&
              match.awayScore != null ? (
                <p className="mt-1 font-display text-lg font-bold text-ink">
                  {match.homeScore}:{match.awayScore}
                  {match.decidedBy === "penalties"
                    ? ` n.E. ${match.homePenalties ?? 0}:${match.awayPenalties ?? 0}`
                    : ""}
                </p>
              ) : (
                <p className="mt-1 text-[13px] text-muted">Ergebnis folgt</p>
              )}
              {outcome.winnerId ? (
                <p className="mt-1 text-[13px] text-muted">
                  Gewinner {teamLabel(teamLabels, outcome.winnerId)}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function PublicPlacements({
  placements,
  teamLabels,
}: {
  placements: PlacementRow[];
  teamLabels: Record<string, string>;
}) {
  return (
    <article className="border border-line bg-white p-5">
      <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
        Abschlussplatzierung
      </h2>
      <ol className="mt-4 grid gap-2">
        {placements.map((row) => (
          <li key={`${row.place}-${row.applicationId}`} className="text-[15px] text-ink">
            {row.place}. {teamLabel(teamLabels, row.applicationId)}
          </li>
        ))}
      </ol>
    </article>
  );
}

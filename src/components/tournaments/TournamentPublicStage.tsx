import type { ReactNode } from "react";
import Link from "next/link";
import { StandingsTable } from "@/components/tournaments/StandingsTable";
import { formatBerlinClock } from "@/lib/schedule/datetime";
import { publicTeamLabel } from "@/lib/schedule/names";
import { computeGroupStandings } from "@/lib/schedule/standings";
import type { PublicTournamentStage } from "@/lib/db/schedule-queries";

const tabs = [
  { id: "uebersicht", label: "Übersicht" },
  { id: "teilnehmer", label: "Teilnehmer" },
  { id: "gruppen", label: "Gruppen" },
  { id: "spielplan", label: "Spielplan" },
  { id: "tabelle", label: "Tabelle" },
] as const;

type PublicTab = (typeof tabs)[number]["id"];

type TournamentPublicStageProps = {
  slug: string;
  stage: PublicTournamentStage;
  tab?: string;
  overview: ReactNode | null;
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
}: TournamentPublicStageProps) {
  const showTabs = stage.groups.length > 0 || stage.matches.length > 0;
  const current = showTabs ? asTab(tab) : "uebersicht";
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

  return (
    <div>
      {showTabs ? (
        <nav className="mt-10 flex flex-wrap gap-2" aria-label="Turnierbereiche">
          {tabs.map((item) => (
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

      {current === "uebersicht" && overview ? (
        <div className={showTabs ? "mt-8" : "mt-10"}>{overview}</div>
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
                    {groupName(match.groupId)} · {fieldName(match.fieldId)} · {formatBerlinClock(match.scheduledAt)}
                  </p>
                  <p className="mt-1 text-[15px] text-ink">
                    {teamLabels[match.homeApplicationId] ?? "Heim"} vs{" "}
                    {teamLabels[match.awayApplicationId] ?? "Gast"}
                  </p>
                  {match.status === "completed" && match.homeScore != null && match.awayScore != null ? (
                    <p className="mt-1 font-display text-lg font-bold text-ink">
                      {match.homeScore} : {match.awayScore}
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
              stage.matches.filter((match) => match.groupId === group.id),
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
    </div>
  );
}

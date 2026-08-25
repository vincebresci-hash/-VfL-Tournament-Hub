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
import { MeinTurnierplanLiveSection } from "@/components/tournaments/MeinTurnierplanLiveSection";
import { MeinTurnierplanWidget } from "@/components/tournaments/MeinTurnierplanWidget";
import { MeinTurnierplanPublicButton } from "@/components/tournaments/MeinTurnierplanPublicButton";
import { MeinTurnierplanSourceHint } from "@/components/tournaments/MeinTurnierplanSourceHint";
import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";
import type { PublicMeinTurnierplanData } from "@/lib/mein-turnierplan-public-data";
import {
  resolveGruppenTab,
  resolveSpielplanTab,
  resolveTabelleTab,
  resolveTeilnehmerTab,
} from "@/lib/mein-turnierplan-public-source";

import type { TournamentStatus } from "@/types/tournament";

const baseTabs = [
  { id: "uebersicht", label: "Übersicht" },
  { id: "teilnehmer", label: "Teilnehmer" },
  { id: "gruppen", label: "Gruppen" },
  { id: "spielplan", label: "Spielplan" },
  { id: "tabelle", label: "Tabelle" },
  { id: "ko-runde", label: "KO-Runde" },
] as const;

const liveTab = { id: "live", label: "Live" } as const;

type BaseTab = (typeof baseTabs)[number]["id"];
type PublicTab = BaseTab | typeof liveTab.id;

type TournamentPublicStageProps = {
  slug: string;
  stage: PublicTournamentStage;
  tab?: string;
  overview: ReactNode | null;
  tournamentStatus?: TournamentStatus;
  meinTurnierplanActive?: boolean;
  showLiveTab?: boolean;
  meinTurnierplanPrimary?: boolean;
  meinTurnierplanHybrid?: boolean;
  publicScheduleNote?: string | null;
  meinTurnierplanPublic?: PublicMeinTurnierplanData;
  preferSyncedHubData?: boolean;
  livePresentation?: {
    tournamentName: string;
    tournamentDate: string;
    tournamentStatus: TournamentStatus;
    presentationUrl?: string | null;
    customLabel?: string | null;
    matchesWidgetUrl?: string | null;
    tableWidgetUrl?: string | null;
    publicLiveNote?: string | null;
    meinTurnierplanEmbedUrl?: string | null;
  } | null;
};

function asTab(value: string | undefined, tabs: Array<{ id: string }>): PublicTab {
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
  meinTurnierplanActive = false,
  showLiveTab = false,
  meinTurnierplanPrimary = false,
  meinTurnierplanHybrid = false,
  publicScheduleNote,
  meinTurnierplanPublic,
  preferSyncedHubData = false,
  livePresentation = null,
}: TournamentPublicStageProps) {
  const mtp =
    meinTurnierplanPublic ??
    ({
      usesPublicSource: false,
      isHybrid: false,
      isMeinTurnierplanOnly: false,
      available: false,
      error: null,
      tournamentName: null,
      participants: [],
      groups: [],
      matchesWidgetUrl: null,
      tableWidgetUrl: null,
    } satisfies PublicMeinTurnierplanData);
  const knockoutMatches = stage.matches.filter((match) => match.phase === "knockout");
  const groupMatches = stage.matches.filter((match) => match.phase !== "knockout");
  const showTabs =
    stage.groups.length > 0 ||
    stage.matches.length > 0 ||
    showLiveTab ||
    (mtp.usesPublicSource &&
      (mtp.available || Boolean(mtp.matchesWidgetUrl) || Boolean(mtp.tableWidgetUrl)));
  const tabs = showLiveTab ? [...baseTabs, liveTab] : [...baseTabs];
  const visibleTabs = tabs.filter((item) => item.id !== "ko-runde" || knockoutMatches.length > 0);
  const requested = showTabs ? asTab(tab, visibleTabs) : "uebersicht";
  const current =
    requested === "ko-runde" && knockoutMatches.length === 0 ? "uebersicht" : requested;
  const teilnehmerTab = resolveTeilnehmerTab({
    mtp,
    hubRosterCount: stage.roster.length,
    preferSyncedHub: preferSyncedHubData,
  });
  const gruppenTab = resolveGruppenTab({
    mtp,
    hubGroupCount: stage.groups.length,
    preferSyncedHub: preferSyncedHubData,
  });
  const spielplanTab = resolveSpielplanTab({
    mtp,
    hubMatchCount: stage.matches.length,
    preferSyncedHub: preferSyncedHubData,
  });
  const tabelleTab = resolveTabelleTab({
    mtp,
    hubGroupCount: stage.groups.length,
    hubMatchCount: stage.matches.length,
    preferSyncedHub: preferSyncedHubData,
  });
  const teamLabels = Object.fromEntries(
    stage.roster.map((entry) => [
      entry.applicationId,
      publicTeamLabel(entry.clubName, entry.teamName),
    ]),
  );
  for (const entry of stage.roster) {
    if (entry.externalTeamId) {
      teamLabels[entry.externalTeamId] = publicTeamLabel(entry.clubName, entry.teamName);
    }
  }
  const matchTeamId = (applicationId: string | null, externalTeamId?: string | null) =>
    applicationId ?? externalTeamId ?? null;
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
      {meinTurnierplanPrimary ? (
        <p className="mt-10 max-w-3xl border border-line bg-white px-4 py-3 text-[14px] leading-6 text-muted">
          Teilnehmer, Gruppen, Spielplan und Tabelle werden primär über MeinTurnierplan
          bereitgestellt.
        </p>
      ) : meinTurnierplanHybrid ? (
        <p className="mt-10 max-w-3xl border border-line bg-white px-4 py-3 text-[14px] leading-6 text-muted">
          MeinTurnierplan stellt Live-Spielplan, Tabellen sowie – wenn verfügbar –
          Teilnehmer und Gruppen bereit. Fehlen MeinTurnierplan-Daten, werden die im
          Hub hinterlegten Informationen als Fallback angezeigt.
        </p>
      ) : meinTurnierplanActive ? (
        <p className="mt-10 max-w-3xl border border-line bg-white px-4 py-3 text-[14px] leading-6 text-muted">
          Für den Live-Spieltag ist MeinTurnierplan als externer Link verfügbar.
          Die Bereiche unten zeigen die im Tournament Hub hinterlegten Gruppen,
          den internen Spielplan und Ergebnisse.
        </p>
      ) : null}

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
          {teilnehmerTab.source === "mein-turnierplan" ? (
            <>
              <ul className="mt-4 grid gap-3">
                {mtp.participants.map((entry) => (
                  <li key={entry.id} className="border border-line bg-white px-4 py-3">
                    <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                      {entry.name}
                    </p>
                    {entry.groupName ? (
                      <p className="mt-2 text-[13px] text-muted">{entry.groupName}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
              {teilnehmerTab.showMeinTurnierplanHint ? <MeinTurnierplanSourceHint /> : null}
            </>
          ) : teilnehmerTab.source === "unavailable" ? (
            <p className="mt-4 text-[15px] text-muted">
              Teilnehmer konnten aktuell nicht von MeinTurnierplan geladen werden.
            </p>
          ) : stage.roster.length === 0 ? (
            <p className="mt-4 text-[15px] text-muted">Noch keine bestätigten Teams.</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {stage.roster.map((entry) => (
                <li key={entry.applicationId} className="border border-line bg-white px-4 py-3">
                  <div className="flex items-start gap-3">
                    <ParticipantClubLogo logoUrl={entry.logoUrl} clubName={entry.clubName} />
                    <div className="min-w-0">
                      <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                        {entry.clubName}
                      </p>
                      <p className="mt-1 text-[14px] text-ink">{entry.teamName}</p>
                      <p className="mt-2 text-[13px] text-muted">
                        {entry.ageGroup ?? "Altersklasse"}
                        {entry.birthYear ? ` · Jahrgang ${entry.birthYear}` : ""}
                        {entry.groupName ? ` · ${entry.groupName}` : ""}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {current === "gruppen" ? (
        <section className="mt-8 grid gap-5">
          {gruppenTab.source === "mein-turnierplan" ? (
            <>
              {mtp.groups.map((group) => (
                <article key={group.id} className="border border-line bg-white p-5">
                  <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
                    {group.name}
                  </h2>
                  {group.teams.length === 0 ? (
                    <p className="mt-3 text-[14px] text-muted">Noch keine Teams zugeordnet.</p>
                  ) : (
                    <ul className="mt-3 grid gap-2">
                      {group.teams.map((team) => (
                        <li key={team.id} className="text-[15px] text-ink">
                          {team.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
              {gruppenTab.showMeinTurnierplanHint ? <MeinTurnierplanSourceHint /> : null}
            </>
          ) : gruppenTab.source === "unavailable" ? (
            <p className="text-[15px] text-muted">
              Gruppen konnten aktuell nicht von MeinTurnierplan geladen werden.
            </p>
          ) : (
            stage.groups.map((group) => {
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
            })
          )}
        </section>
      ) : null}

      {current === "spielplan" ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase">
            Spielplan
          </h2>
          {publicScheduleNote ? (
            <p className="mt-4 max-w-3xl border border-line bg-white px-4 py-3 text-[14px] leading-6 text-muted">
              {publicScheduleNote}
            </p>
          ) : null}
          {spielplanTab.source === "mein-turnierplan" && mtp.matchesWidgetUrl ? (
            <div className={`${publicScheduleNote ? "mt-5" : "mt-4"} w-full`}>
              <MeinTurnierplanWidget
                url={mtp.matchesWidgetUrl}
                title="MeinTurnierplan Spielplan"
                iframeId="widgetMatches"
              />
              {spielplanTab.showMeinTurnierplanHint ? <MeinTurnierplanSourceHint /> : null}
            </div>
          ) : spielplanTab.source === "unavailable" ? (
            <div className="mt-4">
              {livePresentation?.presentationUrl ? (
                <MeinTurnierplanPublicButton
                  tournamentName={livePresentation.tournamentName}
                  tournamentDate={livePresentation.tournamentDate}
                  tournamentStatus={livePresentation.tournamentStatus}
                  url={livePresentation.presentationUrl}
                  customLabel={livePresentation.customLabel}
                />
              ) : (
                <p className="text-[15px] text-muted">
                  Der Spielplan ist aktuell nicht verfügbar. Bitte prüfen Sie später erneut
                  oder nutzen Sie den MeinTurnierplan-Link, falls hinterlegt.
                </p>
              )}
            </div>
          ) : stage.matches.length === 0 ? (
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
                    {teamLabel(
                      teamLabels,
                      matchTeamId(match.homeApplicationId, match.homeExternalTeamId),
                    )}{" "}
                    vs{" "}
                    {teamLabel(
                      teamLabels,
                      matchTeamId(match.awayApplicationId, match.awayExternalTeamId),
                    )}
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
        <section className="mt-8">
          {tabelleTab.source === "mein-turnierplan" && mtp.tableWidgetUrl ? (
            <div className="w-full">
              <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase">
                Tabelle
              </h2>
              <div className="mt-4 w-full">
                <MeinTurnierplanWidget
                  url={mtp.tableWidgetUrl}
                  title="MeinTurnierplan Tabelle"
                  iframeId="widgetTable"
                />
              </div>
              {tabelleTab.showMeinTurnierplanHint ? <MeinTurnierplanSourceHint /> : null}
            </div>
          ) : tabelleTab.source === "unavailable" ? (
            <>
              <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase">
                Tabelle
              </h2>
              <div className="mt-4">
                {livePresentation?.presentationUrl ? (
                  <MeinTurnierplanPublicButton
                    tournamentName={livePresentation.tournamentName}
                    tournamentDate={livePresentation.tournamentDate}
                    tournamentStatus={livePresentation.tournamentStatus}
                    url={livePresentation.presentationUrl}
                    customLabel={livePresentation.customLabel}
                  />
                ) : (
                  <p className="text-[15px] text-muted">
                    Die Tabelle ist aktuell nicht verfügbar.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="grid gap-5">
              {stage.groups.map((group) => {
                const memberIds = stage.roster
                  .filter((entry) => entry.groupId === group.id)
                  .map((entry) => entry.externalTeamId ?? entry.applicationId);
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
            </div>
          )}
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
      {current === "live" && showLiveTab && livePresentation ? (
        <MeinTurnierplanLiveSection
          tournamentName={livePresentation.tournamentName}
          tournamentDate={livePresentation.tournamentDate}
          tournamentStatus={livePresentation.tournamentStatus}
          presentationUrl={livePresentation.presentationUrl}
          customLabel={livePresentation.customLabel}
          matchesWidgetUrl={livePresentation.matchesWidgetUrl}
          tableWidgetUrl={livePresentation.tableWidgetUrl}
          publicLiveNote={livePresentation.publicLiveNote}
          meinTurnierplanEmbedUrl={livePresentation.meinTurnierplanEmbedUrl}
        />
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

import type { ReactNode } from "react";
import Link from "next/link";
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
import type { KnockoutRound } from "@/types/schedule";
import { MeinTurnierplanLiveSection } from "@/components/tournaments/MeinTurnierplanLiveSection";
import { TournamentParticipantCards } from "@/components/tournaments/TournamentParticipantCards";
import { TournamentGroupCards } from "@/components/tournaments/TournamentGroupCards";
import { TournamentScheduleCards } from "@/components/tournaments/TournamentScheduleCards";
import { TournamentStandingsSection } from "@/components/tournaments/TournamentStandingsSection";
import { TournamentKnockoutRounds } from "@/components/tournaments/TournamentKnockoutRounds";
import { TeamNameWithLogo } from "@/components/tournaments/TeamNameWithLogo";

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
  publicScheduleNote?: string | null;
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

/**
 * B1-B1: Normal competition tabs always render Hub stage data.
 * MTP widgets/presentation remain on the dedicated Live tab only.
 * Historical MTP-imported rows inside Hub tables are a known residual (not filtered here).
 */
export function TournamentPublicStage({
  slug,
  stage,
  tab,
  overview,
  tournamentStatus,
  meinTurnierplanActive = false,
  showLiveTab = false,
  publicScheduleNote,
  livePresentation = null,
}: TournamentPublicStageProps) {
  const knockoutMatches = stage.matches.filter((match) => match.phase === "knockout");
  const groupMatches = stage.matches.filter((match) => match.phase !== "knockout");
  const showTabs =
    stage.groups.length > 0 || stage.matches.length > 0 || showLiveTab;
  const tabs = showLiveTab ? [...baseTabs, liveTab] : [...baseTabs];
  const visibleTabs = tabs.filter((item) => item.id !== "ko-runde" || knockoutMatches.length > 0);
  const requested = showTabs ? asTab(tab, visibleTabs) : "uebersicht";
  const current =
    requested === "ko-runde" && knockoutMatches.length === 0 ? "uebersicht" : requested;
  const teamLabels = Object.fromEntries(
    stage.roster.map((entry) => [
      entry.applicationId,
      publicTeamLabel(entry.clubName, entry.teamName),
    ]),
  );
  const teamMarks: Record<string, { logoUrl: string | null; clubName: string }> = {};
  for (const entry of stage.roster) {
    if (entry.externalTeamId) {
      teamLabels[entry.externalTeamId] = publicTeamLabel(entry.clubName, entry.teamName);
    }
    const mark = { logoUrl: entry.logoUrl ?? null, clubName: entry.clubName };
    teamMarks[entry.applicationId] = mark;
    if (entry.externalTeamId) {
      teamMarks[entry.externalTeamId] = mark;
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
  const knockoutTeamSide = (participantId: string | null) => {
    const mark = participantId ? teamMarks[participantId] : undefined;
    return {
      label: teamLabel(teamLabels, participantId),
      logoUrl: mark?.logoUrl ?? null,
      clubName: mark ? mark.clubName : null,
    };
  };
  const knockoutRoundViews = [...publicRounds.flat(), ...publicPlacements].flatMap((round) => {
    const roundMatches = knockoutMatches.filter((match) => match.round === round);
    if (roundMatches.length === 0) {
      return [];
    }

    return [
      {
        id: round,
        title: knockoutRoundLabel[round],
        matches: roundMatches.map((match) => {
          const outcome = resolveKnockoutOutcome(match);
          return {
            id: match.id,
            meta: `${fieldName(match.fieldId)} · ${formatBerlinClock(match.scheduledAt)}`,
            home: knockoutTeamSide(
              matchTeamId(match.homeApplicationId, match.homeExternalTeamId),
            ),
            away: knockoutTeamSide(
              matchTeamId(match.awayApplicationId, match.awayExternalTeamId),
            ),
            resultText: knockoutResultText(match),
            winnerLabel: outcome.winnerId
              ? `Gewinner ${teamLabel(teamLabels, outcome.winnerId)}`
              : null,
          };
        }),
      },
    ];
  });
  const knockoutPlacementViews = placements.map((row) => {
    const mark = teamMarks[row.applicationId];
    return {
      id: `${row.place}-${row.applicationId}`,
      place: row.place,
      label: teamLabel(teamLabels, row.applicationId),
      logoUrl: mark?.logoUrl ?? null,
      clubName: mark?.clubName ?? null,
    };
  });

  return (
    <div>
      {showLiveTab ? (
        <p className="mt-10 max-w-3xl border border-line bg-white px-4 py-3 text-[14px] leading-6 text-muted">
          Teilnehmer, Gruppen, Spielplan, Tabelle und KO stammen aus dem VfL Tournament
          Hub. Aktuelle Live-Informationen können zusätzlich über MeinTurnierPlan
          bereitgestellt werden.
        </p>
      ) : meinTurnierplanActive ? (
        <p className="mt-10 max-w-3xl border border-line bg-white px-4 py-3 text-[14px] leading-6 text-muted">
          Für den Live-Spieltag ist MeinTurnierPlan als externer Link verfügbar.
          Die Bereiche unten zeigen die im Tournament Hub hinterlegten Gruppen,
          den internen Spielplan und Ergebnisse.
        </p>
      ) : null}

      {showTabs ? (
        <div className="mt-8 sm:mt-10">
          <h2 className="font-display text-lg font-bold tracking-[0.06em] text-ink uppercase sm:text-xl">
            <span
              className="mr-2 inline-block h-3.5 w-1 translate-y-0.5 bg-brand-yellow align-middle"
              aria-hidden="true"
            />
            Turnier-Center
          </h2>
          <nav
            className="mt-4 -mx-1 overflow-x-auto overscroll-x-contain px-1"
            aria-label="Turnierbereiche"
          >
            <div className="flex w-max min-w-full flex-nowrap gap-2 pb-0.5">
              {visibleTabs.map((item) => {
                const active = current === item.id;
                return (
                  <Link
                    key={item.id}
                    href={
                      item.id === "uebersicht"
                        ? `/turniere/${slug}`
                        : `/turniere/${slug}?tab=${item.id}`
                    }
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "inline-flex h-9 shrink-0 items-center rounded-md border border-navy bg-navy px-3.5 text-[11px] font-semibold tracking-[0.08em] text-white uppercase ring-1 ring-inset ring-brand-yellow/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                        : "inline-flex h-9 shrink-0 items-center rounded-md border border-line bg-white px-3.5 text-[11px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:border-navy/25 hover:bg-[#fafbfc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
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
          <PublicPlacements
            placements={placements}
            teamLabels={teamLabels}
            teamMarks={teamMarks}
          />
        </section>
      ) : null}

      {current === "teilnehmer" ? (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase">
              Teilnehmer
            </h2>
            {stage.roster.length > 0 ? (
              <p className="text-[13px] font-medium tracking-wide text-muted">
                {stage.roster.length}{" "}
                {stage.roster.length === 1 ? "Team" : "Teams"}
              </p>
            ) : null}
          </div>
          {stage.roster.length === 0 ? (
            <p className="mt-4 text-[15px] text-muted">Noch keine bestätigten Teams.</p>
          ) : (
            <TournamentParticipantCards roster={stage.roster} />
          )}
        </section>
      ) : null}

      {current === "gruppen" ? (
        <section className="mt-8">
          {stage.groups.length === 0 ? (
            <p className="text-[15px] text-muted">Noch keine Gruppen veröffentlicht.</p>
          ) : (
            <TournamentGroupCards
              source="hub"
              groups={stage.groups.map((group) => ({
                id: group.id,
                name: group.name,
                members: stage.roster.filter((entry) => entry.groupId === group.id),
              }))}
            />
          )}
        </section>
      ) : null}

      {current === "spielplan" ? (
        <section className="mt-8">
          {publicScheduleNote ? (
            <p className="mb-4 max-w-3xl border border-line bg-white px-4 py-3 text-[14px] leading-6 text-muted">
              {publicScheduleNote}
            </p>
          ) : null}
          {stage.matches.length === 0 ? (
            <>
              <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase">
                Spielplan
              </h2>
              <p className="mt-4 text-[15px] text-muted">Der Spielplan wird noch veröffentlicht.</p>
            </>
          ) : (
            <TournamentScheduleCards
              matches={stage.matches}
              teamLabels={teamLabels}
              teamMarks={teamMarks}
              matchTeamId={matchTeamId}
              phaseOrGroupLabel={(match) =>
                match.phase === "knockout" && match.round
                  ? knockoutRoundLabel[match.round]
                  : groupName(match.groupId)
              }
              fieldLabel={fieldName}
            />
          )}
        </section>
      ) : null}

      {current === "tabelle" ? (
        <section className="mt-8">
          {stage.groups.length === 0 ? (
            <>
              <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase">
                Tabelle
              </h2>
              <p className="mt-4 text-[15px] text-muted">Die Tabelle ist aktuell nicht verfügbar.</p>
            </>
          ) : (
            <TournamentStandingsSection
              groups={stage.groups.map((group) => {
                const memberIds = stage.roster
                  .filter((entry) => entry.groupId === group.id)
                  .map((entry) => entry.externalTeamId ?? entry.applicationId);
                return {
                  id: group.id,
                  name: group.name,
                  standings: computeGroupStandings(
                    memberIds,
                    groupMatches.filter((match) => match.groupId === group.id),
                  ),
                };
              })}
              teamLabels={teamLabels}
              teamMarks={teamMarks}
            />
          )}
        </section>
      ) : null}

      {current === "ko-runde" ? (
        <TournamentKnockoutRounds
          rounds={knockoutRoundViews}
          placements={knockoutPlacementViews}
        />
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

function knockoutResultText(match: {
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  decidedBy: string | null;
  homePenalties: number | null;
  awayPenalties: number | null;
}) {
  if (
    match.status === "completed" &&
    match.homeScore != null &&
    match.awayScore != null
  ) {
    return `${match.homeScore}:${match.awayScore}${
      match.decidedBy === "penalties"
        ? ` n.E. ${match.homePenalties ?? 0}:${match.awayPenalties ?? 0}`
        : ""
    }`;
  }

  return "Ergebnis folgt";
}

function PublicPlacements({
  placements,
  teamLabels,
  teamMarks,
}: {
  placements: PlacementRow[];
  teamLabels: Record<string, string>;
  teamMarks: Record<string, { logoUrl: string | null; clubName: string }>;
}) {
  return (
    <article className="border border-line bg-white p-5">
      <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
        Abschlussplatzierung
      </h2>
      <ol className="mt-4 grid gap-2">
        {placements.map((row) => {
          const mark = teamMarks[row.applicationId];
          return (
            <li
              key={`${row.place}-${row.applicationId}`}
              className="flex min-w-0 items-center gap-2 text-[15px] text-ink"
            >
              <span className="shrink-0 tabular-nums font-semibold">{row.place}.</span>
              <TeamNameWithLogo
                label={teamLabel(teamLabels, row.applicationId)}
                logoUrl={mark?.logoUrl ?? null}
                clubName={mark?.clubName ?? null}
                size="xs"
                nameClassName="text-[15px]"
              />
            </li>
          );
        })}
      </ol>
    </article>
  );
}

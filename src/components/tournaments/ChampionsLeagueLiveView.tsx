import { LiveAutoRefresh } from "@/components/live/LiveAutoRefresh";
import { LiveMatchCard } from "@/components/live/LiveMatchCard";
import {
  TournamentKnockoutRounds,
  type KnockoutPlacementView,
  type KnockoutRoundView,
} from "@/components/tournaments/TournamentKnockoutRounds";
import type { TeamMark } from "@/components/tournaments/TeamNameWithLogo";
import type { LiveTeamRef } from "@/lib/db/live-queries";
import {
  selectNextMatches,
  selectOtherLiveMatches,
  selectPrimaryMatchMoment,
  selectRecentResults,
} from "@/lib/live/match-center";
import { knockoutRoundLabel } from "@/lib/schedule/knockout";
import { teamLabel } from "@/lib/schedule/names";
import type { TournamentFieldRecord, TournamentMatchRecord } from "@/types/schedule";

type ChampionsLeagueLiveViewProps = {
  matches: TournamentMatchRecord[];
  fields: TournamentFieldRecord[];
  teamLabels: Record<string, string>;
  teamMarks: Record<string, TeamMark>;
  knockoutRounds: KnockoutRoundView[];
  knockoutPlacements: KnockoutPlacementView[];
  revealKnockoutParticipants: boolean;
  knockoutEmptyState: string;
};

function participantId(applicationId: string | null, externalTeamId?: string | null) {
  return applicationId ?? externalTeamId ?? null;
}

export function ChampionsLeagueLiveView({
  matches,
  fields,
  teamLabels,
  teamMarks,
  knockoutRounds,
  knockoutPlacements,
  revealKnockoutParticipants,
  knockoutEmptyState,
}: ChampionsLeagueLiveViewProps) {
  const displayMatches = revealKnockoutParticipants
    ? matches
    : matches.filter((match) => match.phase !== "knockout");
  const primary = selectPrimaryMatchMoment(displayMatches);
  const primaryId = primary.match?.id ?? null;
  const otherLive = selectOtherLiveMatches(displayMatches, primaryId);
  const nextMatches = selectNextMatches(displayMatches, primaryId, 4);
  const recentResults = selectRecentResults(displayMatches, 4);
  const fieldNames = new Map(fields.map((field) => [field.id, field.name]));
  const refreshEnabled = displayMatches.some(
    (match) => match.status === "live" || match.status === "scheduled",
  );

  function resolveTeam(
    applicationId: string | null,
    externalTeamId?: string | null,
  ): LiveTeamRef {
    const id = participantId(applicationId, externalTeamId);
    const mark = id ? teamMarks[id] : undefined;
    return {
      id: id ?? "unknown",
      label: teamLabel(teamLabels, id, "steht noch nicht fest"),
      clubName: mark?.clubName ?? "Team",
      teamName: "",
      logoUrl: mark?.logoUrl ?? null,
    };
  }

  function matchField(match: TournamentMatchRecord) {
    return match.fieldId ? (fieldNames.get(match.fieldId) ?? "Feld") : "Feld folgt";
  }

  function phaseLabel(match: TournamentMatchRecord) {
    return match.phase === "knockout" && match.round
      ? knockoutRoundLabel[match.round]
      : "Ligaphase";
  }

  function matchCard(match: TournamentMatchRecord, featured = false) {
    const variant = match.status === "live" ? "live" : match.status === "completed" ? "completed" : "next";
    return (
      <LiveMatchCard
        key={match.id}
        match={match}
        home={resolveTeam(match.homeApplicationId, match.homeExternalTeamId)}
        away={resolveTeam(match.awayApplicationId, match.awayExternalTeamId)}
        variant={variant}
        fieldLabel={matchField(match)}
        groupOrRoundLabel={phaseLabel(match)}
        featured={featured}
      />
    );
  }

  return (
    <section aria-labelledby="cl-live-heading" className="pb-20 sm:pb-24 lg:pb-0">
      <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-blue uppercase">Turniertag</p>
          <h2 id="cl-live-heading" className="mt-1 font-display text-2xl font-bold tracking-wide text-ink uppercase sm:text-3xl">
            Live
          </h2>
          <p className="mt-1 text-[13px] text-muted">Spielstände und nächste Partien aus dem Tournament Hub.</p>
        </div>
        <LiveAutoRefresh enabled={refreshEnabled} />
      </div>

      <div className="mt-5 grid gap-7">
        {primary.match ? (
          <section aria-labelledby="cl-live-primary-heading">
            <h3 id="cl-live-primary-heading" className="font-display text-lg font-bold tracking-wide text-ink uppercase">
              {primary.kind === "live" ? "Läuft gerade" : "Als Nächstes"}
            </h3>
            <div className="mt-3">{matchCard(primary.match, true)}</div>
          </section>
        ) : (
          <p className="rounded-[10px] border border-line bg-white px-4 py-6 text-[14px] text-muted">
            Aktuell läuft kein Spiel. Ergebnisse erscheinen hier, sobald sie veröffentlicht sind.
          </p>
        )}

        {otherLive.length > 0 ? (
          <MatchList title="Weitere Live-Spiele" matches={otherLive} renderMatch={matchCard} />
        ) : null}
        {nextMatches.length > 0 ? (
          <MatchList title="Danach" matches={nextMatches} renderMatch={matchCard} />
        ) : null}
        {recentResults.length > 0 ? (
          <MatchList title="Letzte Ergebnisse" matches={recentResults} renderMatch={matchCard} />
        ) : null}
      </div>

      <TournamentKnockoutRounds
        className="mt-10"
        heading="K.-o.-Baum"
        description="Der Weg vom ersten K.-o.-Spiel bis zum Finale."
        rounds={knockoutRounds}
        placements={knockoutPlacements}
        emptyState={knockoutEmptyState}
        showStatus
        logoFallback="initial"
        layout="bracket"
      />
    </section>
  );
}

function MatchList({
  title,
  matches,
  renderMatch,
}: {
  title: string;
  matches: TournamentMatchRecord[];
  renderMatch: (match: TournamentMatchRecord) => React.ReactNode;
}) {
  return (
    <section>
      <h3 className="font-display text-lg font-bold tracking-wide text-ink uppercase">{title}</h3>
      <div className="mt-3 grid gap-2.5">{matches.map((match) => renderMatch(match))}</div>
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import { MatchSidesScoreBlock } from "@/components/tournaments/MatchSidesScoreBlock";
import type { TeamMark } from "@/components/tournaments/TeamNameWithLogo";
import { formatBerlinClock } from "@/lib/schedule/datetime";
import { teamLabel } from "@/lib/schedule/names";
import type { TournamentFieldRecord, TournamentMatchRecord } from "@/types/schedule";

type MatchStatusFilter = "all" | TournamentMatchRecord["status"];

type ChampionsLeagueScheduleProps = {
  matches: TournamentMatchRecord[];
  fields: TournamentFieldRecord[];
  teamLabels: Record<string, string>;
  teamMarks: Record<string, TeamMark>;
};

const berlinDate = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const statusLabels: Record<TournamentMatchRecord["status"], string> = {
  scheduled: "Geplant",
  live: "Live",
  completed: "Beendet",
  cancelled: "Abgesagt",
};

function participantId(applicationId: string | null, externalTeamId?: string | null) {
  return applicationId ?? externalTeamId ?? null;
}

export function ChampionsLeagueSchedule({
  matches,
  fields,
  teamLabels,
  teamMarks,
}: ChampionsLeagueScheduleProps) {
  const [team, setTeam] = useState("all");
  const [field, setField] = useState("all");
  const [status, setStatus] = useState<MatchStatusFilter>("all");

  const fieldLabels = useMemo(
    () => new Map(fields.map((entry) => [entry.id, entry.name])),
    [fields],
  );
  const teamOptions = useMemo(
    () => {
      const scheduledParticipantIds = new Set<string>();
      for (const match of matches) {
        const homeId = participantId(match.homeApplicationId, match.homeExternalTeamId);
        const awayId = participantId(match.awayApplicationId, match.awayExternalTeamId);
        if (homeId) scheduledParticipantIds.add(homeId);
        if (awayId) scheduledParticipantIds.add(awayId);
      }
      return Object.entries(teamLabels)
        .filter(([id]) => scheduledParticipantIds.has(id))
        .sort((left, right) => left[1].localeCompare(right[1], "de"));
    },
    [matches, teamLabels],
  );
  const visibleMatches = useMemo(
    () =>
      matches.filter((match) => {
        const homeId = participantId(match.homeApplicationId, match.homeExternalTeamId);
        const awayId = participantId(match.awayApplicationId, match.awayExternalTeamId);
        return (
          (team === "all" || homeId === team || awayId === team) &&
          (field === "all" || match.fieldId === field) &&
          (status === "all" || match.status === status)
        );
      }),
    [field, matches, status, team],
  );

  function side(applicationId: string | null, externalTeamId?: string | null) {
    const id = participantId(applicationId, externalTeamId);
    const mark = id ? teamMarks[id] : undefined;
    return {
      label: teamLabel(teamLabels, id),
      logoUrl: mark?.logoUrl ?? null,
      clubName: mark?.clubName ?? null,
    };
  }

  return (
    <section aria-labelledby="league-schedule-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-blue uppercase">Ligaphase</p>
          <h2 id="league-schedule-heading" className="mt-1 font-display text-2xl font-bold tracking-wide text-ink uppercase sm:text-3xl">
            Spielplan
          </h2>
        </div>
        <p className="text-[13px] font-medium text-muted" aria-live="polite">
          {visibleMatches.length} von {matches.length} {matches.length === 1 ? "Spiel" : "Spielen"}
        </p>
      </div>

      <div className="mt-4 grid gap-3 rounded-[10px] border border-line bg-white p-3 shadow-[0_1px_2px_rgba(16,20,28,0.04)] sm:grid-cols-3 sm:p-4">
        <FilterSelect label="Mannschaft" value={team} onChange={setTeam}>
          <option value="all">Alle Mannschaften</option>
          {teamOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </FilterSelect>
        <FilterSelect label="Spielfeld" value={field} onChange={setField}>
          <option value="all">Alle Spielfelder</option>
          {fields.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </FilterSelect>
        <FilterSelect label="Spielstatus" value={status} onChange={(value) => setStatus(value as MatchStatusFilter)}>
          <option value="all">Alle Status</option>
          <option value="scheduled">Geplant</option>
          <option value="live">Live</option>
          <option value="completed">Beendet</option>
          <option value="cancelled">Abgesagt</option>
        </FilterSelect>
      </div>

      {matches.length === 0 ? (
        <p className="mt-4 rounded-[10px] border border-line bg-white px-4 py-8 text-[15px] text-muted">
          Der Ligaphasen-Spielplan wird noch veröffentlicht.
        </p>
      ) : visibleMatches.length === 0 ? (
        <p className="mt-4 rounded-[10px] border border-dashed border-line bg-white px-4 py-8 text-center text-[15px] text-muted">
          Für diese Filter gibt es keine Spiele.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visibleMatches.map((match) => {
            const completed = match.status === "completed" && match.homeScore != null && match.awayScore != null;
            const live = match.status === "live";
            const showScore =
              (completed || live) && match.homeScore != null && match.awayScore != null;
            const date = match.scheduledAt
              ? berlinDate.format(new Date(match.scheduledAt))
              : "Termin folgt";
            const scoreNote =
              completed && match.decidedBy === "penalties" && match.homePenalties != null && match.awayPenalties != null
                ? `n.E. ${match.homePenalties}:${match.awayPenalties}`
                : null;

            return (
              <li key={match.id} className="min-w-0 overflow-hidden rounded-[10px] border border-line bg-white shadow-[0_4px_14px_rgba(16,20,28,0.05)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/65 px-3.5 py-2.5">
                  <p className="text-[11px] font-semibold tracking-[0.07em] text-muted uppercase">
                    <span className="text-ink">{date}</span>
                    <span className="mx-1.5 text-line" aria-hidden="true">·</span>
                    {fieldLabels.get(match.fieldId ?? "") ?? "Feld folgt"}
                  </p>
                  <span className={live ? "rounded-full bg-brand-yellow px-2 py-1 text-[10px] font-bold tracking-[0.08em] text-navy uppercase" : "text-[10px] font-semibold tracking-[0.08em] text-muted uppercase"}>
                    {statusLabels[match.status]}
                  </span>
                </div>
                <div className="px-3.5 py-3.5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="font-display text-lg font-bold tabular-nums text-ink">{formatBerlinClock(match.scheduledAt)}</span>
                    <span className="text-[10px] font-semibold tracking-[0.12em] text-brand-blue uppercase">Ligaphase</span>
                  </div>
                  <MatchSidesScoreBlock
                    home={side(match.homeApplicationId, match.homeExternalTeamId)}
                    away={side(match.awayApplicationId, match.awayExternalTeamId)}
                    completed={showScore}
                    homeScore={match.homeScore}
                    awayScore={match.awayScore}
                    scoreNote={scoreNote}
                    logoSize="sm"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-line bg-white px-3 text-[13px] font-medium normal-case tracking-normal text-ink outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
      >
        {children}
      </select>
    </label>
  );
}

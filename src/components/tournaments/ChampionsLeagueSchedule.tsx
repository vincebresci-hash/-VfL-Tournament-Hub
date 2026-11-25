"use client";

import { useMemo, useState, type ReactNode } from "react";
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
  weekday: "short",
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

function matchSort(left: TournamentMatchRecord, right: TournamentMatchRecord) {
  const leftTime = left.scheduledAt ?? "9999";
  const rightTime = right.scheduledAt ?? "9999";
  return leftTime.localeCompare(rightTime) || left.sortOrder - right.sortOrder;
}

function timeBlockId(match: TournamentMatchRecord) {
  return match.scheduledAt ?? "unscheduled";
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
  const [timeBlock, setTimeBlock] = useState("all");

  const sortedMatches = useMemo(() => [...matches].sort(matchSort), [matches]);
  const fieldLabels = useMemo(
    () => new Map(fields.map((entry) => [entry.id, entry.name])),
    [fields],
  );
  const teamOptions = useMemo(() => {
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
  }, [matches, teamLabels]);
  const timeBlocks = useMemo(() => {
    const seen = new Set<string>();
    return sortedMatches.flatMap((match) => {
      const id = timeBlockId(match);
      if (seen.has(id)) return [];
      seen.add(id);
      return [{ id, scheduledAt: match.scheduledAt }];
    });
  }, [sortedMatches]);
  const visibleMatches = useMemo(
    () =>
      sortedMatches.filter((match) => {
        const homeId = participantId(match.homeApplicationId, match.homeExternalTeamId);
        const awayId = participantId(match.awayApplicationId, match.awayExternalTeamId);
        return (
          (team === "all" || homeId === team || awayId === team) &&
          (field === "all" || match.fieldId === field) &&
          (status === "all" || match.status === status) &&
          (timeBlock === "all" || timeBlockId(match) === timeBlock)
        );
      }),
    [field, sortedMatches, status, team, timeBlock],
  );
  const visibleBlocks = useMemo(() => {
    const groups = new Map<string, TournamentMatchRecord[]>();
    for (const match of visibleMatches) {
      const id = timeBlockId(match);
      groups.set(id, [...(groups.get(id) ?? []), match]);
    }
    return [...groups.entries()];
  }, [visibleMatches]);

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
    <section aria-labelledby="league-schedule-heading" className="pb-20 sm:pb-24 lg:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-blue uppercase">Ligaphase</p>
          <h2 id="league-schedule-heading" className="mt-1 font-display text-2xl font-bold tracking-wide text-ink uppercase sm:text-3xl">
            Spielplan
          </h2>
          <p className="mt-1 text-[13px] text-muted">Chronologisch nach Anstoßzeit.</p>
        </div>
        <p className="text-[13px] font-medium text-muted" aria-live="polite">
          {visibleMatches.length} von {matches.length} {matches.length === 1 ? "Spiel" : "Spielen"}
        </p>
      </div>

      <div className="mt-4 grid gap-3 rounded-[10px] border border-line bg-white p-3 shadow-[0_1px_2px_rgba(16,20,28,0.04)] sm:grid-cols-2 sm:p-4 xl:grid-cols-4">
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
        <FilterSelect label="Zeitblock" value={timeBlock} onChange={setTimeBlock}>
          <option value="all">Alle Zeitblöcke</option>
          {timeBlocks.map((block, index) => (
            <option key={block.id} value={block.id}>
              {block.scheduledAt ? `${index + 1}. ${formatBerlinClock(block.scheduledAt)}` : "Termin offen"}
            </option>
          ))}
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
        <div className="mt-5 grid gap-6">
          {visibleBlocks.map(([blockId, blockMatches], blockIndex) => {
            const scheduledAt = blockId === "unscheduled" ? null : blockId;
            return (
              <section key={blockId} aria-labelledby={`league-time-block-${blockIndex}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-navy/15 pb-2">
                  <h3 id={`league-time-block-${blockIndex}`} className="font-display text-base font-bold tracking-wide text-ink uppercase sm:text-lg">
                    <span className="mr-2 inline-block h-3 w-1 bg-brand-yellow" aria-hidden="true" />
                    {scheduledAt ? `Zeitblock ${blockIndex + 1} · ${formatBerlinClock(scheduledAt)}` : "Termin offen"}
                  </h3>
                  <p className="text-[11px] font-medium tracking-wide text-muted uppercase">
                    {scheduledAt ? berlinDate.format(new Date(scheduledAt)) : "Zeit folgt"}
                  </p>
                </div>
                <ul className="mt-3 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                  {blockMatches.map((match) => {
                    const completed = match.status === "completed" && match.homeScore != null && match.awayScore != null;
                    const live = match.status === "live";
                    const showScore = (completed || live) && match.homeScore != null && match.awayScore != null;
                    const scoreNote = completed && match.decidedBy === "penalties" && match.homePenalties != null && match.awayPenalties != null
                      ? `n.E. ${match.homePenalties}:${match.awayPenalties}`
                      : null;
                    return (
                      <li key={match.id} className="min-w-0 overflow-hidden rounded-[9px] border border-line bg-white shadow-[0_3px_10px_rgba(16,20,28,0.045)]">
                        <div className="flex items-center justify-between gap-2 border-b border-line bg-surface/65 px-3 py-2">
                          <p className="truncate text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
                            {fieldLabels.get(match.fieldId ?? "") ?? "Feld folgt"}
                          </p>
                          <span className={live ? "rounded-full bg-brand-yellow px-2 py-1 text-[10px] font-bold tracking-[0.08em] text-navy uppercase" : "text-[10px] font-semibold tracking-[0.08em] text-muted uppercase"}>
                            {statusLabels[match.status]}
                          </span>
                        </div>
                        <div className="px-3 py-2.5">
                          <MatchSidesScoreBlock
                            home={side(match.homeApplicationId, match.homeExternalTeamId)}
                            away={side(match.awayApplicationId, match.awayExternalTeamId)}
                            completed={showScore}
                            homeScore={match.homeScore}
                            awayScore={match.awayScore}
                            scoreNote={scoreNote}
                            logoSize="xs"
                            logoFallback="initial"
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
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
  children: ReactNode;
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

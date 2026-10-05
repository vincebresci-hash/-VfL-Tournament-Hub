"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  AdminCard,
  adminCardShellClass,
  adminMobileCardClass,
  adminPrimaryButtonClass,
} from "@/components/admin/AdminPanel";
import { TextInput } from "@/components/apply/FormControls";
import { saveMatchResultAction } from "@/lib/db/schedule-actions";
import { formatBerlinClock } from "@/lib/schedule/datetime";
import {
  GROUP_RESULT_LOCKED_MESSAGE,
  canMutateGroupResults,
} from "@/lib/schedule/group-result-lock";
import { GROUP_RESULT_LOCK_CORRECTION_MESSAGE } from "@/lib/schedule/group-result-lock-ux";
import { computeGroupStandings } from "@/lib/schedule/standings";
import { StandingsTable } from "@/components/tournaments/StandingsTable";
import { teamLabel } from "@/lib/schedule/names";
import type { TournamentFieldRecord, TournamentGroupRecord, TournamentMatchRecord } from "@/types/schedule";

type TournamentResultsBoardProps = {
  tournamentId: string;
  groups: TournamentGroupRecord[];
  fields: TournamentFieldRecord[];
  matches: TournamentMatchRecord[];
  memberIdsByGroupId: Record<string, string[]>;
  teamLabels: Record<string, string>;
};

export function TournamentResultsBoard({
  tournamentId,
  groups,
  fields,
  matches,
  memberIdsByGroupId,
  teamLabels,
}: TournamentResultsBoardProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const groupMatches = matches.filter((match) => match.phase !== "knockout");
  // Informational UI lock from loaded stage matches (includes KO). D1 server guard remains authoritative.
  const groupResultsLocked = !canMutateGroupResults(matches).allowed;

  return (
    <div className="grid gap-5">
      {error ? (
        <p className={`${adminCardShellClass} px-4 py-3.5 text-[14px] text-[#9a2b2b]`} role="alert">
          {error}
        </p>
      ) : null}

      {groupResultsLocked ? (
        <div
          className={`${adminCardShellClass} border-brand-yellow/50 bg-brand-yellow/10 px-4 py-3.5`}
          role="status"
          aria-live="polite"
        >
          <p className="text-[14px] font-semibold text-ink">{GROUP_RESULT_LOCKED_MESSAGE}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {GROUP_RESULT_LOCK_CORRECTION_MESSAGE}
          </p>
        </div>
      ) : null}

      <AdminCard title="Ergebnisse">
        {groupMatches.length === 0 ? (
          <p className="text-[14px] text-muted">Noch keine Spiele vorhanden.</p>
        ) : (
          <div className="grid gap-3">
            {groupMatches.map((match) => (
              <ResultRow
                key={match.id}
                match={match}
                fieldName={fields.find((field) => field.id === match.fieldId)?.name ?? "Feld"}
                groupName={groups.find((group) => group.id === match.groupId)?.name ?? "Gruppe"}
                teamLabels={teamLabels}
                pending={pending}
                locked={groupResultsLocked}
                onSave={async (home, away) => {
                  setPending(true);
                  setError(null);
                  const result = await saveMatchResultAction(tournamentId, match.id, home, away);
                  setPending(false);
                  if (result.error) {
                    // Surfaces D1 lock message (and other errors) for stale-UI races.
                    setError(result.error);
                    return;
                  }
                  router.refresh();
                }}
              />
            ))}
          </div>
        )}
      </AdminCard>

      {groups.map((group) => {
        const standings = computeGroupStandings(
          memberIdsByGroupId[group.id] ?? [],
          groupMatches.filter((match) => match.groupId === group.id),
        );

        return (
          <AdminCard key={group.id} title={`Tabelle ${group.name}`}>
            {standings.length === 0 ? (
              <p className="text-[14px] text-muted">Noch keine Teams in dieser Gruppe.</p>
            ) : (
              <StandingsTable standings={standings} teamLabels={teamLabels} />
            )}
          </AdminCard>
        );
      })}
    </div>
  );
}

function ResultRow({
  match,
  fieldName,
  groupName,
  teamLabels,
  pending,
  locked,
  onSave,
}: {
  match: TournamentMatchRecord;
  fieldName: string;
  groupName: string;
  teamLabels: Record<string, string>;
  pending: boolean;
  locked: boolean;
  onSave: (home: string, away: string) => Promise<void>;
}) {
  const [home, setHome] = useState(match.homeScore == null ? "" : String(match.homeScore));
  const [away, setAway] = useState(match.awayScore == null ? "" : String(match.awayScore));
  const controlsDisabled = pending || locked;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) {
      return;
    }
    await onSave(home, away);
  }

  return (
    <form onSubmit={handleSubmit} className={`grid gap-3 ${adminMobileCardClass} lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center`}>
      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
          {groupName} · {fieldName} · {formatBerlinClock(match.scheduledAt)}
        </p>
        <p className="mt-1 text-[15px] text-ink">
          {teamLabel(teamLabels, match.homeApplicationId, "Heim")} vs {teamLabel(teamLabels, match.awayApplicationId, "Gast")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          inputMode="numeric"
          value={home}
          onChange={(event) => setHome(event.target.value)}
          aria-label="Heimtore"
          disabled={controlsDisabled}
          readOnly={locked}
          className="w-16 disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
        />
        <span className="text-[15px] text-muted">:</span>
        <TextInput
          inputMode="numeric"
          value={away}
          onChange={(event) => setAway(event.target.value)}
          aria-label="Gasttore"
          disabled={controlsDisabled}
          readOnly={locked}
          className="w-16 disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
        />
        <button
          type="submit"
          disabled={controlsDisabled}
          aria-disabled={controlsDisabled}
          className={adminPrimaryButtonClass}
        >
          Ergebnis speichern
        </button>
      </div>
    </form>
  );
}

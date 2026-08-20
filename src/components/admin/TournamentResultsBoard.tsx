"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AdminCard } from "@/components/admin/AdminPanel";
import { TextInput } from "@/components/apply/FormControls";
import { saveMatchResultAction } from "@/lib/db/schedule-actions";
import { formatBerlinClock } from "@/lib/schedule/datetime";
import { StandingsTable } from "@/components/tournaments/StandingsTable";
import { computeGroupStandings } from "@/lib/schedule/standings";
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

  return (
    <div className="grid gap-5">
      {error ? (
        <p className="border border-line bg-white px-5 py-4 text-[14px] text-[#9a2b2b]" role="alert">
          {error}
        </p>
      ) : null}

      <AdminCard title="Ergebnisse">
        {matches.length === 0 ? (
          <p className="text-[14px] text-muted">Noch keine Spiele vorhanden.</p>
        ) : (
          <div className="grid gap-3">
            {matches.map((match) => (
              <ResultRow
                key={match.id}
                match={match}
                fieldName={fields.find((field) => field.id === match.fieldId)?.name ?? "Feld"}
                groupName={groups.find((group) => group.id === match.groupId)?.name ?? "Gruppe"}
                teamLabels={teamLabels}
                pending={pending}
                onSave={async (home, away) => {
                  setPending(true);
                  setError(null);
                  const result = await saveMatchResultAction(tournamentId, match.id, home, away);
                  setPending(false);
                  if (result.error) {
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
          matches.filter((match) => match.groupId === group.id),
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
  onSave,
}: {
  match: TournamentMatchRecord;
  fieldName: string;
  groupName: string;
  teamLabels: Record<string, string>;
  pending: boolean;
  onSave: (home: string, away: string) => Promise<void>;
}) {
  const [home, setHome] = useState(match.homeScore == null ? "" : String(match.homeScore));
  const [away, setAway] = useState(match.awayScore == null ? "" : String(match.awayScore));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(home, away);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 border border-line p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
          {groupName} · {fieldName} · {formatBerlinClock(match.scheduledAt)}
        </p>
        <p className="mt-1 text-[15px] text-ink">
          {teamLabels[match.homeApplicationId] ?? "Heim"} vs {teamLabels[match.awayApplicationId] ?? "Gast"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          inputMode="numeric"
          value={home}
          onChange={(event) => setHome(event.target.value)}
          aria-label="Heimtore"
          className="w-16"
        />
        <span className="text-[15px] text-muted">:</span>
        <TextInput
          inputMode="numeric"
          value={away}
          onChange={(event) => setAway(event.target.value)}
          aria-label="Gasttore"
          className="w-16"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 items-center bg-brand-yellow px-3 text-[11px] font-semibold tracking-[0.08em] text-navy uppercase disabled:opacity-60"
        >
          Ergebnis speichern
        </button>
      </div>
    </form>
  );
}

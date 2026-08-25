"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { AdminCard } from "@/components/admin/AdminPanel";
import { Field, SelectInput, TextInput } from "@/components/apply/FormControls";
import {
  assignTeamToGroupAction,
  autoDistributeTeamsAction,
  createTournamentGroupAction,
  deleteTournamentGroupAction,
  renameTournamentGroupAction,
} from "@/lib/db/schedule-actions";
import { scheduleParticipantId } from "@/lib/schedule/admin";
import {
  participantSourceLabel,
  type TournamentParticipant,
} from "@/lib/tournament-participants";
import type { TournamentGroupRecord } from "@/types/schedule";

type TournamentGroupsBoardProps = {
  tournamentId: string;
  participants: TournamentParticipant[];
  groups: TournamentGroupRecord[];
  groupIdByParticipantId: Record<string, string>;
  hasMatches: boolean;
};

export function TournamentGroupsBoard({
  tournamentId,
  participants,
  groups,
  groupIdByParticipantId,
  hasMatches,
}: TournamentGroupsBoardProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [groupCount, setGroupCount] = useState(String(Math.max(groups.length, 2)));
  const [balanceStrength, setBalanceStrength] = useState(false);
  const [pending, setPending] = useState(false);
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.map((group) => [group.id, group.name])),
  );

  const unassigned = useMemo(
    () =>
      participants.filter((participant) => {
        const id = scheduleParticipantId(participant);
        return Boolean(id) && !groupIdByParticipantId[id!];
      }),
    [participants, groupIdByParticipantId],
  );

  async function run(task: () => Promise<{ error: string | null; notice?: string | null }>) {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await task();
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.notice) {
      setNotice(result.notice);
    }
    router.refresh();
  }

  async function handleAssign(participantId: string, groupId: string) {
    await run(() => assignTeamToGroupAction(tournamentId, participantId, groupId || null));
  }

  async function handleAddGroup() {
    await run(() => createTournamentGroupAction(tournamentId));
  }

  async function handleRename(groupId: string) {
    await run(() =>
      renameTournamentGroupAction(tournamentId, groupId, names[groupId] ?? ""),
    );
  }

  async function handleDistribute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(() =>
      autoDistributeTeamsAction(tournamentId, Number(groupCount), balanceStrength),
    );
  }

  return (
    <div className="grid gap-5">
      {error ? (
        <p className="border border-line bg-white px-5 py-4 text-[14px] text-[#9a2b2b]" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="border border-line bg-white px-5 py-4 text-[14px] text-muted">{notice}</p>
      ) : null}

      <AdminCard title="Gruppen anlegen">
        <div className="flex flex-wrap items-end gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => void handleAddGroup()}
            className="inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] disabled:opacity-60"
          >
            + Gruppe hinzufügen
          </button>
          {hasMatches ? (
            <p className="text-[13px] text-muted">
              Zuordnungen sind gesperrt, solange ein Spielplan existiert.
            </p>
          ) : null}
        </div>
      </AdminCard>

      <AdminCard title="Teams automatisch verteilen">
        <form onSubmit={handleDistribute} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:items-end">
          <Field id="group-count" label="Anzahl Gruppen">
            <TextInput
              id="group-count"
              inputMode="numeric"
              value={groupCount}
              onChange={(event) => setGroupCount(event.target.value)}
            />
          </Field>
          <label className="flex h-11 items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={balanceStrength}
              onChange={(event) => setBalanceStrength(event.target.checked)}
            />
            Stärke ausgleichen
          </label>
          <button
            type="submit"
            disabled={pending || hasMatches}
            className="inline-flex h-11 items-center bg-navy px-4 text-[12px] font-semibold tracking-[0.08em] text-white uppercase disabled:opacity-60"
          >
            Teams automatisch verteilen
          </button>
        </form>
      </AdminCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <GroupColumn
          title="Nicht zugeordnet"
          participants={unassigned}
          groups={groups}
          groupIdByParticipantId={groupIdByParticipantId}
          disabled={pending || hasMatches}
          onAssign={handleAssign}
        />
        {groups.map((group) => {
          const groupParticipants = participants.filter((participant) => {
            const id = scheduleParticipantId(participant);
            return Boolean(id) && groupIdByParticipantId[id!] === group.id;
          });

          return (
            <div key={group.id} className="border border-line bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-end gap-3">
                <Field id={`group-name-${group.id}`} label="Gruppenname">
                  <TextInput
                    id={`group-name-${group.id}`}
                    value={names[group.id] ?? group.name}
                    onChange={(event) =>
                      setNames((current) => ({ ...current, [group.id]: event.target.value }))
                    }
                  />
                </Field>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void handleRename(group.id)}
                  className="inline-flex h-11 items-center border border-line px-3 text-[11px] font-semibold tracking-[0.08em] text-ink uppercase"
                >
                  Umbenennen
                </button>
                <button
                  type="button"
                  disabled={pending || hasMatches}
                  onClick={() => setDeleteGroupId(group.id)}
                  className="inline-flex h-11 items-center px-3 text-[11px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase"
                >
                  Löschen
                </button>
              </div>
              <div className="mt-4">
                <GroupColumn
                  title={`${group.name} · ${groupParticipants.length} Teams`}
                  participants={groupParticipants}
                  groups={groups}
                  groupIdByParticipantId={groupIdByParticipantId}
                  disabled={pending || hasMatches}
                  onAssign={handleAssign}
                  hideTitle
                />
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmModal
        open={Boolean(deleteGroupId)}
        title="Gruppe wirklich löschen?"
        confirmLabel="Löschen"
        onCancel={() => setDeleteGroupId(null)}
        onConfirm={() => {
          const id = deleteGroupId;
          setDeleteGroupId(null);
          if (id) {
            void run(() => deleteTournamentGroupAction(tournamentId, id));
          }
        }}
      />
    </div>
  );
}

function GroupColumn({
  title,
  participants,
  groups,
  groupIdByParticipantId,
  disabled,
  onAssign,
  hideTitle = false,
}: {
  title: string;
  participants: TournamentParticipant[];
  groups: TournamentGroupRecord[];
  groupIdByParticipantId: Record<string, string>;
  disabled: boolean;
  onAssign: (participantId: string, groupId: string) => void;
  hideTitle?: boolean;
}) {
  return (
    <section className={hideTitle ? "" : "border border-line bg-white p-5 sm:p-6"}>
      {hideTitle ? null : (
        <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">{title}</h2>
      )}
      {participants.length === 0 ? (
        <p className={`${hideTitle ? "" : "mt-4"} text-[14px] text-muted`}>Keine Teams in diesem Bereich.</p>
      ) : (
        <ul className={`${hideTitle ? "" : "mt-4"} grid gap-3`}>
          {participants.map((participant) => {
            const participantId = scheduleParticipantId(participant);
            if (!participantId) {
              return null;
            }

            return (
              <li key={participant.id} className="border border-line p-3">
                <p className="text-[14px] font-semibold text-ink">{participant.displayName}</p>
                <p className="mt-1 text-[12px] text-muted">
                  {participantSourceLabel(participant.source)}
                  {participant.ageGroup ? ` · ${participant.ageGroup}` : ""}
                  {participant.groupName ? ` · ${participant.groupName}` : ""}
                </p>
                <div className="mt-3">
                  <SelectInput
                    disabled={disabled}
                    value={groupIdByParticipantId[participantId] ?? ""}
                    onChange={(event) => onAssign(participantId, event.target.value)}
                    aria-label={`Gruppe zuweisen für ${participant.displayName}`}
                  >
                    <option value="">Nicht zugeordnet</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </SelectInput>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

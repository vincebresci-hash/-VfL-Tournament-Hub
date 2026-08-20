"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { AdminCard } from "@/components/admin/AdminPanel";
import { Field, SelectInput, TextInput } from "@/components/apply/FormControls";
import {
  deleteTournamentMatchAction,
  deleteTournamentScheduleAction,
  generateTournamentScheduleAction,
  saveScheduleSettingsAction,
  saveTournamentMatchAction,
} from "@/lib/db/schedule-actions";
import { isoToDatetimeLocal } from "@/lib/schedule/datetime";
import { fieldDisplayName } from "@/lib/schedule/names";
import { MATCH_STATUSES, type MatchStatus, type TournamentFieldRecord, type TournamentGroupRecord, type TournamentMatchRecord } from "@/types/schedule";
import type { AdminTournamentRecord } from "@/types/admin";

const statusLabel: Record<MatchStatus, string> = {
  scheduled: "Geplant",
  live: "Live",
  completed: "Beendet",
  cancelled: "Abgesagt",
};

type TournamentScheduleBoardProps = {
  tournament: AdminTournamentRecord;
  groups: TournamentGroupRecord[];
  fields: TournamentFieldRecord[];
  matches: TournamentMatchRecord[];
  memberIdsByGroupId: Record<string, string[]>;
  teamLabels: Record<string, string>;
};

export function TournamentScheduleBoard({
  tournament,
  groups,
  fields,
  matches,
  memberIdsByGroupId,
  teamLabels,
}: TournamentScheduleBoardProps) {
  const router = useRouter();
  const groupMatches = matches.filter((match) => match.phase !== "knockout");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [duration, setDuration] = useState(String(tournament.matchDurationMinutes));
  const [breakMinutes, setBreakMinutes] = useState(String(tournament.breakMinutes));
  const [restMinutes, setRestMinutes] = useState(String(tournament.minimumRestMinutes));
  const [lunchStart, setLunchStart] = useState(tournament.lunchBreakStart ?? "");
  const [lunchEnd, setLunchEnd] = useState(tournament.lunchBreakEnd ?? "");
  const [fieldNames, setFieldNames] = useState(
    fields.length > 0 ? fields.map((field) => field.name) : [fieldDisplayName(0)],
  );
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [deleteMatchId, setDeleteMatchId] = useState<string | null>(null);

  async function run(task: () => Promise<{ error: string | null; notice?: string | null }>) {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await task();
    setPending(false);
    if (result.error) {
      setError(result.error);
      return false;
    }
    if (result.notice) {
      setNotice(result.notice);
    }
    router.refresh();
    return true;
  }

  async function handleSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(() =>
      saveScheduleSettingsAction(tournament.id, {
        matchDurationMinutes: duration,
        breakMinutes,
        minimumRestMinutes: restMinutes,
        lunchBreakStart: lunchStart,
        lunchBreakEnd: lunchEnd,
        fieldNames,
      }),
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

      <AdminCard title="Spielparameter">
        <form onSubmit={handleSettings} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="duration" label="Spielzeit in Minuten">
              <TextInput id="duration" value={duration} onChange={(event) => setDuration(event.target.value)} />
            </Field>
            <Field id="break" label="Pause zwischen Spielen">
              <TextInput id="break" value={breakMinutes} onChange={(event) => setBreakMinutes(event.target.value)} />
            </Field>
            <Field id="rest" label="Mindestruhezeit">
              <TextInput id="rest" value={restMinutes} onChange={(event) => setRestMinutes(event.target.value)} />
            </Field>
            <Field id="lunch-start" label="Mittagspause von" optional>
              <TextInput
                id="lunch-start"
                type="time"
                value={lunchStart}
                onChange={(event) => setLunchStart(event.target.value)}
              />
            </Field>
            <Field id="lunch-end" label="Mittagspause bis" optional>
              <TextInput
                id="lunch-end"
                type="time"
                value={lunchEnd}
                onChange={(event) => setLunchEnd(event.target.value)}
              />
            </Field>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">Turnierstart</p>
              <p className="mt-2 flex h-11 items-center text-[15px] text-ink">
                {tournament.startTime ? `${tournament.startTime} Uhr` : "09:00 Uhr"}
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            <p className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">Feldnamen</p>
            {fieldNames.map((name, index) => (
              <div key={`field-${index}`} className="flex gap-2">
                <TextInput
                  value={name}
                  onChange={(event) =>
                    setFieldNames((current) =>
                      current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                    )
                  }
                  aria-label={`Feld ${index + 1}`}
                />
                {fieldNames.length > 1 ? (
                  <button
                    type="button"
                    className="text-[11px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase"
                    onClick={() =>
                      setFieldNames((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    Entfernen
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setFieldNames((current) => [...current, fieldDisplayName(current.length)])}
              className="justify-self-start text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
            >
              + Spielfeld hinzufügen
            </button>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-11 w-fit items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase disabled:opacity-60"
          >
            Einstellungen speichern
          </button>
        </form>
      </AdminCard>

      <AdminCard title="Spielplan erzeugen">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => (groupMatches.length > 0 ? setConfirmGenerate(true) : void run(() => generateTournamentScheduleAction(tournament.id)))}
            className="inline-flex h-11 items-center bg-navy px-4 text-[12px] font-semibold tracking-[0.08em] text-white uppercase disabled:opacity-60"
          >
            Spielplan generieren
          </button>
          {groupMatches.length > 0 ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmClear(true)}
              className="inline-flex h-11 items-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
            >
              Spielplan löschen
            </button>
          ) : null}
        </div>
        <p className="mt-3 text-[13px] text-muted">
          Round-Robin innerhalb jeder Gruppe, ohne Hin- und Rückrunde. Uhrzeiten in deutscher Ortszeit.
        </p>
      </AdminCard>

      <AdminCard title="Spiele">
        {groupMatches.length === 0 ? (
          <p className="text-[14px] text-muted">Noch keine Spiele vorhanden.</p>
        ) : (
          <div className="grid gap-4">
            {groupMatches.map((match) => (
              <MatchEditor
                key={match.id}
                match={match}
                groups={groups}
                fields={fields}
                memberIdsByGroupId={memberIdsByGroupId}
                teamLabels={teamLabels}
                pending={pending}
                onSave={(input) => run(() => saveTournamentMatchAction(tournament.id, input))}
                onDelete={() => setDeleteMatchId(match.id)}
              />
            ))}
          </div>
        )}
      </AdminCard>

      <AddMatchForm
        tournamentDate={tournament.date}
        startTime={tournament.startTime}
        groups={groups}
        fields={fields}
        memberIdsByGroupId={memberIdsByGroupId}
        teamLabels={teamLabels}
        pending={pending}
        onSave={(input) => run(() => saveTournamentMatchAction(tournament.id, input))}
      />

      <ConfirmModal
        open={confirmGenerate}
        title="Bestehenden Spielplan ersetzen?"
        confirmLabel="Generieren"
        onCancel={() => setConfirmGenerate(false)}
        onConfirm={() => {
          setConfirmGenerate(false);
          void run(() => generateTournamentScheduleAction(tournament.id));
        }}
      />
      <ConfirmModal
        open={confirmClear}
        title="Gesamten Gruppenspielplan löschen?"
        confirmLabel="Löschen"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          void run(() => deleteTournamentScheduleAction(tournament.id));
        }}
      />
      <ConfirmModal
        open={Boolean(deleteMatchId)}
        title="Dieses Spiel wirklich löschen?"
        confirmLabel="Löschen"
        onCancel={() => setDeleteMatchId(null)}
        onConfirm={() => {
          const id = deleteMatchId;
          setDeleteMatchId(null);
          if (id) {
            void run(() => deleteTournamentMatchAction(tournament.id, id));
          }
        }}
      />
    </div>
  );
}

function MatchEditor({
  match,
  groups,
  fields,
  memberIdsByGroupId,
  teamLabels,
  pending,
  onSave,
  onDelete,
}: {
  match: TournamentMatchRecord;
  groups: TournamentGroupRecord[];
  fields: TournamentFieldRecord[];
  memberIdsByGroupId: Record<string, string[]>;
  teamLabels: Record<string, string>;
  pending: boolean;
  onSave: (input: {
    matchId?: string;
    groupId: string;
    fieldId: string;
    homeApplicationId: string;
    awayApplicationId: string;
    scheduledAt: string;
    status: MatchStatus;
  }) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [groupId, setGroupId] = useState(match.groupId ?? groups[0]?.id ?? "");
  const [fieldId, setFieldId] = useState(match.fieldId ?? fields[0]?.id ?? "");
  const [homeId, setHomeId] = useState(match.homeApplicationId ?? "");
  const [awayId, setAwayId] = useState(match.awayApplicationId ?? "");
  const [scheduledAt, setScheduledAt] = useState(isoToDatetimeLocal(match.scheduledAt));
  const [status, setStatus] = useState<MatchStatus>(match.status);
  const teams = memberIdsByGroupId[groupId] ?? [];

  return (
    <form
      className="grid gap-3 border border-line p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          matchId: match.id,
          groupId,
          fieldId,
          homeApplicationId: homeId,
          awayApplicationId: awayId,
          scheduledAt,
          status,
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectInput value={groupId} onChange={(event) => setGroupId(event.target.value)} aria-label="Gruppe">
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput value={fieldId} onChange={(event) => setFieldId(event.target.value)} aria-label="Spielfeld">
          {fields.map((field) => (
            <option key={field.id} value={field.id}>
              {field.name}
            </option>
          ))}
        </SelectInput>
        <TextInput
          type="datetime-local"
          value={scheduledAt}
          onChange={(event) => setScheduledAt(event.target.value)}
          aria-label="Uhrzeit"
        />
        <SelectInput value={homeId} onChange={(event) => setHomeId(event.target.value)} aria-label="Heimteam">
          {teams.map((id) => (
            <option key={id} value={id}>
              {teamLabels[id] ?? id}
            </option>
          ))}
        </SelectInput>
        <SelectInput value={awayId} onChange={(event) => setAwayId(event.target.value)} aria-label="Auswärtsteam">
          {teams.map((id) => (
            <option key={id} value={id}>
              {teamLabels[id] ?? id}
            </option>
          ))}
        </SelectInput>
        <SelectInput
          value={status}
          onChange={(event) => setStatus(event.target.value as MatchStatus)}
          aria-label="Status"
        >
          {MATCH_STATUSES.map((item) => (
            <option key={item} value={item}>
              {statusLabel[item]}
            </option>
          ))}
        </SelectInput>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center bg-brand-yellow px-3 text-[11px] font-semibold tracking-[0.08em] text-navy uppercase disabled:opacity-60"
        >
          Spiel speichern
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onDelete}
          className="inline-flex h-10 items-center text-[11px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase"
        >
          Löschen
        </button>
      </div>
    </form>
  );
}

function AddMatchForm({
  tournamentDate,
  startTime,
  groups,
  fields,
  memberIdsByGroupId,
  teamLabels,
  pending,
  onSave,
}: {
  tournamentDate: string;
  startTime: string | null;
  groups: TournamentGroupRecord[];
  fields: TournamentFieldRecord[];
  memberIdsByGroupId: Record<string, string[]>;
  teamLabels: Record<string, string>;
  pending: boolean;
  onSave: (input: {
    groupId: string;
    fieldId: string;
    homeApplicationId: string;
    awayApplicationId: string;
    scheduledAt: string;
    status: MatchStatus;
  }) => Promise<boolean>;
}) {
  const firstGroup = groups[0]?.id ?? "";
  const [groupId, setGroupId] = useState(firstGroup);
  const [fieldId, setFieldId] = useState(fields[0]?.id ?? "");
  const teams = memberIdsByGroupId[groupId] ?? [];
  const [homeId, setHomeId] = useState(teams[0] ?? "");
  const [awayId, setAwayId] = useState(teams[1] ?? "");
  const defaultTime = `${tournamentDate}T${(startTime ?? "09:00").slice(0, 5)}`;
  const [scheduledAt, setScheduledAt] = useState(defaultTime);

  if (groups.length === 0) {
    return null;
  }

  return (
    <AdminCard title="Spiel hinzufügen">
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({
            groupId,
            fieldId,
            homeApplicationId: homeId,
            awayApplicationId: awayId,
            scheduledAt,
            status: "scheduled",
          });
        }}
      >
        <SelectInput value={groupId} onChange={(event) => setGroupId(event.target.value)}>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput value={fieldId} onChange={(event) => setFieldId(event.target.value)}>
          {fields.map((field) => (
            <option key={field.id} value={field.id}>
              {field.name}
            </option>
          ))}
        </SelectInput>
        <TextInput
          type="datetime-local"
          value={scheduledAt}
          onChange={(event) => setScheduledAt(event.target.value)}
        />
        <SelectInput value={homeId} onChange={(event) => setHomeId(event.target.value)}>
          {teams.map((id) => (
            <option key={id} value={id}>
              {teamLabels[id] ?? id}
            </option>
          ))}
        </SelectInput>
        <SelectInput value={awayId} onChange={(event) => setAwayId(event.target.value)}>
          {teams.map((id) => (
            <option key={id} value={id}>
              {teamLabels[id] ?? id}
            </option>
          ))}
        </SelectInput>
        <button
          type="submit"
          disabled={pending || teams.length < 2}
          className="inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase disabled:opacity-60"
        >
          Spiel hinzufügen
        </button>
      </form>
    </AdminCard>
  );
}

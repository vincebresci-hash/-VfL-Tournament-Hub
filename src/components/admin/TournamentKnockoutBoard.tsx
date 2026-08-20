"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { AdminCard } from "@/components/admin/AdminPanel";
import { Field, SelectInput, TextInput } from "@/components/apply/FormControls";
import {
  completeTournamentAction,
  generateKnockoutAction,
  saveKnockoutMatchAction,
  saveKnockoutResultAction,
} from "@/lib/db/knockout-actions";
import { isoToDatetimeLocal, formatBerlinClock } from "@/lib/schedule/datetime";
import {
  computeKnockoutPlacements,
  isGroupStageComplete,
  knockoutRoundLabel,
  resolveKnockoutOutcome,
  type KnockoutFormat,
} from "@/lib/schedule/knockout";
import { teamLabel } from "@/lib/schedule/names";
import type { AdminApplication } from "@/types/application";
import type { AdminTournamentRecord } from "@/types/admin";
import type {
  DecidedBy,
  KnockoutRound,
  TournamentFieldRecord,
  TournamentGroupRecord,
  TournamentMatchRecord,
} from "@/types/schedule";

type TournamentKnockoutBoardProps = {
  tournament: AdminTournamentRecord;
  groups: TournamentGroupRecord[];
  fields: TournamentFieldRecord[];
  matches: TournamentMatchRecord[];
  memberIdsByGroupId: Record<string, string[]>;
  participants: AdminApplication[];
  teamLabels: Record<string, string>;
};

const bracketColumns: KnockoutRound[][] = [
  ["quarterfinal"],
  ["semifinal"],
  ["final", "third-place"],
];

const placementRounds: KnockoutRound[] = ["placement-5", "placement-7"];

export function TournamentKnockoutBoard({
  tournament,
  groups,
  fields,
  matches,
  memberIdsByGroupId,
  participants,
  teamLabels,
}: TournamentKnockoutBoardProps) {
  const router = useRouter();
  const knockout = matches.filter((match) => match.phase === "knockout");
  const progress = isGroupStageComplete(groups, memberIdsByGroupId, matches);
  const defaultFormat: KnockoutFormat = groups.length >= 4 ? 8 : 4;
  const matchesByRound = new Map<KnockoutRound, TournamentMatchRecord[]>();
  for (const round of [...bracketColumns.flat(), ...placementRounds]) {
    const items = knockout.filter((match) => match.round === round);
    if (items.length > 0) {
      matchesByRound.set(round, items);
    }
  }
  const [format, setFormat] = useState<KnockoutFormat>(defaultFormat);
  const [includeThirdPlace, setIncludeThirdPlace] = useState(true);
  const [includePlacement5, setIncludePlacement5] = useState(false);
  const [includePlacement7, setIncludePlacement7] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);

  const placements = computeKnockoutPlacements(knockout);
  const finalMatch = knockout.find((match) => match.round === "final");
  const finalReady = Boolean(finalMatch && resolveKnockoutOutcome(finalMatch).winnerId);

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

  async function generate(forceIncomplete: boolean) {
    await run(() =>
      generateKnockoutAction(tournament.id, {
        format,
        includeThirdPlace,
        includePlacement5,
        includePlacement7,
        forceIncomplete,
        startAt,
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
      {!progress.complete ? (
        <p className="border border-line bg-white px-5 py-4 text-[14px] text-muted">
          Die Gruppenphase ist noch nicht vollständig abgeschlossen.
        </p>
      ) : null}

      <AdminCard title="KO-Format">
        <form
          className="grid gap-4"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!progress.complete) {
              setForceOpen(true);
              return;
            }
            if (knockout.length > 0) {
              setReplaceOpen(true);
              return;
            }
            void generate(false);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field id="ko-format" label="Format">
              <SelectInput
                id="ko-format"
                value={String(format)}
                onChange={(event) => setFormat(Number(event.target.value) as KnockoutFormat)}
              >
                <option value="4">4 Teams · Halbfinale</option>
                <option value="8">8 Teams · Viertelfinale</option>
              </SelectInput>
            </Field>
            <Field id="ko-start" label="KO-Start" optional>
              <TextInput
                id="ko-start"
                type="datetime-local"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[14px] text-ink">
            <input
              type="checkbox"
              checked={includeThirdPlace}
              onChange={(event) => setIncludeThirdPlace(event.target.checked)}
            />
            Spiel um Platz 3
          </label>
          {format === 8 ? (
            <>
              <label className="flex items-center gap-2 text-[14px] text-ink">
                <input
                  type="checkbox"
                  checked={includePlacement5}
                  onChange={(event) => setIncludePlacement5(event.target.checked)}
                />
                Platz 5/6
              </label>
              <label className="flex items-center gap-2 text-[14px] text-ink">
                <input
                  type="checkbox"
                  checked={includePlacement7}
                  onChange={(event) => setIncludePlacement7(event.target.checked)}
                />
                Platz 7/8
              </label>
            </>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-11 w-fit items-center bg-navy px-4 text-[12px] font-semibold tracking-[0.08em] text-white uppercase disabled:opacity-60"
          >
            KO-Runde erzeugen
          </button>
        </form>
      </AdminCard>

      {knockout.length > 0 ? (
        <div className="grid gap-5">
          <div className="grid gap-5 lg:grid-cols-3">
            {bracketColumns.map((rounds) => {
              const columnMatches = rounds.flatMap((round) => matchesByRound.get(round) ?? []);
              if (columnMatches.length === 0) {
                return null;
              }

              return (
                <div key={rounds.join("-")} className="grid gap-5">
                  {rounds.map((round) => {
                    const roundMatches = matchesByRound.get(round);
                    if (!roundMatches) {
                      return null;
                    }

                    return (
                      <section key={round} className="border border-line bg-white p-5">
                        <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                          {knockoutRoundLabel[round]}
                        </h2>
                        <div className="mt-4 grid gap-4">
                          {roundMatches.map((match) => (
                            <KnockoutMatchCard
                              key={match.id}
                              match={match}
                              fields={fields}
                              participants={participants}
                              teamLabels={teamLabels}
                              pending={pending}
                              onSaveMatch={(payload, confirmCompletedChange) =>
                                run(() =>
                                  saveKnockoutMatchAction(tournament.id, {
                                    ...payload,
                                    matchId: match.id,
                                    confirmCompletedChange,
                                  }),
                                )
                              }
                              onSaveResult={(payload) =>
                                run(() => saveKnockoutResultAction(tournament.id, match.id, payload))
                              }
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {placementRounds.some((round) => matchesByRound.has(round)) ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {placementRounds.map((round) => {
                const roundMatches = matchesByRound.get(round);
                if (!roundMatches) {
                  return null;
                }

                return (
                  <section key={round} className="border border-line bg-white p-5">
                    <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                      {knockoutRoundLabel[round]}
                    </h2>
                    <div className="mt-4 grid gap-4">
                      {roundMatches.map((match) => (
                        <KnockoutMatchCard
                          key={match.id}
                          match={match}
                          fields={fields}
                          participants={participants}
                          teamLabels={teamLabels}
                          pending={pending}
                          onSaveMatch={(payload, confirmCompletedChange) =>
                            run(() =>
                              saveKnockoutMatchAction(tournament.id, {
                                ...payload,
                                matchId: match.id,
                                confirmCompletedChange,
                              }),
                            )
                          }
                          onSaveResult={(payload) =>
                            run(() => saveKnockoutResultAction(tournament.id, match.id, payload))
                          }
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="border border-line bg-white px-5 py-8 text-[15px] text-muted">
          Noch keine KO-Spiele vorhanden.
        </p>
      )}

      {placements.length > 0 ? (
        <AdminCard title="Abschlussplatzierung">
          <ol className="grid gap-2">
            {placements.map((row) => (
              <li key={`${row.place}-${row.applicationId}`} className="text-[15px] text-ink">
                {row.place}. {teamLabel(teamLabels, row.applicationId)}
              </li>
            ))}
          </ol>
        </AdminCard>
      ) : null}

      {finalReady && tournament.status !== "completed" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => setCompleteOpen(true)}
          className="inline-flex h-11 w-fit items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase disabled:opacity-60"
        >
          Turnier abschließen
        </button>
      ) : null}

      <ConfirmModal
        open={forceOpen}
        title="Die Gruppenphase ist noch nicht vollständig abgeschlossen. KO-Runde trotzdem erzeugen?"
        confirmLabel="Trotzdem erzeugen"
        onCancel={() => setForceOpen(false)}
        onConfirm={() => {
          setForceOpen(false);
          if (knockout.length > 0) {
            setReplaceOpen(true);
            return;
          }
          void generate(true);
        }}
      />
      <ConfirmModal
        open={replaceOpen}
        title="Bestehende KO-Spiele werden ersetzt. Fortfahren?"
        confirmLabel="Ersetzen"
        onCancel={() => setReplaceOpen(false)}
        onConfirm={() => {
          setReplaceOpen(false);
          void generate(!progress.complete);
        }}
      />
      <ConfirmModal
        open={completeOpen}
        title="Turnier wirklich abschließen?"
        confirmLabel="Abschließen"
        onCancel={() => setCompleteOpen(false)}
        onConfirm={() => {
          setCompleteOpen(false);
          void run(() => completeTournamentAction(tournament.id));
        }}
      />
    </div>
  );
}

function KnockoutMatchCard({
  match,
  fields,
  participants,
  teamLabels,
  pending,
  onSaveMatch,
  onSaveResult,
}: {
  match: TournamentMatchRecord;
  fields: TournamentFieldRecord[];
  participants: AdminApplication[];
  teamLabels: Record<string, string>;
  pending: boolean;
  onSaveMatch: (
    payload: {
      homeApplicationId: string;
      awayApplicationId: string;
      fieldId: string;
      scheduledAt: string;
      durationMinutes: string;
    },
    confirmCompletedChange: boolean,
  ) => Promise<boolean>;
  onSaveResult: (payload: {
    homeScore: string;
    awayScore: string;
    decidedBy: DecidedBy;
    homePenalties: string;
    awayPenalties: string;
  }) => Promise<boolean>;
}) {
  const [homeId, setHomeId] = useState(match.homeApplicationId ?? "");
  const [awayId, setAwayId] = useState(match.awayApplicationId ?? "");
  const [fieldId, setFieldId] = useState(match.fieldId ?? fields[0]?.id ?? "");
  const [scheduledAt, setScheduledAt] = useState(isoToDatetimeLocal(match.scheduledAt));
  const [duration, setDuration] = useState(String(match.durationMinutes));
  const [homeScore, setHomeScore] = useState(match.homeScore == null ? "" : String(match.homeScore));
  const [awayScore, setAwayScore] = useState(match.awayScore == null ? "" : String(match.awayScore));
  const [decidedBy, setDecidedBy] = useState<DecidedBy>(match.decidedBy);
  const [homePenalties, setHomePenalties] = useState(
    match.homePenalties == null ? "" : String(match.homePenalties),
  );
  const [awayPenalties, setAwayPenalties] = useState(
    match.awayPenalties == null ? "" : String(match.awayPenalties),
  );
  const [confirmChange, setConfirmChange] = useState(false);
  const outcome = resolveKnockoutOutcome(match);
  const hasResult = match.status === "completed" || match.homeScore != null;

  return (
    <article className="border border-line p-4">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
        {fields.find((field) => field.id === match.fieldId)?.name ?? "Feld"} · {formatBerlinClock(match.scheduledAt)}
      </p>
      <p className="mt-2 font-display text-lg font-bold tracking-wide text-ink uppercase">
        {teamLabel(teamLabels, match.homeApplicationId)} vs {teamLabel(teamLabels, match.awayApplicationId)}
      </p>
      {match.status === "completed" && match.homeScore != null && match.awayScore != null ? (
        <p className="mt-1 text-[15px] text-ink">
          {match.homeScore}:{match.awayScore}
          {match.decidedBy === "penalties"
            ? ` · n.E. ${match.homePenalties ?? 0}:${match.awayPenalties ?? 0}`
            : ""}
          {outcome.winnerId ? ` · Sieger ${teamLabel(teamLabels, outcome.winnerId)}` : ""}
        </p>
      ) : (
        <p className="mt-1 text-[13px] text-muted">Ergebnis folgt</p>
      )}

      <form
        className="mt-4 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (hasResult) {
            setConfirmChange(true);
            return;
          }
          void onSaveMatch(
            {
              homeApplicationId: homeId,
              awayApplicationId: awayId,
              fieldId,
              scheduledAt,
              durationMinutes: duration,
            },
            false,
          );
        }}
      >
        <SelectInput value={homeId} onChange={(event) => setHomeId(event.target.value)} aria-label="Heimteam">
          <option value="">steht noch nicht fest</option>
          {participants.map((application) => (
            <option key={application.id} value={application.id}>
              {teamLabels[application.id] ?? application.teamName}
            </option>
          ))}
        </SelectInput>
        <SelectInput value={awayId} onChange={(event) => setAwayId(event.target.value)} aria-label="Auswärtsteam">
          <option value="">steht noch nicht fest</option>
          {participants.map((application) => (
            <option key={application.id} value={application.id}>
              {teamLabels[application.id] ?? application.teamName}
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
        <TextInput
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
          aria-label="Spielzeit"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center border border-line px-3 text-[11px] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-60"
        >
          Paarung speichern
        </button>
      </form>

      <form
        className="mt-4 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onSaveResult({
            homeScore,
            awayScore,
            decidedBy,
            homePenalties,
            awayPenalties,
          });
        }}
      >
        <div className="flex items-center gap-2">
          <TextInput
            inputMode="numeric"
            value={homeScore}
            onChange={(event) => setHomeScore(event.target.value)}
            aria-label="Heimtore"
            className="w-16"
          />
          <span>:</span>
          <TextInput
            inputMode="numeric"
            value={awayScore}
            onChange={(event) => setAwayScore(event.target.value)}
            aria-label="Gasttore"
            className="w-16"
          />
        </div>
        <SelectInput
          value={decidedBy}
          onChange={(event) => setDecidedBy(event.target.value as DecidedBy)}
          aria-label="Entscheidung"
        >
          <option value="regular">Reguläre Spielzeit</option>
          <option value="penalties">Elfmeterschießen</option>
        </SelectInput>
        {decidedBy === "penalties" ? (
          <div className="flex items-center gap-2">
            <TextInput
              inputMode="numeric"
              value={homePenalties}
              onChange={(event) => setHomePenalties(event.target.value)}
              aria-label="Heim-Elfmeter"
              className="w-16"
            />
            <span>n.E.</span>
            <TextInput
              inputMode="numeric"
              value={awayPenalties}
              onChange={(event) => setAwayPenalties(event.target.value)}
              aria-label="Gast-Elfmeter"
              className="w-16"
            />
          </div>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center bg-brand-yellow px-3 text-[11px] font-semibold tracking-[0.08em] text-navy uppercase disabled:opacity-60"
        >
          Ergebnis speichern
        </button>
      </form>

      <ConfirmModal
        open={confirmChange}
        title="Bestehende Ergebnisse oder Folgepaarungen können dadurch zurückgesetzt werden."
        confirmLabel="Trotzdem ändern"
        onCancel={() => setConfirmChange(false)}
        onConfirm={() => {
          setConfirmChange(false);
          void onSaveMatch(
            {
              homeApplicationId: homeId,
              awayApplicationId: awayId,
              fieldId,
              scheduledAt,
              durationMinutes: duration,
            },
            true,
          );
        }}
      />
    </article>
  );
}

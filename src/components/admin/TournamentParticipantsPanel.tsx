"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminCard, AdminInfo } from "@/components/admin/AdminPanel";
import { ExternalTeamLogoEditor } from "@/components/admin/ExternalTeamLogoEditor";
import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";
import {
  addManualTournamentParticipantAction,
  deactivateManualTournamentParticipantAction,
  updateManualTournamentParticipantAction,
} from "@/lib/db/tournament-participants-actions";
import {
  participantSourceBadge,
  participantSourceLabel,
  type TournamentParticipant,
} from "@/lib/tournament-participants";

type GroupOption = {
  id: string;
  name: string;
};

type ClubOption = {
  id: string;
  name: string;
  logoUrl: string | null;
};

type TournamentParticipantsPanelProps = {
  tournamentId: string;
  participants: TournamentParticipant[];
  groups: GroupOption[];
  clubs: ClubOption[];
};

export function TournamentParticipantsPanel({
  tournamentId,
  participants,
  groups,
  clubs,
}: TournamentParticipantsPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TournamentParticipant | null>(null);
  const [logoEditingId, setLogoEditingId] = useState<string | null>(null);
  const [clubName, setClubName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [groupId, setGroupId] = useState("");
  const [clubId, setClubId] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  const sortedParticipants = useMemo(
    () => [...participants].sort((a, b) => a.displayName.localeCompare(b.displayName, "de")),
    [participants],
  );

  const externalParticipants = useMemo(
    () => participants.filter((entry) => Boolean(entry.externalTeamId)),
    [participants],
  );

  function resetForm() {
    setClubName("");
    setTeamName("");
    setAgeGroup("");
    setBirthYear("");
    setGroupId("");
    setClubId("");
    setLogoUrl("");
    setEditing(null);
    setShowForm(false);
  }

  function startEdit(participant: TournamentParticipant) {
    setEditing(participant);
    setShowForm(true);
    setClubName(participant.clubName);
    setTeamName(participant.teamName);
    setAgeGroup(participant.ageGroup ?? "");
    setBirthYear(participant.birthYear != null ? String(participant.birthYear) : "");
    setGroupId(participant.groupId ?? "");
    setClubId(participant.clubId ?? "");
    setLogoUrl(participant.customLogoUrl ?? "");
  }

  function runAction(action: () => Promise<{ error: string | null; notice: string | null }>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(result.notice);
      resetForm();
      router.refresh();
    });
  }

  function handleLogoDone(result: { error: string | null; notice: string | null }) {
    setError(result.error);
    setNotice(result.notice);
    if (!result.error) {
      setLogoEditingId(null);
      router.refresh();
    }
  }

  return (
    <AdminCard title="Teilnehmerfeld">
      <p className="text-[14px] leading-6 text-muted">
        Alle bestätigten Turnierteilnehmer — aus Bewerbungen, MeinTurnierplan und manuellen
        Einträgen.
      </p>

      <div className="mt-4">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] disabled:opacity-50"
        >
          Teilnehmer manuell hinzufügen
        </button>
      </div>

      {showForm ? (
        <form
          className="mt-5 grid gap-3 border border-line bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const payload = {
              tournamentId,
              clubName,
              teamName,
              ageGroup: ageGroup.trim() || null,
              birthYear: birthYear.trim() ? Number.parseInt(birthYear, 10) : null,
              groupId: groupId || null,
              clubId: clubId || null,
              logoUrl: logoUrl.trim() || null,
            };

            if (editing?.externalTeamId) {
              runAction(() =>
                updateManualTournamentParticipantAction({
                  ...payload,
                  externalTeamId: editing.externalTeamId!,
                }),
              );
              return;
            }

            runAction(() => addManualTournamentParticipantAction(payload));
          }}
        >
          <label className="grid gap-1 text-[13px] text-ink">
            <span className="font-semibold uppercase tracking-[0.08em]">Hub-Verein</span>
            <select
              value={clubId}
              onChange={(event) => {
                const nextId = event.target.value;
                setClubId(nextId);
                const club = clubs.find((entry) => entry.id === nextId);
                if (club) {
                  setClubName(club.name);
                }
              }}
              className="h-10 border border-line bg-white px-3"
            >
              <option value="">Kein Hub-Verein</option>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[13px] text-ink">
            <span className="font-semibold uppercase tracking-[0.08em]">Vereinsname</span>
            <input
              value={clubName}
              onChange={(event) => setClubName(event.target.value)}
              className="h-10 border border-line px-3"
              required
            />
          </label>
          <label className="grid gap-1 text-[13px] text-ink">
            <span className="font-semibold uppercase tracking-[0.08em]">Teamname</span>
            <input
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              className="h-10 border border-line px-3"
              required
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-[13px] text-ink">
              <span className="font-semibold uppercase tracking-[0.08em]">Altersklasse</span>
              <input
                value={ageGroup}
                onChange={(event) => setAgeGroup(event.target.value)}
                className="h-10 border border-line px-3"
              />
            </label>
            <label className="grid gap-1 text-[13px] text-ink">
              <span className="font-semibold uppercase tracking-[0.08em]">Jahrgang</span>
              <input
                value={birthYear}
                onChange={(event) => setBirthYear(event.target.value)}
                className="h-10 border border-line px-3"
                inputMode="numeric"
              />
            </label>
          </div>
          <label className="grid gap-1 text-[13px] text-ink">
            <span className="font-semibold uppercase tracking-[0.08em]">Gruppe</span>
            <select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              className="h-10 border border-line bg-white px-3"
            >
              <option value="">Keine Gruppe</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[13px] text-ink">
            <span className="font-semibold uppercase tracking-[0.08em]">
              Logo-URL{" "}
              <span className="font-medium normal-case tracking-normal text-muted">(optional)</span>
            </span>
            <input
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.target.value)}
              className="h-10 border border-line px-3"
              placeholder="https://…"
              inputMode="url"
            />
            <span className="text-[12px] text-muted">
              Bei gewähltem Hub-Verein wird bevorzugt dessen Vereinslogo angezeigt. Für Upload bitte
              „Logo bearbeiten“ am Eintrag nutzen.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-10 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase disabled:opacity-50"
            >
              {pending ? "Speichere…" : editing ? "Speichern" : "Hinzufügen"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={resetForm}
              className="inline-flex h-10 items-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
            >
              Abbrechen
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="mt-4 border border-line bg-white px-4 py-3 text-[14px] text-brand-red">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-4 border border-line bg-white px-4 py-3 text-[14px] text-ink">{notice}</p>
      ) : null}

      {sortedParticipants.length === 0 ? (
        <p className="mt-5 text-[14px] text-muted">Noch keine bestätigten Teilnehmer.</p>
      ) : (
        <div className="mt-5 grid gap-3">
          {sortedParticipants.map((participant) => (
            <article key={participant.id} className="border border-line bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <ParticipantClubLogo
                    logoUrl={participant.logoUrl}
                    clubName={participant.clubName}
                  />
                  <div className="min-w-0">
                    <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                      {participant.clubName}
                    </p>
                    <p className="mt-1 text-[14px] text-ink">{participant.teamName}</p>
                  </div>
                </div>
                <span className="border border-line px-2 py-1 text-[11px] font-semibold tracking-[0.08em] text-ink uppercase">
                  {participantSourceBadge(participant.source)}
                </span>
              </div>

              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <AdminInfo label="Quelle" value={participantSourceLabel(participant.source)} />
                <AdminInfo label="Gruppe" value={participant.groupName ?? "—"} />
                <AdminInfo label="Altersklasse" value={participant.ageGroup ?? "—"} />
                <AdminInfo
                  label="Jahrgang"
                  value={participant.birthYear != null ? String(participant.birthYear) : "—"}
                />
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                {participant.source === "application" && participant.applicationId ? (
                  <Link
                    href={`/admin/bewerbungen/${participant.applicationId}`}
                    className="inline-flex text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
                  >
                    Bewerbung öffnen →
                  </Link>
                ) : null}
                {participant.externalTeamId ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      setLogoEditingId((current) =>
                        current === participant.externalTeamId ? null : participant.externalTeamId,
                      )
                    }
                    className="inline-flex h-9 items-center border border-line px-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
                  >
                    Logo bearbeiten
                  </button>
                ) : null}
                {participant.source === "manual" && participant.externalTeamId ? (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => startEdit(participant)}
                      className="inline-flex h-9 items-center border border-line px-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        runAction(() =>
                          deactivateManualTournamentParticipantAction({
                            tournamentId,
                            externalTeamId: participant.externalTeamId!,
                          }),
                        )
                      }
                      className="inline-flex h-9 items-center border border-line px-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
                    >
                      Deaktivieren
                    </button>
                  </>
                ) : null}
              </div>

              {participant.externalTeamId && logoEditingId === participant.externalTeamId ? (
                <ExternalTeamLogoEditor
                  tournamentId={tournamentId}
                  participant={participant}
                  clubs={clubs}
                  allExternalParticipants={externalParticipants}
                  onDone={handleLogoDone}
                  onCancel={() => setLogoEditingId(null)}
                />
              ) : null}
            </article>
          ))}
        </div>
      )}
    </AdminCard>
  );
}

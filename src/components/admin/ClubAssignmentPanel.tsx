"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AdminCard,
  adminCardShellClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from "@/components/admin/AdminPanel";
import { SelectInput, TextInput } from "@/components/apply/FormControls";
import {
  createAssignableClubAction,
  type AssignableClub,
} from "@/lib/db/club-assignment-actions";
import { updateApplicationParticipantClubAction } from "@/lib/db/tournament-participants-actions";
import type { ClubSuggestion } from "@/lib/schedule/club-assignment-suggest";

export type ClubAssignmentEntry = {
  participantId: string;
  teamName: string;
  /** Present for accepted-application participants (assignable inline). */
  applicationId: string | null;
  suggestion: ClubSuggestion | null;
};

type ClubOptionView = { id: string; name: string; city?: string | null };

type ClubAssignmentPanelProps = {
  tournamentId: string;
  entries: ClubAssignmentEntry[];
  clubs: ClubOptionView[];
  totalParticipants: number;
  participantManagementHref: string;
  disabled: boolean;
};

const CONFIDENCE_LABEL: Record<string, string> = {
  exact: "Sicher",
  strong: "Sehr ähnlich – bestätigen",
  weak: "Möglich – prüfen",
  none: "Kein Vorschlag",
};

export function ClubAssignmentPanel({
  tournamentId,
  entries,
  clubs,
  totalParticipants,
  participantManagementHref,
  disabled,
}: ClubAssignmentPanelProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      entries.map((entry) => [
        entry.participantId,
        entry.suggestion?.safe ? (entry.suggestion.suggestedClubId ?? "") : "",
      ]),
    ),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [batchPending, setBatchPending] = useState(false);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowNotice, setRowNotice] = useState<Record<string, string>>({});

  // Inline club creation.
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);
  const [createDuplicates, setCreateDuplicates] = useState<AssignableClub[]>([]);
  const [creating, setCreating] = useState(false);

  // Distinguish same-named clubs (e.g. two "VfL Kirchheim") in the dropdown.
  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const club of clubs) {
      const key = club.name.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [clubs]);

  function clubLabel(club: ClubOptionView): string {
    const duplicated = (duplicateNames.get(club.name.trim().toLowerCase()) ?? 0) > 1;
    if (!duplicated) {
      return club.name;
    }
    return club.city ? `${club.name} (${club.city})` : `${club.name} (#${club.id.slice(0, 6)})`;
  }

  const assigned = Math.max(totalParticipants - entries.length, 0);

  if (entries.length === 0 && totalParticipants === 0) {
    return null;
  }

  async function assignOne(entry: ClubAssignmentEntry): Promise<boolean> {
    if (!entry.applicationId) {
      return false;
    }
    const clubId = selected[entry.participantId] || null;
    if (!clubId) {
      setRowError((current) => ({ ...current, [entry.participantId]: "Bitte zuerst einen Verein auswählen." }));
      return false;
    }
    setRowError((current) => ({ ...current, [entry.participantId]: "" }));
    setRowNotice((current) => ({ ...current, [entry.participantId]: "" }));
    const result = await updateApplicationParticipantClubAction({
      tournamentId,
      applicationId: entry.applicationId,
      clubId,
    });
    if (result.error) {
      setRowError((current) => ({ ...current, [entry.participantId]: result.error as string }));
      return false;
    }
    setRowNotice((current) => ({
      ...current,
      [entry.participantId]: result.notice ?? "Vereinszuordnung gespeichert.",
    }));
    return true;
  }

  async function assign(entry: ClubAssignmentEntry) {
    setPendingId(entry.participantId);
    const ok = await assignOne(entry);
    setPendingId(null);
    if (ok) {
      router.refresh();
    }
  }

  async function assignAllSelected() {
    const ready = entries.filter((entry) => entry.applicationId && selected[entry.participantId]);
    if (ready.length === 0) {
      return;
    }
    setBatchPending(true);
    let anyOk = false;
    for (const entry of ready) {
      const ok = await assignOne(entry);
      anyOk = anyOk || ok;
    }
    setBatchPending(false);
    if (anyOk) {
      router.refresh();
    }
  }

  async function createClub(allowDuplicate: boolean) {
    const name = newName.trim();
    if (name.length < 2) {
      setCreateError("Bitte einen gültigen Vereinsnamen angeben.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    setCreateNotice(null);
    const result = await createAssignableClubAction({ name, city: newCity.trim() || null, allowDuplicate });
    setCreating(false);
    if (result.duplicates.length > 0 && !allowDuplicate) {
      setCreateDuplicates(result.duplicates);
      return;
    }
    if (result.error) {
      setCreateError(result.error);
      return;
    }
    setCreateDuplicates([]);
    setNewName("");
    setNewCity("");
    setCreateNotice(`„${result.club?.name}“ angelegt. Du kannst ihn nun zuordnen.`);
    router.refresh();
  }

  const batchReadyCount = entries.filter((entry) => entry.applicationId && selected[entry.participantId]).length;

  return (
    <AdminCard title="Vereinszuordnung">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] leading-relaxed text-muted">
            Ordne jede Mannschaft einem Verein zu. Vorschläge beruhen auf den Mannschafts-
            und Vereinsnamen; unsichere Vorschläge müssen bestätigt werden. Es wird nie
            automatisch ein Verein gesetzt und keine Vereine zusammengeführt.
          </p>
          <span className="text-[13px] font-semibold text-ink whitespace-nowrap">
            {assigned} / {totalParticipants} zugeordnet
          </span>
        </div>

        {entries.length === 0 ? (
          <p className={`${adminCardShellClass} border-[#bfe3cc] bg-[#f1faf4] px-4 py-3 text-[13px] text-[#1f7a4d]`}>
            Alle Mannschaften sind einem Verein zugeordnet.
          </p>
        ) : null}

        {entries.length > 0 ? (
          <>
            <ul className="grid gap-3" role="list">
              {entries.map((entry) => {
                const suggestion = entry.suggestion;
                const assignable = Boolean(entry.applicationId);
                return (
                  <li key={entry.participantId} className={`${adminCardShellClass} grid gap-2 px-3.5 py-3`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[14px] font-semibold text-ink">{entry.teamName}</span>
                      {suggestion && suggestion.confidence !== "none" ? (
                        <span
                          className={`text-[11px] font-semibold tracking-[0.06em] uppercase ${
                            suggestion.safe ? "text-[#1f7a4d]" : "text-[#7a5a1e]"
                          }`}
                        >
                          {CONFIDENCE_LABEL[suggestion.confidence]}
                          {suggestion.suggestedClubName ? `: ${suggestion.suggestedClubName}` : ""}
                        </span>
                      ) : null}
                    </div>

                    {assignable ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <SelectInput
                          aria-label={`Verein für ${entry.teamName}`}
                          value={selected[entry.participantId] ?? ""}
                          disabled={disabled || pendingId === entry.participantId || batchPending}
                          onChange={(event) =>
                            setSelected((current) => ({ ...current, [entry.participantId]: event.target.value }))
                          }
                          className="min-w-[16rem]"
                        >
                          <option value="">Verein wählen…</option>
                          {clubs.map((club) => (
                            <option key={club.id} value={club.id}>
                              {clubLabel(club)}
                            </option>
                          ))}
                        </SelectInput>
                        <button
                          type="button"
                          disabled={disabled || pendingId === entry.participantId || batchPending}
                          onClick={() => void assign(entry)}
                          className={adminPrimaryButtonClass}
                        >
                          {pendingId === entry.participantId ? "Wird gespeichert…" : "Zuordnen"}
                        </button>
                      </div>
                    ) : (
                      <p className="text-[13px] leading-relaxed text-muted">
                        Externe Mannschaft: bitte in der{" "}
                        <a
                          href={participantManagementHref}
                          className="font-semibold text-ink underline decoration-brand-blue/50 underline-offset-4 hover:text-brand-blue"
                        >
                          Teilnehmerverwaltung
                        </a>{" "}
                        zuordnen.
                      </p>
                    )}

                    {rowError[entry.participantId] ? (
                      <p className="text-[13px] text-[#9a2b2b]" role="alert">
                        {rowError[entry.participantId]}
                      </p>
                    ) : null}
                    {rowNotice[entry.participantId] ? (
                      <p className="text-[13px] text-[#1f7a4d]">{rowNotice[entry.participantId]}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {batchReadyCount > 1 ? (
              <button
                type="button"
                disabled={disabled || batchPending}
                onClick={() => void assignAllSelected()}
                className={`${adminPrimaryButtonClass} w-fit`}
              >
                {batchPending ? "Wird gespeichert…" : `${batchReadyCount} geprüfte Zuordnungen speichern`}
              </button>
            ) : null}
          </>
        ) : null}

        <div className={`${adminCardShellClass} grid gap-2 px-3.5 py-3`}>
          <p className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">
            Verein fehlt? Direkt anlegen
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <TextInput
              aria-label="Neuer Vereinsname"
              placeholder="z. B. TSV Ötlingen"
              value={newName}
              disabled={disabled || creating}
              onChange={(event) => setNewName(event.target.value)}
              className="min-w-[14rem]"
            />
            <TextInput
              aria-label="Stadt (optional)"
              placeholder="Stadt (optional)"
              value={newCity}
              disabled={disabled || creating}
              onChange={(event) => setNewCity(event.target.value)}
              className="min-w-[10rem]"
            />
            <button
              type="button"
              disabled={disabled || creating}
              onClick={() => void createClub(false)}
              className={adminSecondaryButtonClass}
            >
              {creating ? "Wird angelegt…" : "Verein anlegen"}
            </button>
          </div>
          {createDuplicates.length > 0 ? (
            <div className={`${adminCardShellClass} border-[#e2c48a] bg-[#fff8e8] px-3 py-2.5 text-[13px] text-[#7a5a1e]`} role="status">
              <p>
                Es {createDuplicates.length === 1 ? "existiert" : "existieren"} bereits{" "}
                {createDuplicates.length === 1 ? "ein ähnlicher Verein" : "ähnliche Vereine"}:{" "}
                {createDuplicates.map((club) => (club.city ? `${club.name} (${club.city})` : club.name)).join(", ")}.
                Es wird nichts automatisch zusammengeführt.
              </p>
              <button
                type="button"
                disabled={creating}
                onClick={() => void createClub(true)}
                className="mt-2 text-[12px] font-semibold tracking-[0.06em] text-ink uppercase underline decoration-[#d7a31a] underline-offset-4"
              >
                Trotzdem als neuen Verein anlegen
              </button>
            </div>
          ) : null}
          {createError ? (
            <p className="text-[13px] text-[#9a2b2b]" role="alert">
              {createError}
            </p>
          ) : null}
          {createNotice ? <p className="text-[13px] text-[#1f7a4d]">{createNotice}</p> : null}
        </div>
      </div>
    </AdminCard>
  );
}

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";
import {
  applyExternalTeamLogoToSelectedTeamsAction,
  updateExternalTeamLogoAction,
  uploadExternalTeamLogoFormAction,
} from "@/lib/db/tournament-participants-actions";
import { suggestRelatedTeamsForLogoApply } from "@/lib/tournament-participant-logos";
import { resolveParticipantLogoUrl } from "@/lib/tournament-participants";
import type { TournamentParticipant } from "@/lib/tournament-participants";

type ClubOption = {
  id: string;
  name: string;
  logoUrl: string | null;
};

type ExternalTeamLogoEditorProps = {
  tournamentId: string;
  participant: TournamentParticipant;
  clubs: ClubOption[];
  allExternalParticipants: TournamentParticipant[];
  onDone: (result: { error: string | null; notice: string | null }) => void;
  onCancel: () => void;
};

export function ExternalTeamLogoEditor({
  tournamentId,
  participant,
  clubs,
  allExternalParticipants,
  onDone,
  onCancel,
}: ExternalTeamLogoEditorProps) {
  const [pending, startTransition] = useTransition();
  const [clubId, setClubId] = useState(participant.clubId ?? "");
  const [logoUrl, setLogoUrl] = useState(participant.customLogoUrl ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [showApply, setShowApply] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    return () => {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

  function onFileSelected(next: File | null) {
    setFilePreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return next ? URL.createObjectURL(next) : null;
    });
    setFile(next);
  }

  const candidates = useMemo(
    () =>
      allExternalParticipants
        .filter((entry) => entry.externalTeamId && entry.externalTeamId !== participant.externalTeamId)
        .map((entry) => ({
          id: entry.externalTeamId!,
          displayName: entry.displayName,
          clubName: entry.clubName,
          clubId: entry.clubId,
        })),
    [allExternalParticipants, participant.externalTeamId],
  );

  const suggested = useMemo(
    () =>
      suggestRelatedTeamsForLogoApply({
        sourceTeamId: participant.externalTeamId ?? "",
        sourceClubId: clubId || participant.clubId,
        sourceClubName: participant.clubName,
        candidates,
      }),
    [candidates, clubId, participant.clubId, participant.clubName, participant.externalTeamId],
  );

  const previewClub = clubs.find((club) => club.id === (clubId || participant.clubId || ""));
  const linkedHubHasLogo = Boolean(previewClub?.logoUrl?.trim());
  const displayPreview = resolveParticipantLogoUrl({
    hubClubLogoUrl: previewClub?.logoUrl ?? null,
    storedLogoUrl: filePreviewUrl || logoUrl.trim() || participant.customLogoUrl,
  });

  function run(action: () => Promise<{ error: string | null; notice: string | null }>) {
    startTransition(async () => {
      const result = await action();
      onDone(result);
    });
  }

  function openApplyPanel() {
    setShowApply(true);
    setSelectedIds(suggested.map((entry) => entry.id));
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  function uploadSelectedFile() {
    if (!file || !participant.externalTeamId) {
      return;
    }

    const formData = new FormData();
    formData.set("tournamentId", tournamentId);
    formData.set("externalTeamId", participant.externalTeamId);
    formData.set("logoFile", file);
    run(() => uploadExternalTeamLogoFormAction(formData));
  }

  return (
    <div className="mt-4 border border-line bg-surface p-4">
      <p className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">
        Logo bearbeiten
      </p>
      <p className="mt-2 text-[13px] leading-6 text-muted">
        Ein Hub-Verein ist nicht erforderlich. Du kannst jedem importierten oder manuellen Team
        direkt ein eigenes Logo zuweisen.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <ParticipantClubLogo logoUrl={displayPreview} clubName={participant.clubName} />
        <div className="text-[13px] text-muted">
          <p className="font-medium text-ink">Aktuelle Vorschau</p>
          <p className="mt-1">Priorität: Hub-Verein → eigenes Logo → Placeholder</p>
          {linkedHubHasLogo && participant.customLogoUrl ? (
            <p className="mt-1 text-ink">
              Hinweis: Ein Hub-Vereinslogo hat Vorrang vor dem eigenen Logo.
            </p>
          ) : null}
        </div>
      </div>

      <section className="mt-5 border border-line bg-white p-4">
        <h3 className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">
          Optionaler Hub-Verein
        </h3>
        <label className="mt-3 grid gap-1 text-[13px] text-ink">
          <span className="sr-only">Hub-Verein</span>
          <select
            value={clubId}
            onChange={(event) => setClubId(event.target.value)}
            className="h-10 border border-line bg-white px-3"
            disabled={pending}
          >
            <option value="">Kein Hub-Verein</option>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
                {club.logoUrl ? " · mit Logo" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !clubId}
            onClick={() =>
              run(() =>
                updateExternalTeamLogoAction({
                  tournamentId,
                  externalTeamId: participant.externalTeamId!,
                  mode: "hub-club",
                  clubId,
                }),
              )
            }
            className="inline-flex h-9 items-center border border-line bg-white px-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-50"
          >
            Hub-Verein verknüpfen
          </button>
          {participant.clubId ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() =>
                  updateExternalTeamLogoAction({
                    tournamentId,
                    externalTeamId: participant.externalTeamId!,
                    mode: "unlink-hub",
                  }),
                )
              }
              className="inline-flex h-9 items-center border border-line bg-white px-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-50"
            >
              Hub-Verein-Verknüpfung entfernen
            </button>
          ) : null}
        </div>
      </section>

      <section className="mt-4 border border-line bg-white p-4">
        <h3 className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">
          Eigenes Logo
        </h3>
        <p className="mt-2 text-[13px] text-muted">
          Funktioniert auch ohne Hub-Verein. Speichert direkt auf dem Turnierteam.
        </p>

        <label className="mt-3 grid gap-1 text-[13px] text-ink">
          <span className="font-semibold uppercase tracking-[0.08em]">Datei auswählen</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={pending}
            onChange={(event) => onFileSelected(event.target.files?.[0] ?? null)}
            className="block w-full text-[13px]"
          />
        </label>
        <button
          type="button"
          disabled={pending || !file}
          onClick={uploadSelectedFile}
          className="mt-3 inline-flex h-9 items-center bg-brand-yellow px-3 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase disabled:opacity-50"
        >
          Logo hochladen
        </button>

        <label className="mt-4 grid gap-1 text-[13px] text-ink">
          <span className="font-semibold uppercase tracking-[0.08em]">Oder Logo-URL</span>
          <input
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
            className="h-10 border border-line bg-white px-3"
            placeholder="https://…"
            disabled={pending}
          />
        </label>
        <button
          type="button"
          disabled={pending || !logoUrl.trim()}
          onClick={() =>
            run(() =>
              updateExternalTeamLogoAction({
                tournamentId,
                externalTeamId: participant.externalTeamId!,
                mode: "url",
                logoUrl,
              }),
            )
          }
          className="mt-3 inline-flex h-9 items-center border border-line bg-white px-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-50"
        >
          URL speichern
        </button>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() =>
              updateExternalTeamLogoAction({
                tournamentId,
                externalTeamId: participant.externalTeamId!,
                mode: "remove",
              }),
            )
          }
          className="inline-flex h-9 items-center border border-line bg-white px-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-50"
        >
          Logo entfernen
        </button>
        <button
          type="button"
          disabled={pending || candidates.length === 0 || !participant.customLogoUrl}
          onClick={openApplyPanel}
          className="inline-flex h-9 items-center border border-line bg-white px-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-50"
        >
          Für ausgewählte Teams übernehmen
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="inline-flex h-9 items-center border border-line px-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
        >
          Schließen
        </button>
      </div>

      {participant.clubId && linkedHubHasLogo ? (
        <p className="mt-3 text-[13px] text-muted">
          „Logo entfernen“ löscht nur das eigene Logo. Das Hub-Vereinslogo bleibt aktiv, solange die
          Verknüpfung besteht.
        </p>
      ) : null}

      {showApply ? (
        <div className="mt-4 border border-line bg-white p-4">
          <p className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">
            Logo auf Teams übernehmen
          </p>
          <p className="mt-2 text-[13px] text-muted">
            Übernimmt die eigene Logo-URL auf die markierten Teams. Kein Hub-Verein erforderlich.
            Vorschläge (gleiche club_id oder exakter Vereinsname) sind vorausgewählt.
          </p>

          <ul className="mt-3 grid gap-2">
            {candidates.map((candidate) => {
              const isSuggested = suggested.some((entry) => entry.id === candidate.id);
              return (
                <li key={candidate.id} className="flex items-start gap-2 text-[13px] text-ink">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedIds.includes(candidate.id)}
                    disabled={pending}
                    onChange={() => toggleSelected(candidate.id)}
                  />
                  <span>
                    {candidate.displayName}
                    {isSuggested ? (
                      <span className="ml-2 text-[11px] tracking-[0.06em] text-muted uppercase">
                        Vorschlag
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || selectedIds.length === 0}
              onClick={() =>
                run(() =>
                  applyExternalTeamLogoToSelectedTeamsAction({
                    tournamentId,
                    sourceExternalTeamId: participant.externalTeamId!,
                    selectedExternalTeamIds: selectedIds,
                  }),
                )
              }
              className="inline-flex h-9 items-center bg-brand-yellow px-3 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase disabled:opacity-50"
            >
              Übernahme bestätigen
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setShowApply(false)}
              className="inline-flex h-9 items-center border border-line px-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

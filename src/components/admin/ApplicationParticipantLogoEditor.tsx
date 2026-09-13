"use client";

import { useEffect, useState, useTransition } from "react";
import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";
import {
  updateApplicationParticipantLogoAction,
  uploadApplicationParticipantLogoFormAction,
} from "@/lib/db/tournament-participants-actions";
import { resolveApplicationParticipantLogoUrl } from "@/lib/tournament-participants";
import type { TournamentParticipant } from "@/lib/tournament-participants";

type ClubOption = {
  id: string;
  name: string;
  logoUrl: string | null;
};

type ApplicationParticipantLogoEditorProps = {
  tournamentId: string;
  participant: TournamentParticipant;
  clubs: ClubOption[];
  onDone: (result: { error: string | null; notice: string | null }) => void;
  onCancel: () => void;
};

export function ApplicationParticipantLogoEditor({
  tournamentId,
  participant,
  clubs,
  onDone,
  onCancel,
}: ApplicationParticipantLogoEditorProps) {
  const [pending, startTransition] = useTransition();
  const [logoUrl, setLogoUrl] = useState(participant.customLogoUrl ?? "");
  const [fileName, setFileName] = useState<string | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [previewOverrideUrl, setPreviewOverrideUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

  function onFileSelected(next: File | null) {
    setLocalError(null);
    setLocalNotice(null);
    setFileName(next?.name ?? null);
    setFilePreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return next ? URL.createObjectURL(next) : null;
    });
  }

  const linkedClub = clubs.find((club) => club.id === (participant.clubId || ""));
  const clubLogoUrl = linkedClub?.logoUrl ?? null;
  const overrideCandidate =
    previewOverrideUrl ||
    filePreviewUrl ||
    logoUrl.trim() ||
    participant.customLogoUrl ||
    null;
  const displayPreview = resolveApplicationParticipantLogoUrl({
    logoManualOverride: Boolean(overrideCandidate),
    applicationLogoUrl: overrideCandidate,
    clubLogoUrl,
  });

  function run(action: () => Promise<{ error: string | null; notice: string | null }>) {
    setLocalError(null);
    setLocalNotice(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.error) {
          setLocalError(result.error);
          onDone(result);
          return;
        }
        setLocalNotice(result.notice);
        onDone(result);
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? `Logo konnte nicht gespeichert werden: ${error.message.slice(0, 180)}`
            : "Logo konnte nicht gespeichert werden.";
        setLocalError(message);
        onDone({ error: message, notice: null });
      }
    });
  }

  if (!participant.applicationId) {
    return null;
  }

  return (
    <div className="mt-4 border border-line bg-surface p-4">
      <p className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">
        Logo bearbeiten
      </p>
      <p className="mt-2 text-[13px] leading-6 text-muted">
        Eigenes Logo nur für diesen Bewerbungsteilnehmer. Das globale Vereinslogo bleibt
        unverändert. Ohne Override wird weiter das Vereinslogo (falls vorhanden) genutzt.
      </p>

      {localError ? (
        <p className="mt-3 border border-[#d9b0b0] bg-[#fff5f5] px-3 py-2 text-[13px] text-[#9a2b2b]">
          {localError}
        </p>
      ) : null}
      {localNotice ? (
        <p className="mt-3 border border-line bg-white px-3 py-2 text-[13px] text-ink">{localNotice}</p>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <ParticipantClubLogo logoUrl={displayPreview} clubName={participant.clubName} />
        <div className="text-[13px] text-muted">
          <p className="font-medium text-ink">Aktuelle Vorschau</p>
          <p className="mt-1">Priorität: Bewerbungs-Override → Vereinslogo → Placeholder</p>
          {clubLogoUrl && overrideCandidate ? (
            <p className="mt-1 text-ink">
              Hinweis: Das eigene Bewerbungs-Logo hat Vorrang vor dem Vereinslogo.
            </p>
          ) : null}
        </div>
      </div>

      <section className="mt-5 border border-line bg-white p-4">
        <h3 className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">
          Eigenes Bewerbungs-Logo
        </h3>

        <form
          className="mt-3 grid gap-3"
          action={(formData) => {
            run(async () => {
              const result = await uploadApplicationParticipantLogoFormAction(formData);
              if (!result.error) {
                setPreviewOverrideUrl(filePreviewUrl);
                setFileName(null);
              }
              return {
                error: result.error,
                notice: result.error ? null : (result.notice ?? "Logo gespeichert"),
              };
            });
          }}
        >
          <input type="hidden" name="tournamentId" value={tournamentId} />
          <input type="hidden" name="applicationId" value={participant.applicationId} />
          <label className="grid gap-1 text-[13px] text-ink">
            <span className="font-semibold uppercase tracking-[0.08em]">Datei auswählen</span>
            <input
              type="file"
              name="logoFile"
              accept="image/png,image/jpeg,image/webp"
              disabled={pending}
              required
              onChange={(event) => onFileSelected(event.target.files?.[0] ?? null)}
              className="block w-full text-[13px]"
            />
            {fileName ? <span className="text-[12px] text-muted">{fileName}</span> : null}
          </label>
          <button
            type="submit"
            disabled={pending || !fileName}
            className="inline-flex h-9 w-fit items-center bg-brand-yellow px-3 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase disabled:opacity-50"
          >
            {pending ? "Lade hoch…" : "Logo hochladen"}
          </button>
        </form>

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
            run(async () => {
              const result = await updateApplicationParticipantLogoAction({
                tournamentId,
                applicationId: participant.applicationId!,
                mode: "url",
                logoUrl,
              });
              if (!result.error) {
                setPreviewOverrideUrl(logoUrl.trim());
              }
              return result;
            })
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
            run(async () => {
              const result = await updateApplicationParticipantLogoAction({
                tournamentId,
                applicationId: participant.applicationId!,
                mode: "remove",
              });
              if (!result.error) {
                setPreviewOverrideUrl(null);
                setLogoUrl("");
              }
              return result;
            })
          }
          className="inline-flex h-9 items-center border border-line bg-white px-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-50"
        >
          Logo entfernen
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

      {clubLogoUrl ? (
        <p className="mt-3 text-[13px] text-muted">
          „Logo entfernen“ löscht nur das Bewerbungs-Override. Danach gilt wieder das Vereinslogo.
        </p>
      ) : null}
    </div>
  );
}

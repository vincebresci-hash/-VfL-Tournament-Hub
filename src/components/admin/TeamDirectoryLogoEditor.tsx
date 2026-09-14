"use client";

import { useEffect, useState, useTransition } from "react";
import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";
import {
  updateTeamDirectoryLogoAction,
  uploadTeamDirectoryLogoFormAction,
} from "@/lib/team-directory/actions";

type TeamDirectoryLogoEditorProps = {
  entryId: string;
  clubName: string;
  logoUrl: string | null;
  onDone: (result: { error: string | null; notice: string | null }) => void;
};

export function TeamDirectoryLogoEditor({
  entryId,
  clubName,
  logoUrl: savedLogoUrl,
  onDone,
}: TeamDirectoryLogoEditorProps) {
  const [pending, startTransition] = useTransition();
  const [urlInput, setUrlInput] = useState(savedLogoUrl ?? "");
  const [fileName, setFileName] = useState<string | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [optimisticLogoUrl, setOptimisticLogoUrl] = useState<string | null | undefined>(
    undefined,
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [localNotice, setLocalNotice] = useState<string | null>(null);

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

  const currentLogoUrl =
    optimisticLogoUrl !== undefined ? optimisticLogoUrl : savedLogoUrl;
  const displayPreview = filePreviewUrl || currentLogoUrl || null;

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

  return (
    <div className="border border-line bg-surface p-4">
      <p className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">
        Team-Logo
      </p>
      <p className="mt-2 text-[13px] leading-6 text-muted">
        Nur für diesen Team-Datenbank-Eintrag. Ändert keine Vereins-, Bewerbungs- oder
        Turnierlogos.
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
        <ParticipantClubLogo logoUrl={displayPreview} clubName={clubName} />
        <div className="text-[13px] text-muted">
          <p className="font-medium text-ink">Aktuelle Vorschau</p>
          <p className="mt-1">PNG, JPEG oder WebP · max. 2 MB</p>
        </div>
      </div>

      <form
        className="mt-5 grid gap-3"
        action={(formData) => {
          run(async () => {
            const result = await uploadTeamDirectoryLogoFormAction(formData);
            if (!result.error) {
              setOptimisticLogoUrl(filePreviewUrl);
              setFileName(null);
            }
            return {
              error: result.error,
              notice: result.error ? null : (result.notice ?? "Logo gespeichert."),
            };
          });
        }}
      >
        <input type="hidden" name="entryId" value={entryId} />
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
          {pending ? "Lade hoch…" : currentLogoUrl ? "Logo ersetzen" : "Logo hochladen"}
        </button>
      </form>

      <label className="mt-4 grid gap-1 text-[13px] text-ink">
        <span className="font-semibold uppercase tracking-[0.08em]">Oder Logo-URL</span>
        <input
          value={urlInput}
          onChange={(event) => setUrlInput(event.target.value)}
          className="h-10 border border-line bg-white px-3"
          placeholder="https://…"
          disabled={pending}
        />
      </label>
      <button
        type="button"
        disabled={pending || !urlInput.trim()}
        onClick={() =>
          run(async () => {
            const result = await updateTeamDirectoryLogoAction({
              entryId,
              mode: "url",
              logoUrl: urlInput,
            });
            if (!result.error) {
              setOptimisticLogoUrl(urlInput.trim());
            }
            return result;
          })
        }
        className="mt-3 inline-flex h-9 items-center border border-line bg-white px-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-50"
      >
        URL speichern
      </button>

      {currentLogoUrl ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const result = await updateTeamDirectoryLogoAction({
                entryId,
                mode: "remove",
              });
              if (!result.error) {
                setOptimisticLogoUrl(null);
                setUrlInput("");
              }
              return result;
            })
          }
          className="mt-4 inline-flex h-9 items-center border border-line bg-white px-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-50"
        >
          Logo entfernen
        </button>
      ) : null}
    </div>
  );
}

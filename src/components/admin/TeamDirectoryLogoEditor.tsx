"use client";

import { useEffect, useState, useTransition } from "react";
import { adminCardShellClass } from "@/components/admin/AdminPanel";
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
    <div className={`${adminCardShellClass} p-4 sm:p-5`}>
      <h2 className="font-display text-[15px] font-bold tracking-[0.04em] text-ink uppercase sm:text-base">
        Team-Logo
      </h2>
      <p className="mt-1.5 text-[12px] leading-5 text-muted">
        Nur für diesen Team-Datenbank-Eintrag. Ändert keine Vereins-, Bewerbungs- oder
        Turnierlogos.
      </p>

      <div className="mt-3 border-t border-line/70 pt-3">
        {localError ? (
          <p className="mb-3 rounded-lg border border-[#d9b0b0] bg-[#fff5f5] px-3 py-2 text-[13px] text-[#9a2b2b]">
            {localError}
          </p>
        ) : null}
        {localNotice ? (
          <p className="mb-3 rounded-lg border border-line bg-surface/50 px-3 py-2 text-[13px] text-ink">
            {localNotice}
          </p>
        ) : null}

        <div className="flex items-center gap-3.5 rounded-lg border border-line bg-surface/40 px-3 py-3">
          <div className="shrink-0 overflow-hidden rounded-lg border border-line bg-white">
            <ParticipantClubLogo logoUrl={displayPreview} clubName={clubName} size="lg" />
          </div>
          <div className="min-w-0 text-[13px] text-muted">
            <p className="font-medium text-ink">Aktuelle Vorschau</p>
            <p className="mt-1">PNG, JPEG oder WebP · max. 2 MB</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <form
            className="grid gap-3 rounded-lg border border-line bg-surface/30 p-3"
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
              <span className="text-[10px] font-semibold tracking-[0.08em] text-ink/50 uppercase">
                Datei auswählen
              </span>
              <input
                type="file"
                name="logoFile"
                accept="image/png,image/jpeg,image/webp"
                disabled={pending}
                required
                onChange={(event) => onFileSelected(event.target.files?.[0] ?? null)}
                className="block w-full min-w-0 text-[13px]"
              />
              {fileName ? <span className="text-[12px] text-muted">{fileName}</span> : null}
            </label>
            <button
              type="submit"
              disabled={pending || !fileName}
              className="inline-flex h-9 w-fit items-center rounded-md bg-brand-yellow px-3 text-[12px] font-semibold tracking-[0.06em] text-navy uppercase transition-colors hover:bg-[#ffe066] disabled:opacity-50"
            >
              {pending ? "Lade hoch…" : currentLogoUrl ? "Logo ersetzen" : "Logo hochladen"}
            </button>
          </form>

          <div className="grid gap-3 content-start rounded-lg border border-line bg-surface/30 p-3">
            <label className="grid gap-1 text-[13px] text-ink">
              <span className="text-[10px] font-semibold tracking-[0.08em] text-ink/50 uppercase">
                Oder Logo-URL
              </span>
              <input
                value={urlInput}
                onChange={(event) => setUrlInput(event.target.value)}
                className="h-10 min-w-0 rounded-lg border border-line bg-white px-3"
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
              className="inline-flex h-9 w-fit items-center rounded-md border border-line bg-white px-3 text-[12px] font-semibold tracking-[0.06em] text-ink uppercase transition-colors hover:bg-surface disabled:opacity-50"
            >
              URL speichern
            </button>
          </div>
        </div>

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
            className="mt-3 inline-flex h-9 items-center rounded-md border border-line bg-white px-3 text-[12px] font-semibold tracking-[0.06em] text-ink uppercase transition-colors hover:bg-surface disabled:opacity-50"
          >
            Logo entfernen
          </button>
        ) : null}
      </div>
    </div>
  );
}

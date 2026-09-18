"use client";

import { useEffect, useState, useTransition } from "react";
import { adminCardShellClass } from "@/components/admin/AdminPanel";
import {
  updatePartnerLogoAction,
  uploadPartnerLogoFormAction,
} from "@/lib/partners/actions";
import Image from "next/image";

type PartnerLogoEditorProps = {
  partnerId: string;
  partnerName: string;
  logoUrl: string | null;
  onDone: (result: {
    error: string | null;
    notice: string | null;
    logoUrl?: string | null;
  }) => void;
};

export function PartnerLogoEditor({
  partnerId,
  partnerName,
  logoUrl: savedLogoUrl,
  onDone,
}: PartnerLogoEditorProps) {
  const [pending, startTransition] = useTransition();
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

  function run(
    action: () => Promise<{
      error: string | null;
      notice: string | null;
      logoUrl?: string | null;
    }>,
  ) {
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
        if (result.logoUrl !== undefined) {
          setOptimisticLogoUrl(result.logoUrl);
        }
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
        Partner-Logo
      </h2>
      <p className="mt-1.5 text-[12px] leading-5 text-muted">
        PNG, JPEG oder WebP · max. 2 MB. Partner kann auch ohne Logo gespeichert werden.
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
          <div className="inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white p-1.5">
            {displayPreview ? (
              <Image
                src={displayPreview}
                alt={`${partnerName} Logo`}
                width={64}
                height={64}
                unoptimized
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
                {partnerName.trim().slice(0, 1) || "P"}
              </span>
            )}
          </div>
          <div className="min-w-0 text-[13px] text-muted">
            <p className="font-medium text-ink">Aktuelle Vorschau</p>
            <p className="mt-1">Seitenverhältnis bleibt erhalten (object-contain)</p>
          </div>
        </div>

        <form
          className="mt-4 grid gap-3 rounded-lg border border-line bg-surface/30 p-3"
          action={(formData) => {
            run(async () => {
              const result = await uploadPartnerLogoFormAction(formData);
              if (!result.error) {
                setFileName(null);
              }
              return {
                error: result.error,
                notice: result.error ? null : (result.notice ?? "Logo gespeichert."),
                logoUrl: result.logoUrl,
              };
            });
          }}
        >
          <input type="hidden" name="partnerId" value={partnerId} />
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

        {currentLogoUrl ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () =>
                updatePartnerLogoAction({
                  partnerId,
                  mode: "remove",
                }),
              )
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

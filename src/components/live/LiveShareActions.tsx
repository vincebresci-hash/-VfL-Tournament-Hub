"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/cn";

type LiveShareActionsProps = {
  url: string;
  title: string;
  className?: string;
};

export function LiveShareActions({ url, title, className }: LiveShareActionsProps) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const share = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title, url, text: title });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [title, url]);

  const openQr = useCallback(async () => {
    setQrOpen(true);
    setQrError(null);
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        margin: 2,
        width: 280,
        color: { dark: "#070b12", light: "#ffffff" },
        errorCorrectionLevel: "M",
      });
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl(null);
      setQrError("QR-Code konnte nicht erzeugt werden.");
    }
  }, [url]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (qrOpen && !dialog.open) {
      dialog.showModal();
      closeButtonRef.current?.focus();
    }
    if (!qrOpen && dialog.open) {
      dialog.close();
    }
  }, [qrOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const onClose = () => setQrOpen(false);
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <button
        type="button"
        onClick={() => void share()}
        className="inline-flex h-11 min-w-[7.5rem] items-center justify-center border border-line bg-white px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:border-navy/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
      >
        {copied ? "Link kopiert" : "Teilen"}
      </button>
      <button
        type="button"
        onClick={() => void openQr()}
        className="inline-flex h-11 min-w-[7.5rem] items-center justify-center border border-line bg-white px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:border-navy/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
      >
        QR-Code
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(100%,22rem)] border-0 bg-transparent p-4 backdrop:bg-navy/55"
        onCancel={() => setQrOpen(false)}
      >
        <div className="border border-line bg-white p-5 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={titleId} className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                Live QR-Code
              </h2>
              <p className="mt-1 text-[13px] text-muted">
                Am Sportplatz scannen – Spielplan &amp; Ergebnisse live.
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setQrOpen(false)}
              className="inline-flex h-11 w-11 items-center justify-center border border-line text-[13px] font-semibold text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
              aria-label="QR-Code schließen"
            >
              ✕
            </button>
          </div>

          <div className="mt-5 flex justify-center bg-white p-4">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt={`QR-Code für ${title}`}
                width={280}
                height={280}
                className="h-[280px] w-[280px] bg-white"
              />
            ) : (
              <p className="py-16 text-center text-[14px] text-muted">
                {qrError ?? "QR-Code wird erzeugt …"}
              </p>
            )}
          </div>
          <p className="mt-3 break-all text-center text-[12px] text-muted">{url}</p>
        </div>
      </dialog>
    </div>
  );
}

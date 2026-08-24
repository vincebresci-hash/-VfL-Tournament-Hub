"use client";

import { useState } from "react";

type MeinTurnierplanWidgetProps = {
  url: string;
  title: string;
  loadLabel: string;
  privacyHint?: string;
};

export function MeinTurnierplanWidget({
  url,
  title,
  loadLabel,
  privacyHint,
}: MeinTurnierplanWidgetProps) {
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    return (
      <div className="border border-line bg-white p-5 sm:p-6">
        <p className="text-[14px] leading-6 text-muted">
          {privacyHint ??
            "Der Live-Inhalt wird erst nach Ihrer Bestätigung direkt von MeinTurnierplan geladen."}
        </p>
        <button
          type="button"
          onClick={() => setLoaded(true)}
          className="mt-4 inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          {loadLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-line bg-white">
      <div className="relative aspect-[4/3] w-full min-h-[420px] sm:aspect-[16/10]">
        <iframe
          src={url}
          title={title}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    </div>
  );
}

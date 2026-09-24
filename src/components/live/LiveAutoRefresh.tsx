"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type LiveAutoRefreshProps = {
  /** When false, no polling (empty /live day). */
  enabled: boolean;
  /** Poll interval in ms. Default 30s – light traffic for spectators. */
  intervalMs?: number;
};

/**
 * Lightweight spectator refresh for Hub-native /live.
 * Uses Next.js router.refresh() against the force-dynamic page – no realtime
 * channel, no MTP, no writes.
 */
export function LiveAutoRefresh({
  enabled,
  intervalMs = 30_000,
}: LiveAutoRefreshProps) {
  const router = useRouter();
  const [manualPending, setManualPending] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const id = window.setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [enabled, intervalMs, router]);

  if (!enabled) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <p className="text-[12px] tracking-[0.04em] text-muted sm:text-[13px]">
        Aktualisiert ca. alle {Math.round(intervalMs / 1000)} Sek.
      </p>
      <button
        type="button"
        disabled={manualPending}
        onClick={() => {
          setManualPending(true);
          router.refresh();
          window.setTimeout(() => setManualPending(false), 800);
        }}
        className="inline-flex h-10 shrink-0 items-center border border-line bg-white px-3.5 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:border-navy/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow disabled:opacity-60"
      >
        {manualPending ? "Aktualisiere…" : "Jetzt aktualisieren"}
      </button>
    </div>
  );
}

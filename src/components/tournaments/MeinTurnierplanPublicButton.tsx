import {
  getMeinTurnierplanBadgeLabel,
  getMeinTurnierplanButtonLabel,
  getMeinTurnierplanPhase,
  isMeinTurnierplanPublic,
  meinTurnierplanAriaLabel,
} from "@/lib/mein-turnierplan";
import type { MeinTurnierplanFields } from "@/lib/mein-turnierplan";
import type { TournamentStatus } from "@/types/tournament";

type MeinTurnierplanPublicButtonProps = {
  tournamentName: string;
  tournamentDate: string;
  tournamentStatus: TournamentStatus;
  url: string;
  customLabel?: string | null;
};

export function MeinTurnierplanPublicButton({
  tournamentName,
  tournamentDate,
  tournamentStatus,
  url,
  customLabel,
}: MeinTurnierplanPublicButtonProps) {
  const schedule = {
    date: tournamentDate,
    status: tournamentStatus,
  };
  const label = getMeinTurnierplanButtonLabel({
    ...schedule,
    customLabel,
  });
  const phase = getMeinTurnierplanPhase(schedule);
  const isLive = phase === "live";

  return (
    <section
      className="mt-10 border border-navy bg-navy p-5 sm:p-6"
      aria-label="MeinTurnierplan"
    >
      <p className="text-[11px] font-semibold tracking-[0.12em] text-white/55 uppercase">
        Live-Spieltag
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={meinTurnierplanAriaLabel(tournamentName, label)}
        className={`mt-4 flex min-h-14 w-full items-center justify-center px-5 text-center text-[13px] font-semibold tracking-[0.08em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow sm:min-h-16 sm:text-[14px] ${
          isLive
            ? "bg-brand-yellow text-navy hover:bg-[#ffe066]"
            : "border border-white/25 bg-white text-navy hover:bg-white/90"
        }`}
      >
        <span>{label}</span>
        <span className="sr-only"> (öffnet in neuem Tab)</span>
      </a>
      <p className="mt-3 text-[13px] leading-6 text-white/65">
        Spielplan und Live-Ergebnisse werden über MeinTurnierplan bereitgestellt.
      </p>
    </section>
  );
}

export type MeinTurnierplanBadgeProps = MeinTurnierplanFields & {
  date: string;
  status: TournamentStatus;
};

export function MeinTurnierplanBadge({
  date,
  status,
  meinTurnierplanEnabled,
  meinTurnierplanUrl,
}: MeinTurnierplanBadgeProps) {
  if (
    !meinTurnierplanEnabled ||
    !meinTurnierplanUrl ||
    !isMeinTurnierplanPublic({ meinTurnierplanEnabled, meinTurnierplanUrl })
  ) {
    return null;
  }

  const badgeLabel = getMeinTurnierplanBadgeLabel({ date, status });
  const isLive = badgeLabel === "LIVE";

  return (
    <span
      className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase ${
        isLive ? "bg-brand-yellow text-navy" : "bg-navy text-white/78"
      }`}
    >
      {badgeLabel}
    </span>
  );
}

import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";
import type { LiveTeamRef } from "@/lib/db/live-queries";
import { LIVE_TYPO, type MatchCardVariant } from "@/lib/live/match-center";
import { formatBerlinClock } from "@/lib/schedule/datetime";
import { cn } from "@/lib/cn";
import type { TournamentMatchRecord } from "@/types/schedule";

export type LiveMatchCardProps = {
  match: TournamentMatchRecord;
  home: LiveTeamRef;
  away: LiveTeamRef;
  variant: MatchCardVariant;
  fieldLabel: string | null;
  groupOrRoundLabel: string | null;
  featured?: boolean;
};

function scoreText(match: TournamentMatchRecord, variant: MatchCardVariant) {
  if (match.homeScore == null || match.awayScore == null) {
    return variant === "next" ? "VS" : "–";
  }
  return `${match.homeScore} : ${match.awayScore}`;
}

function homeWon(match: TournamentMatchRecord) {
  if (match.homeScore == null || match.awayScore == null) {
    return false;
  }
  return match.homeScore > match.awayScore;
}

function awayWon(match: TournamentMatchRecord) {
  if (match.homeScore == null || match.awayScore == null) {
    return false;
  }
  return match.awayScore > match.homeScore;
}

export function LiveMatchCard({
  match,
  home,
  away,
  variant,
  fieldLabel,
  groupOrRoundLabel,
  featured = false,
}: LiveMatchCardProps) {
  const clock = formatBerlinClock(match.scheduledAt);
  const metaParts = [fieldLabel, groupOrRoundLabel].filter(Boolean);
  const score = scoreText(match, variant);
  const logoSize = featured ? "lg" : variant === "live" ? "md" : "sm";

  return (
    <article
      className={cn(
        "bg-white",
        featured ? "border-2 border-navy p-5 sm:p-7" : "border border-line p-4 sm:p-5",
        variant === "live" && !featured && "border-l-4 border-l-brand-yellow",
        variant === "completed" && "opacity-95",
      )}
      aria-label={`${home.label} gegen ${away.label}, Stand ${score}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={cn(LIVE_TYPO.meta, "min-w-0 text-ink/70")}>
          {variant === "live" ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className={cn(LIVE_TYPO.badge, "bg-brand-yellow text-navy")}>
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand-red" aria-hidden />
                LIVE
              </span>
              {metaParts.length > 0 ? (
                <span className="font-semibold tracking-[0.06em] text-ink uppercase">
                  {metaParts.join(" · ")}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              {clock ? (
                <span className="font-semibold tabular-nums tracking-[0.04em] text-ink">{clock}</span>
              ) : null}
              {metaParts.length > 0 ? <span>{metaParts.join(" · ")}</span> : null}
            </span>
          )}
        </div>
        {variant === "completed" ? (
          <span className={cn(LIVE_TYPO.badge, "bg-surface text-muted")}>Beendet</span>
        ) : null}
        {variant === "next" && !featured ? (
          <span className={cn(LIVE_TYPO.badge, "bg-surface text-ink")}>Als Nächstes</span>
        ) : null}
      </div>

      {/* Mobile stack – PROD-001 safe */}
      <div className="mt-4 flex flex-col gap-3 sm:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <ParticipantClubLogo logoUrl={home.logoUrl} clubName={home.clubName} size={logoSize} />
          <span
            className={cn(
              "min-w-0 flex-1 break-words font-medium text-ink",
              featured ? "text-base" : "text-[14px]",
              variant === "completed" && homeWon(match) && "font-semibold",
            )}
          >
            {home.label}
          </span>
        </div>
        <div
          className={cn(
            "text-center font-display font-bold tabular-nums text-ink",
            featured ? "text-4xl" : "text-2xl",
            variant === "live" && "text-navy",
          )}
        >
          {score}
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <ParticipantClubLogo logoUrl={away.logoUrl} clubName={away.clubName} size={logoSize} />
          <span
            className={cn(
              "min-w-0 flex-1 break-words font-medium text-ink",
              featured ? "text-base" : "text-[14px]",
              variant === "completed" && awayWon(match) && "font-semibold",
            )}
          >
            {away.label}
          </span>
        </div>
        {featured && clock ? <p className={cn(LIVE_TYPO.meta, "text-center")}>{clock}</p> : null}
      </div>

      {/* Compact desktop row */}
      {!featured ? (
        <div className="mt-4 hidden grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:grid">
          <div className="flex min-w-0 items-center gap-2.5 justify-self-start">
            <ParticipantClubLogo logoUrl={home.logoUrl} clubName={home.clubName} size={logoSize} />
            <span
              className={cn(
                "min-w-0 truncate text-[15px] font-medium text-ink",
                variant === "completed" && homeWon(match) && "font-semibold",
              )}
            >
              {home.label}
            </span>
          </div>
          <span
            className={cn(
              "font-display text-2xl font-bold tabular-nums text-ink",
              variant === "live" && "text-navy",
            )}
          >
            {score}
          </span>
          <div className="flex min-w-0 items-center gap-2.5 justify-self-end text-right">
            <span
              className={cn(
                "min-w-0 truncate text-[15px] font-medium text-ink",
                variant === "completed" && awayWon(match) && "font-semibold",
              )}
            >
              {away.label}
            </span>
            <ParticipantClubLogo logoUrl={away.logoUrl} clubName={away.clubName} size={logoSize} />
          </div>
        </div>
      ) : (
        <div className="mt-6 hidden grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6 sm:grid">
          <div className="flex min-w-0 flex-col items-center gap-3 text-center">
            <ParticipantClubLogo logoUrl={home.logoUrl} clubName={home.clubName} size={logoSize} />
            <span
              className={cn(
                "min-w-0 break-words text-lg font-semibold text-ink",
                variant === "completed" && homeWon(match) && "font-bold",
              )}
            >
              {home.label}
            </span>
          </div>
          <div className="px-2 font-display text-5xl font-bold tabular-nums text-navy lg:text-6xl">
            {score}
          </div>
          <div className="flex min-w-0 flex-col items-center gap-3 text-center">
            <ParticipantClubLogo logoUrl={away.logoUrl} clubName={away.clubName} size={logoSize} />
            <span
              className={cn(
                "min-w-0 break-words text-lg font-semibold text-ink",
                variant === "completed" && awayWon(match) && "font-bold",
              )}
            >
              {away.label}
            </span>
          </div>
        </div>
      )}
    </article>
  );
}

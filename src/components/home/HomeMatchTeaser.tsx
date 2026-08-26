import { LiveMatchCard } from "@/components/live/LiveMatchCard";
import {
  resolveLiveTeam,
  type LiveTeamRef,
} from "@/lib/db/live-queries";
import { LIVE_TYPO } from "@/lib/live/match-center";
import type { PrimaryMatchMoment } from "@/lib/live/match-center";

type HomeMatchTeaserProps = {
  moment: PrimaryMatchMoment;
  teamMap: Map<string, LiveTeamRef>;
  fieldLabel: string | null;
  groupOrRoundLabel: string | null;
};

export function HomeMatchTeaser({
  moment,
  teamMap,
  fieldLabel,
  groupOrRoundLabel,
}: HomeMatchTeaserProps) {
  if (moment.kind === "none" || !moment.match) {
    return null;
  }

  const match = moment.match;
  const heading =
    moment.kind === "live"
      ? fieldLabel
        ? `Jetzt auf ${fieldLabel}`
        : "Läuft gerade"
      : fieldLabel
        ? `Als Nächstes · ${fieldLabel}`
        : "Als Nächstes";

  return (
    <div className="border border-white/15 bg-white text-ink">
      <p
        className={`${LIVE_TYPO.meta} border-b border-line bg-surface px-3 py-2 font-semibold tracking-[0.08em] text-ink uppercase`}
      >
        {heading}
      </p>
      <div className="p-3 sm:p-4">
        <LiveMatchCard
          match={match}
          home={resolveLiveTeam(
            teamMap,
            match.homeApplicationId,
            match.homeExternalTeamId ?? null,
          )}
          away={resolveLiveTeam(
            teamMap,
            match.awayApplicationId,
            match.awayExternalTeamId ?? null,
          )}
          variant={moment.kind === "live" ? "live" : "next"}
          fieldLabel={null}
          groupOrRoundLabel={groupOrRoundLabel}
        />
      </div>
    </div>
  );
}

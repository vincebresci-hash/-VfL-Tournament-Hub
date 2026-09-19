import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";
import { hasDistinctTeamName, publicTeamLabel } from "@/lib/schedule/names";
import type { PublicRosterEntry } from "@/types/schedule";

type TournamentParticipantCardsProps = {
  roster: PublicRosterEntry[];
};

/**
 * V2-B2 presentational hub participant grid.
 * Receives already-resolved roster; no queries or source selection.
 */
export function TournamentParticipantCards({
  roster,
}: TournamentParticipantCardsProps) {
  if (roster.length === 0) {
    return null;
  }

  return (
    <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
      {roster.map((entry) => {
        const clubDisplay =
          entry.clubName.trim() ||
          publicTeamLabel(entry.clubName, entry.teamName);
        const showTeam = hasDistinctTeamName(entry.clubName, entry.teamName);
        const ageLabel = entry.ageGroup ?? "Altersklasse";
        const metaParts = [
          ageLabel,
          entry.birthYear ? `Jahrgang ${entry.birthYear}` : null,
          entry.groupName ? entry.groupName : null,
        ].filter(Boolean);

        return (
          <li
            key={entry.applicationId}
            className="rounded-[10px] border border-line bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(16,20,28,0.04)]"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line/80 bg-surface">
                <ParticipantClubLogo
                  logoUrl={entry.logoUrl}
                  clubName={entry.clubName}
                  size="md"
                  className="!h-9 !w-9 rounded-sm border-0"
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[15px] font-bold leading-snug tracking-wide text-ink uppercase sm:text-base">
                  {clubDisplay}
                </p>
                {showTeam ? (
                  <p className="mt-0.5 text-[13px] leading-snug text-ink/85">
                    {entry.teamName}
                  </p>
                ) : null}
                {metaParts.length > 0 ? (
                  <p className="mt-1.5 text-[12px] leading-5 text-muted">
                    {metaParts.join(" · ")}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

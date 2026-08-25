import Link from "next/link";
import {
  getEffectiveTournamentStatus,
  getSuggestedTournamentStatusFromCapacity,
  getTournamentStatusCapacityWarning,
  tournamentStatusLabel,
} from "@/lib/tournament-status";
import type { TournamentStatus } from "@/types/tournament";

type TournamentStatusCapacityNoticeProps = {
  dbStatus: TournamentStatus;
  maxTeams: number | null | undefined;
  confirmedParticipants: number;
  editHref?: string | null;
  className?: string;
};

export function TournamentStatusCapacityNotice({
  dbStatus,
  maxTeams,
  confirmedParticipants,
  editHref,
  className,
}: TournamentStatusCapacityNoticeProps) {
  const warning = getTournamentStatusCapacityWarning({
    dbStatus,
    maxTeams,
    confirmedParticipants,
  });

  if (!warning) {
    return null;
  }

  const suggested = getSuggestedTournamentStatusFromCapacity({
    dbStatus,
    maxTeams,
    confirmedParticipants,
  });
  const effective = getEffectiveTournamentStatus({
    dbStatus,
    maxTeams,
    confirmedParticipants,
  });

  return (
    <div
      className={
        className ??
        "border border-[#d9b0b0] bg-[#fff5f5] px-4 py-3 text-[13px] leading-6 text-[#9a2b2b]"
      }
    >
      <p>{warning}</p>
      <p className="mt-1 text-[#7a3030]">
        Öffentlich angezeigt: {tournamentStatusLabel[effective]}. Vorschlag: Status auf „
        {tournamentStatusLabel[suggested]}“ setzen.
      </p>
      {editHref ? (
        <p className="mt-2">
          <Link
            href={editHref}
            className="font-semibold tracking-[0.06em] uppercase underline underline-offset-2"
          >
            Status an Belegung anpassen
          </Link>
        </p>
      ) : null}
    </div>
  );
}

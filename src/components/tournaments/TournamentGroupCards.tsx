import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";
import { publicTeamLabel } from "@/lib/schedule/names";
import type { PublicRosterEntry } from "@/types/schedule";

export type TournamentGroupCardHub = {
  id: string;
  name: string;
  members: PublicRosterEntry[];
};

export type TournamentGroupCardMtp = {
  id: string;
  name: string;
  teams: Array<{
    id: string;
    name: string;
    logoUrl?: string | null;
  }>;
};

type TournamentGroupCardsProps =
  | { source: "hub"; groups: TournamentGroupCardHub[] }
  | { source: "mtp"; groups: TournamentGroupCardMtp[] };

/**
 * V2-C1 presentational Gruppen cards.
 * Receives already-resolved groups/members; no queries, sorting, or source selection.
 */
export function TournamentGroupCards(props: TournamentGroupCardsProps) {
  const { groups, source } = props;
  const groupCount = groups.length;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase">
          Gruppen
        </h2>
        {groupCount > 0 ? (
          <p className="text-[13px] font-medium tracking-wide text-muted">
            {groupCount} {groupCount === 1 ? "Gruppe" : "Gruppen"}
          </p>
        ) : null}
      </div>

      {groupCount === 0 ? null : (
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3.5">
          {source === "hub"
            ? groups.map((group) => (
                <li key={group.id}>
                  <HubGroupCard group={group} />
                </li>
              ))
            : groups.map((group) => (
                <li key={group.id}>
                  <MtpGroupCard group={group} />
                </li>
              ))}
        </ul>
      )}
    </div>
  );
}

function HubGroupCard({ group }: { group: TournamentGroupCardHub }) {
  const teamCount = group.members.length;

  return (
    <article className="h-full rounded-[10px] border border-line bg-white px-3.5 py-3.5 shadow-[0_1px_2px_rgba(16,20,28,0.04)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line/80 pb-2.5">
        <h3 className="font-display text-[15px] font-bold tracking-wide text-ink uppercase sm:text-base">
          {group.name}
        </h3>
        <p className="text-[12px] font-medium tracking-wide text-muted">
          {teamCount} {teamCount === 1 ? "Team" : "Teams"}
        </p>
      </div>

      {teamCount === 0 ? (
        <p className="mt-3 text-[14px] text-muted">Noch keine Teams zugeordnet.</p>
      ) : (
        <ul className="mt-3 grid gap-2.5">
          {group.members.map((entry) => (
            <li key={entry.applicationId} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line/80 bg-surface">
                <ParticipantClubLogo
                  logoUrl={entry.logoUrl}
                  clubName={entry.clubName}
                  size="sm"
                  className="!h-7 !w-7 rounded-sm border-0"
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-snug font-medium text-ink">
                  {publicTeamLabel(entry.clubName, entry.teamName)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function MtpGroupCard({ group }: { group: TournamentGroupCardMtp }) {
  const teamCount = group.teams.length;

  return (
    <article className="h-full rounded-[10px] border border-line bg-white px-3.5 py-3.5 shadow-[0_1px_2px_rgba(16,20,28,0.04)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line/80 pb-2.5">
        <h3 className="font-display text-[15px] font-bold tracking-wide text-ink uppercase sm:text-base">
          {group.name}
        </h3>
        <p className="text-[12px] font-medium tracking-wide text-muted">
          {teamCount} {teamCount === 1 ? "Team" : "Teams"}
        </p>
      </div>

      {teamCount === 0 ? (
        <p className="mt-3 text-[14px] text-muted">Noch keine Teams zugeordnet.</p>
      ) : (
        <ul className="mt-3 grid gap-2.5">
          {group.teams.map((team) => (
            <li key={team.id} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line/80 bg-surface">
                <ParticipantClubLogo
                  logoUrl={team.logoUrl}
                  clubName={team.name}
                  size="sm"
                  className="!h-7 !w-7 rounded-sm border-0"
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-snug font-medium text-ink">
                  {team.name}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

import Link from "next/link";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { ClubStatusBadge } from "@/components/club/ClubStatusBadge";
import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";
import { getClubDashboardStats, type ClubWorkspace } from "@/lib/club/workspace";
import { formatDateDe } from "@/lib/format";
import { AGE_GROUPS } from "@/types/tournament";
import type { Team } from "@/types/auth";

type ClubDashboardProps = {
  workspace: ClubWorkspace;
};

function sortClubTeams(teams: Team[]) {
  return [...teams].sort((a, b) => {
    const ageA = AGE_GROUPS.indexOf(a.ageGroup);
    const ageB = AGE_GROUPS.indexOf(b.ageGroup);
    const rankA = ageA < 0 ? AGE_GROUPS.length : ageA;
    const rankB = ageB < 0 ? AGE_GROUPS.length : ageB;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return a.name.localeCompare(b.name, "de");
  });
}

export async function ClubDashboard({ workspace }: ClubDashboardProps) {
  const stats = await getClubDashboardStats(workspace);
  const teams = sortClubTeams(workspace.teams);

  return (
    <div>
      <div className="flex flex-wrap items-start gap-4">
        <ParticipantClubLogo
          logoUrl={workspace.club.logo}
          clubName={workspace.club.name}
          size="lg"
        />
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
            Übersicht
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            {workspace.club.name}
            {workspace.club.city.trim() ? ` · ${workspace.club.city}` : ""}
          </p>
        </div>
      </div>

      {workspace.roleKeys.length === 0 ? (
        <p className="mt-6 border border-line bg-white px-5 py-6 text-[15px] text-muted">
          Dein Konto wurde erstellt, aber dir wurde noch keine Rolle zugewiesen. Bitte wende
          dich an einen Administrator.
        </p>
      ) : null}

      {workspace.roleKeys.includes("TEAM_MANAGER") &&
      workspace.assignedTeamIds.length === 0 ? (
        <p className="mt-6 border border-line bg-white px-5 py-6 text-[15px] text-muted">
          Dir ist aktuell noch keine Mannschaft zugewiesen.
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard value={stats.activeApplications} label="Aktive Bewerbungen" />
        <AdminStatCard value={stats.accepted} label="Zusage" />
        <AdminStatCard value={stats.waitingList} label="Warteliste" />
        <AdminStatCard
          value={stats.availableTournaments}
          label="Verfügbare Turniere"
        />
      </div>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
            Meine Teams
          </h2>
          <Link
            href="/verein/teams"
            className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
          >
            Alle Teams →
          </Link>
        </div>

        <div className="mt-4 overflow-hidden border border-line bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-line bg-surface/60 px-4 py-3 sm:px-5">
            <ParticipantClubLogo
              logoUrl={workspace.club.logo}
              clubName={workspace.club.name}
              size="sm"
            />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-ink">
                {workspace.club.name}
              </p>
              {workspace.club.city.trim() ? (
                <p className="truncate text-[12px] text-muted">{workspace.club.city}</p>
              ) : null}
            </div>
          </div>

          {teams.length === 0 ? (
            <p className="px-4 py-6 text-[15px] text-muted sm:px-5">
              Noch keine Teams vorhanden.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {teams.map((team) => (
                <li key={team.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                  <ParticipantClubLogo
                    logoUrl={workspace.club.logo}
                    clubName={workspace.club.name}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-[15px] font-bold tracking-wide text-ink uppercase">
                        {team.name}
                      </p>
                      <span className="inline-flex items-center border border-navy/15 bg-navy/5 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-navy uppercase">
                        {team.ageGroup}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-muted">
                      Jahrgang {team.birthYear}
                      {team.league.trim() ? ` · ${team.league}` : ""}
                      {team.division?.trim() ? ` · ${team.division}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
            Meine aktuellen Bewerbungen
          </h2>
          <Link
            href="/verein/bewerbungen"
            className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
          >
            Alle ansehen →
          </Link>
        </div>

        <div className="mt-4 grid gap-3">
          {workspace.applications.length === 0 ? (
            <p className="border border-line bg-white px-5 py-8 text-[15px] text-muted">
              Noch keine Bewerbungen vorhanden.
            </p>
          ) : null}
          {workspace.applications.map((application) => (
            <Link
              key={application.id}
              href={`/verein/bewerbungen/${application.id}`}
              className="border border-line bg-white p-5 transition-colors hover:border-navy/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <ParticipantClubLogo
                    logoUrl={workspace.club.logo}
                    clubName={workspace.club.name}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                      {application.tournamentName}
                    </p>
                    <p className="mt-1 text-[13px] text-muted">
                      {application.teamName} · {formatDateDe(application.tournamentDate)}
                    </p>
                  </div>
                </div>
                <ClubStatusBadge status={application.applicationStatus} />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

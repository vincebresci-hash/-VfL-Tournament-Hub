import Link from "next/link";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { ClubStatusBadge } from "@/components/club/ClubStatusBadge";
import { getClubDashboardStats, type ClubWorkspace } from "@/lib/club/workspace";
import { formatDateDe } from "@/lib/format";

type ClubDashboardProps = {
  workspace: ClubWorkspace;
};

export function ClubDashboard({ workspace }: ClubDashboardProps) {
  const stats = getClubDashboardStats(workspace);

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        Übersicht
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        {workspace.club.name} · {workspace.club.city}
      </p>

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
                <div>
                  <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                    {application.tournamentName}
                  </p>
                  <p className="mt-1 text-[13px] text-muted">
                    {application.teamName} · {formatDateDe(application.tournamentDate)}
                  </p>
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

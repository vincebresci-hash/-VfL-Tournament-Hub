import Link from "next/link";
import { ApplicationStatusBadge } from "@/components/admin/ApplicationStatusBadge";
import { AdminCard, AdminInfo, displayValue } from "@/components/admin/AdminPanel";
import { formatDateDe } from "@/lib/format";
import type { AdminTeamDetail } from "@/types/admin";

type AdminTeamDetailViewProps = {
  team: AdminTeamDetail;
};

export function AdminTeamDetailView({ team }: AdminTeamDetailViewProps) {
  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin/teams"
        className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
      >
        ← Alle Teams
      </Link>

      <div className="mt-6">
        <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
          {team.name}
        </h1>
        <p className="mt-2 text-[15px] text-muted">{team.clubName}</p>
      </div>

      <div className="mt-8 grid gap-5">
        <AdminCard title="Stammdaten">
          <dl className="grid gap-4 sm:grid-cols-2">
            <AdminInfo label="Teamname" value={team.name} />
            <AdminInfo label="Verein" value={team.clubName} />
            <AdminInfo label="Altersklasse" value={displayValue(team.ageGroup)} />
            <AdminInfo label="Jahrgang" value={displayValue(team.birthYear)} />
            <AdminInfo label="Trainer / Ansprechpartner" value={displayValue(team.trainerName)} />
            <AdminInfo label="Liga" value={displayValue(team.league)} />
            <AdminInfo label="Spielklasse" value={displayValue(team.division)} />
            <AdminInfo label="Bewerbungen" value={String(team.applicationCount)} />
            <AdminInfo
              label="Erstellt"
              value={formatDateDe(team.createdAt.slice(0, 10))}
            />
          </dl>
          <Link
            href={`/admin/vereine/${team.clubId}`}
            className="mt-5 inline-flex text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
          >
            Zum Verein →
          </Link>
        </AdminCard>

        <AdminCard title="Bewerbungen">
          {team.applications.length === 0 ? (
            <p className="text-[14px] text-muted">Noch keine Bewerbungen für dieses Team.</p>
          ) : (
            <div className="grid gap-3">
              {team.applications.map((application) => (
                <div
                  key={application.id}
                  className="flex flex-wrap items-center justify-between gap-3 border border-line px-4 py-3"
                >
                  <div>
                    <p className="text-[14px] font-medium text-ink">
                      {application.tournamentName}
                    </p>
                    <p className="mt-1 text-[13px] text-muted">
                      {formatDateDe(application.createdAt.slice(0, 10))}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <ApplicationStatusBadge status={application.status} />
                    <Link
                      href={`/admin/bewerbungen/${application.id}`}
                      className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
                    >
                      Ansehen
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminCard>
      </div>
    </div>
  );
}

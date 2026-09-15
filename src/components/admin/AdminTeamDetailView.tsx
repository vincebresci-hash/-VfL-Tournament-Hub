import Link from "next/link";
import { ApplicationStatusBadge } from "@/components/admin/ApplicationStatusBadge";
import {
  AdminCard,
  AdminInfo,
  adminIdentityHeroClass,
  adminMobileCardClass,
  adminTextLinkClass,
  displayValue,
} from "@/components/admin/AdminPanel";
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
        className={`${adminTextLinkClass} text-muted hover:text-brand-blue`}
      >
        ← Alle Teams
      </Link>

      <div className={`mt-4 ${adminIdentityHeroClass}`}>
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold tracking-wide text-ink uppercase sm:text-3xl">
            {team.name}
          </h1>
          <p className="mt-1 truncate text-[15px] text-muted">{team.clubName}</p>
          <p className="mt-2 text-[13px] text-muted">
            {displayValue(team.ageGroup)}
            {team.birthYear ? ` · Jahrgang ${team.birthYear}` : ""}
            {` · ${team.applicationCount} Bewerbungen`}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <AdminCard title="Stammdaten">
          <dl className="grid gap-x-5 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
            <AdminInfo label="Teamname" value={team.name} />
            <AdminInfo label="Verein" value={team.clubName} />
            <AdminInfo label="Altersklasse" value={displayValue(team.ageGroup)} />
            <AdminInfo label="Jahrgang" value={displayValue(team.birthYear)} />
            <AdminInfo
              label="Trainer / Ansprechpartner"
              value={displayValue(team.trainerName)}
            />
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
            className={`mt-5 ${adminTextLinkClass} text-muted hover:text-brand-blue`}
          >
            Zum Verein →
          </Link>
        </AdminCard>

        <AdminCard title="Bewerbungen">
          {team.applications.length === 0 ? (
            <p className="text-[14px] text-muted">
              Noch keine Bewerbungen für dieses Team.
            </p>
          ) : (
            <div className="grid gap-3">
              {team.applications.map((application) => (
                <div
                  key={application.id}
                  className={`${adminMobileCardClass} flex flex-wrap items-center justify-between gap-3`}
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
                      className={`${adminTextLinkClass} text-muted hover:text-brand-blue`}
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

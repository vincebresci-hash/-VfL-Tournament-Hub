import Link from "next/link";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { ApplicationStatusBadge } from "@/components/admin/ApplicationStatusBadge";
import { AdminEmpty, AdminNotice } from "@/components/admin/AdminPanel";
import { formatDateDe } from "@/lib/format";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import type { AdminDashboardData } from "@/types/admin";

type AdminDashboardProps = {
  data: AdminDashboardData;
};

export function AdminDashboard({ data }: AdminDashboardProps) {
  const { stats, tournaments, latestApplications, showNewApplications, ready } = data;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        Dashboard
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        Übersicht über Turniere, Vereine und Bewerbungen
      </p>

      {!ready ? (
        <AdminNotice>
          Die Admin-Kennzahlen stehen bereit, sobald die Datenbank erreichbar ist.
        </AdminNotice>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <AdminStatCard value={stats.newApplications} label="Neue Bewerbungen" />
        <AdminStatCard value={stats.underReview} label="In Prüfung" />
        <AdminStatCard value={stats.confirmedTeams} label="Bestätigte Teams" />
        <AdminStatCard value={stats.activeTournaments} label="Aktive Turniere" />
        <AdminStatCard value={stats.registeredClubs} label="Registrierte Vereine" />
        <AdminStatCard value={stats.registeredTeams} label="Registrierte Teams" />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section>
          <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
            Aktuelle Turniere
          </h2>
          <div className="mt-4 grid gap-3">
            {tournaments.length === 0 ? (
              <AdminEmpty>Keine aktuellen Turniere in der Datenbank.</AdminEmpty>
            ) : (
              tournaments.map((tournament) => (
                <article key={tournament.id} className="border border-line bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                        {tournament.name}
                      </p>
                      <p className="mt-1 text-[13px] text-muted">
                        {formatDateDe(tournament.date)} · {tournament.ageGroup}
                      </p>
                    </div>
                    <StatusBadge status={tournament.status} />
                  </div>
                  <p className="mt-4 text-[14px] text-ink">
                    {tournament.confirmedTeams}
                    {tournament.maxTeams ? ` / ${tournament.maxTeams}` : ""} Teams bestätigt
                  </p>
                  <p className="mt-1 text-[13px] text-muted">
                    {tournament.applicationsCount} Bewerbungen
                  </p>
                </article>
              ))
            )}
          </div>
        </section>

        {showNewApplications ? (
          <section>
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
                Neue Bewerbungen
              </h2>
              <Link
                href="/admin/bewerbungen"
                className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
              >
                Alle →
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              {latestApplications.length === 0 ? (
                <AdminEmpty>Noch keine Bewerbungen eingegangen.</AdminEmpty>
              ) : (
                latestApplications.map((application) => (
                  <article key={application.id} className="border border-line bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">{application.clubName}</p>
                        <p className="mt-1 text-[13px] text-muted">
                          {application.ageGroup}
                          {application.selfRatedStrength
                            ? ` · Spielstärke ${application.selfRatedStrength}/5`
                            : ""}
                        </p>
                      </div>
                      <ApplicationStatusBadge status={application.status} />
                    </div>
                    <Link
                      href={`/admin/bewerbungen/${application.id}`}
                      className="mt-3 inline-flex text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
                    >
                      Ansehen
                    </Link>
                  </article>
                ))
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

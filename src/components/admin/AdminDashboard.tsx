import Link from "next/link";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { ApplicationStatusBadge } from "@/components/admin/ApplicationStatusBadge";
import { AdminEmpty, AdminNotice } from "@/components/admin/AdminPanel";
import { formatDateDe } from "@/lib/format";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import type { AdminDashboardData } from "@/types/admin";
import type { Permission } from "@/types/rbac";

type AdminDashboardProps = {
  data: AdminDashboardData;
  permissions: Permission[];
  isSuperAdmin: boolean;
};

type DashboardLink = {
  href: string;
  label: string;
  description: string;
  required: Permission[];
};

const DASHBOARD_LINKS: DashboardLink[] = [
  {
    href: "/admin/bewerbungen",
    label: "Bewerbungen",
    description: "Neue und laufende Bewerbungen verwalten.",
    required: ["applications.view"],
  },
  {
    href: "/admin/zahlungen",
    label: "Zahlungen",
    description: "Zahlungsstatus für angenommene Bewerbungen.",
    required: ["payments.view", "payments.manage"],
  },
  {
    href: "/admin/absagen",
    label: "Absagen",
    description: "Absageanfragen bearbeiten.",
    required: ["cancellations.view"],
  },
  {
    href: "/admin/turniere",
    label: "Turniere",
    description: "Turniere, Spielpläne und Ergebnisse.",
    required: ["tournaments.view"],
  },
  {
    href: "/admin/kommunikation",
    label: "Kommunikation",
    description: "Mitteilungen und E-Mail-Versand.",
    required: ["communications.view"],
  },
  {
    href: "/admin/news",
    label: "News",
    description: "Newsbeiträge verwalten.",
    required: ["news.view"],
  },
  {
    href: "/admin/benutzer",
    label: "Benutzer",
    description: "Benutzer, Einladungen und Rollen.",
    required: ["users.view"],
  },
  {
    href: "/admin/rollen",
    label: "Rollen",
    description: "Rollen und Berechtigungen einsehen.",
    required: ["roles.manage"],
  },
];

function canSeeLink(permissions: Set<Permission>, isSuperAdmin: boolean, link: DashboardLink) {
  if (isSuperAdmin) {
    return true;
  }
  return link.required.some((permission) => permissions.has(permission));
}

export function AdminDashboard({ data, permissions, isSuperAdmin }: AdminDashboardProps) {
  const { stats, tournaments, latestApplications, showNewApplications, ready } = data;
  const permissionSet = new Set(permissions);
  const visibleLinks = DASHBOARD_LINKS.filter((link) =>
    canSeeLink(permissionSet, isSuperAdmin, link),
  );
  const showApplications =
    isSuperAdmin ||
    permissionSet.has("applications.view") ||
    permissionSet.has("applications.manage");
  const showTournaments =
    isSuperAdmin || permissionSet.has("tournaments.view") || permissionSet.has("tournaments.manage");
  const showStats = showApplications || showTournaments || isSuperAdmin;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        Dashboard
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        Übersicht über die für dich freigeschalteten Bereiche
      </p>

      {!ready ? (
        <AdminNotice>
          Die Admin-Kennzahlen stehen bereit, sobald die Datenbank erreichbar ist.
        </AdminNotice>
      ) : null}

      {visibleLinks.length > 0 ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="border border-line bg-white p-5 transition-colors hover:border-navy/20"
            >
              <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                {link.label}
              </p>
              <p className="mt-2 text-[14px] text-muted">{link.description}</p>
            </Link>
          ))}
        </div>
      ) : (
        <AdminNotice>
          Deinem Konto wurde noch keine Rolle zugewiesen. Bitte wende dich an einen
          Administrator.
        </AdminNotice>
      )}

      {showStats && ready ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {showApplications ? (
            <>
              <AdminStatCard value={stats.newApplications} label="Neue Bewerbungen" />
              <AdminStatCard value={stats.confirmedTeams} label="Bestätigte Teilnehmer" />
              <AdminStatCard value={stats.waitlistCount} label="Wartelistenplätze" />
              <AdminStatCard value={stats.underReview} label="In Prüfung" />
            </>
          ) : null}
          {showTournaments ? (
            <>
              <AdminStatCard value={stats.activeTournaments} label="Aktive Turniere" />
              <AdminStatCard value={stats.availableSlots} label="Freie Turnierplätze" />
            </>
          ) : null}
          {isSuperAdmin ? (
            <>
              <AdminStatCard value={stats.registeredClubs} label="Registrierte Vereine" />
              <AdminStatCard value={stats.registeredTeams} label="Registrierte Teams" />
            </>
          ) : null}
        </div>
      ) : null}

      {showTournaments ? (
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
                      {tournament.maxTeams ? ` / ${tournament.maxTeams}` : ""} bestätigt
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {(isSuperAdmin || permissionSet.has("tournaments.manage")) && (
                        <Link
                          href={`/admin/turniere/${tournament.id}/bearbeiten`}
                          className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
                        >
                          Bearbeiten
                        </Link>
                      )}
                      {showApplications ? (
                        <Link
                          href={`/admin/bewerbungen?turnier=${tournament.slug}`}
                          className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
                        >
                          Bewerbungen
                        </Link>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          {showNewApplications && showApplications ? (
            <section>
              <div className="flex items-end justify-between gap-3">
                <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
                  Neue Bewerbungen
                </h2>
                <Link
                  href="/admin/bewerbungen"
                  className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
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
                        className="mt-3 inline-flex text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
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
      ) : null}
    </div>
  );
}

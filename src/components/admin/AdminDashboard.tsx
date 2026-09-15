import Link from "next/link";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { ApplicationStatusBadge } from "@/components/admin/ApplicationStatusBadge";
import {
  AdminEmpty,
  AdminNotice,
  AdminPageHeader,
  adminCardShellClass,
  adminCompactSecondaryButtonClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminSectionTitleClass,
  adminTextLinkClass,
} from "@/components/admin/AdminPanel";
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

type QuickAction = {
  href: string;
  label: string;
  allowed: boolean;
  primary?: boolean;
};

type OpenTask = {
  key: string;
  title: string;
  count: number;
  context: string;
  href: string;
  actionLabel: string;
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
    href: "/admin/team-datenbank",
    label: "Team-Datenbank",
    description: "Gespeicherte Teams für spätere Einladungen.",
    required: ["teams.view"],
  },
  {
    href: "/admin/turniere",
    label: "Turniere",
    description: "Turniere, Spielpläne und Ergebnisse.",
    required: ["tournaments.view"],
  },
  {
    href: "/admin/kommunikation",
    label: "Nachrichten",
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

function hasAnyPermission(
  permissions: Set<Permission>,
  isSuperAdmin: boolean,
  required: Permission[],
) {
  if (isSuperAdmin) {
    return true;
  }
  return required.some((permission) => permissions.has(permission));
}

export function AdminDashboard({ data, permissions, isSuperAdmin }: AdminDashboardProps) {
  const { stats, tournaments, latestApplications, showNewApplications, ready } = data;
  const permissionSet = new Set(permissions);
  const visibleLinks = DASHBOARD_LINKS.filter((link) =>
    canSeeLink(permissionSet, isSuperAdmin, link),
  );
  const showApplications = hasAnyPermission(permissionSet, isSuperAdmin, [
    "applications.view",
    "applications.manage",
  ]);
  const showTournaments = hasAnyPermission(permissionSet, isSuperAdmin, [
    "tournaments.view",
    "tournaments.manage",
  ]);
  const canManageTournaments = hasAnyPermission(permissionSet, isSuperAdmin, [
    "tournaments.manage",
  ]);
  const showStats = showApplications || showTournaments || isSuperAdmin;

  const openTasks: OpenTask[] = [];
  if (showApplications) {
    if (stats.newApplications > 0) {
      openTasks.push({
        key: "new-applications",
        title: "Neue Bewerbungen",
        count: stats.newApplications,
        context: "Neue Bewerbungen warten auf Prüfung.",
        href: "/admin/bewerbungen",
        actionLabel: "Prüfen",
      });
    }
    if (stats.underReview > 0) {
      openTasks.push({
        key: "under-review",
        title: "In Prüfung",
        count: stats.underReview,
        context: "Bewerbungen in Prüfung brauchen eine Entscheidung.",
        href: "/admin/bewerbungen",
        actionLabel: "Bearbeiten",
      });
    }
    if (stats.waitlistCount > 0) {
      openTasks.push({
        key: "waitlist",
        title: "Warteliste",
        count: stats.waitlistCount,
        context: "Teams auf der Warteliste im Blick behalten.",
        href: "/admin/bewerbungen",
        actionLabel: "Ansehen",
      });
    }
  }

  const quickActions: QuickAction[] = [
    {
      href: "/admin/turniere/neu",
      label: "Neues Turnier",
      allowed: canManageTournaments,
      primary: true,
    },
    {
      href: "/admin/bewerbungen",
      label: "Bewerbungen prüfen",
      allowed: showApplications,
    },
    {
      href: "/admin/kommunikation/neu",
      label: "Nachricht senden",
      allowed: hasAnyPermission(permissionSet, isSuperAdmin, ["communications.view"]),
    },
    {
      href: "/admin/turniere",
      label: "Turniere öffnen",
      allowed: showTournaments,
    },
  ].filter((action) => action.allowed);

  return (
    <div>
      <AdminPageHeader
        title="Admin"
        description="Offene Aufgaben, aktuelle Turniere und wichtige Bereiche auf einen Blick."
      />

      {!ready ? (
        <AdminNotice>
          Die Admin-Kennzahlen stehen bereit, sobald die Datenbank erreichbar ist.
        </AdminNotice>
      ) : null}

      {visibleLinks.length === 0 ? (
        <AdminNotice>
          Deinem Konto wurde noch keine Rolle zugewiesen. Bitte wende dich an einen
          Administrator.
        </AdminNotice>
      ) : null}

      {showApplications ? (
        <section className="mt-8">
          <h2 className={adminSectionTitleClass}>Offene Aufgaben</h2>
          <p className="mt-1 text-[14px] text-muted">
            Was jetzt Aufmerksamkeit braucht — basierend auf bestehenden Kennzahlen.
          </p>
          {openTasks.length === 0 ? (
            <div className="mt-4">
              <AdminEmpty>Aktuell keine offenen Bewerbungsaufgaben.</AdminEmpty>
            </div>
          ) : (
            <div className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {openTasks.map((task) => (
                <article
                  key={task.key}
                  className={`${adminCardShellClass} flex flex-col border-l-4 border-l-brand-yellow p-4 sm:p-5`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-display text-[15px] font-bold tracking-wide text-ink uppercase sm:text-lg">
                      {task.title}
                    </p>
                    <p className="font-display text-3xl font-bold tracking-wide text-navy">
                      {task.count}
                    </p>
                  </div>
                  <p className="mt-2 flex-1 text-[14px] leading-6 text-muted">{task.context}</p>
                  <Link href={task.href} className={`${adminPrimaryButtonClass} mt-4 w-full sm:w-auto`}>
                    {task.actionLabel}
                  </Link>
                </article>
              ))}
            </div>
          )}

          {showNewApplications ? (
            <div className="mt-6">
              <div className="flex items-end justify-between gap-3">
                <h3 className="font-display text-[13px] font-bold tracking-[0.04em] text-ink uppercase sm:text-[15px]">
                  Neueste Bewerbungen
                </h3>
                <Link href="/admin/bewerbungen" className={adminTextLinkClass}>
                  Alle →
                </Link>
              </div>
              <div className="mt-3 grid gap-2">
                {latestApplications.length === 0 ? (
                  <AdminEmpty>Noch keine Bewerbungen eingegangen.</AdminEmpty>
                ) : (
                  latestApplications.map((application) => (
                    <article
                      key={application.id}
                      className={`${adminCardShellClass} flex flex-wrap items-center justify-between gap-3 px-4 py-3`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{application.clubName}</p>
                        <p className="mt-0.5 text-[13px] text-muted">
                          {application.ageGroup}
                          {application.selfRatedStrength
                            ? ` · Spielstärke ${application.selfRatedStrength}/5`
                            : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ApplicationStatusBadge status={application.status} />
                        <Link
                          href={`/admin/bewerbungen/${application.id}`}
                          className={adminCompactSecondaryButtonClass}
                        >
                          Ansehen
                        </Link>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {quickActions.length > 0 ? (
        <section className={`mt-8 ${adminCardShellClass} p-4 sm:p-5`}>
          <h2 className={adminSectionTitleClass}>Schnellaktionen</h2>
          <p className="mt-1 text-[14px] text-muted">Häufige nächste Schritte.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={action.primary ? adminPrimaryButtonClass : adminSecondaryButtonClass}
              >
                {action.label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {showTournaments ? (
        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className={adminSectionTitleClass}>Aktive Turniere</h2>
              <p className="mt-1 text-[14px] text-muted">
                Relevante Turniere mit Status und Kapazität.
              </p>
            </div>
            <Link href="/admin/turniere" className={adminTextLinkClass}>
              Alle Turniere →
            </Link>
          </div>
          <div className="mt-4 grid gap-2.5">
            {tournaments.length === 0 ? (
              <AdminEmpty>Keine aktuellen Turniere in der Datenbank.</AdminEmpty>
            ) : (
              tournaments.map((tournament) => (
                <article
                  key={tournament.id}
                  className={`${adminCardShellClass} flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start gap-2 sm:items-center sm:gap-3">
                      <p className="truncate font-display text-[15px] font-bold tracking-wide text-ink uppercase sm:text-lg">
                        {tournament.name}
                      </p>
                      <StatusBadge status={tournament.status} />
                    </div>
                    <p className="mt-1 text-[13px] text-muted">
                      {formatDateDe(tournament.date)}
                      {tournament.ageGroup ? ` · ${tournament.ageGroup}` : ""}
                    </p>
                    <p className="mt-2 text-[14px] text-ink">
                      {tournament.confirmedTeams}
                      {tournament.maxTeams ? ` / ${tournament.maxTeams}` : ""} bestätigt
                      {Number.isFinite(tournament.availableSlots)
                        ? ` · ${tournament.availableSlots} frei`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Link
                      href={`/admin/turniere/${tournament.id}`}
                      className={adminPrimaryButtonClass}
                    >
                      Öffnen
                    </Link>
                    {canManageTournaments ? (
                      <Link
                        href={`/admin/turniere/${tournament.id}/bearbeiten`}
                        className={adminTextLinkClass}
                      >
                        Bearbeiten
                      </Link>
                    ) : null}
                    {showApplications ? (
                      <Link
                        href={`/admin/bewerbungen?turnier=${tournament.slug}`}
                        className={adminTextLinkClass}
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
      ) : null}

      {showStats && ready ? (
        <section className="mt-8">
          <h2 className={adminSectionTitleClass}>Statistik</h2>
          <p className="mt-1 text-[13px] text-muted">Kennzahlen im Überblick.</p>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {showApplications ? (
              <>
                <div className={`${adminCardShellClass} overflow-hidden [&>article]:border-0`}>
                  <AdminStatCard value={stats.newApplications} label="Neue Bewerbungen" compact />
                </div>
                <div className={`${adminCardShellClass} overflow-hidden [&>article]:border-0`}>
                  <AdminStatCard value={stats.confirmedTeams} label="Bestätigte Teilnehmer" compact />
                </div>
                <div className={`${adminCardShellClass} overflow-hidden [&>article]:border-0`}>
                  <AdminStatCard value={stats.waitlistCount} label="Wartelistenplätze" compact />
                </div>
                <div className={`${adminCardShellClass} overflow-hidden [&>article]:border-0`}>
                  <AdminStatCard value={stats.underReview} label="In Prüfung" compact />
                </div>
              </>
            ) : null}
            {showTournaments ? (
              <>
                <div className={`${adminCardShellClass} overflow-hidden [&>article]:border-0`}>
                  <AdminStatCard value={stats.activeTournaments} label="Aktive Turniere" compact />
                </div>
                <div className={`${adminCardShellClass} overflow-hidden [&>article]:border-0`}>
                  <AdminStatCard value={stats.availableSlots} label="Freie Turnierplätze" compact />
                </div>
              </>
            ) : null}
            {isSuperAdmin ? (
              <>
                <div className={`${adminCardShellClass} overflow-hidden [&>article]:border-0`}>
                  <AdminStatCard value={stats.registeredClubs} label="Registrierte Vereine" compact />
                </div>
                <div className={`${adminCardShellClass} overflow-hidden [&>article]:border-0`}>
                  <AdminStatCard value={stats.registeredTeams} label="Registrierte Teams" compact />
                </div>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {visibleLinks.length > 0 ? (
        <section className="mt-8">
          <h2 className={adminSectionTitleClass}>Weitere Bereiche</h2>
          <p className="mt-1 text-[13px] text-muted">
            Schnelleinstiege — ergänzend zu Sidebar und Schnellaktionen.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {visibleLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`${adminCardShellClass} px-4 py-3.5 transition-colors hover:border-navy/20`}
              >
                <p className="font-display text-sm font-bold tracking-wide text-ink uppercase">
                  {link.label}
                </p>
                <p className="mt-1 text-[13px] leading-5 text-muted">{link.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

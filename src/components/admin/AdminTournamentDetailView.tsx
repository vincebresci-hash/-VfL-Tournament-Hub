import Link from "next/link";
import { ApplicationStatusBadge } from "@/components/admin/ApplicationStatusBadge";
import { AdminCard, AdminInfo, displayValue } from "@/components/admin/AdminPanel";
import { TournamentCapacityForm } from "@/components/admin/TournamentCapacityForm";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import { applicationStatusLabel } from "@/lib/admin";
import { formatDateDe } from "@/lib/format";
import { getTournamentCapacity } from "@/lib/tournament-capacity";
import type { AdminTournamentRecord } from "@/types/admin";
import type { AdminApplication, ApplicationStatus } from "@/types/application";

type AdminTournamentDetailViewProps = {
  tournament: AdminTournamentRecord;
  applications: AdminApplication[];
};

const sections: Array<{ status: ApplicationStatus; title: string }> = [
  { status: "accepted", title: "Bestätigte Teams" },
  { status: "waiting-list", title: "Warteliste" },
  { status: "under-review", title: "In Prüfung" },
  { status: "new", title: "Neue Bewerbungen" },
];

export function AdminTournamentDetailView({
  tournament,
  applications,
}: AdminTournamentDetailViewProps) {
  const related = applications.filter(
    (application) =>
      application.tournamentId === tournament.slug ||
      application.tournamentId === tournament.id,
  );
  const capacity = getTournamentCapacity(
    tournament.maxTeams,
    related.map((application) => application.applicationStatus),
  );
  const maxLabel = tournament.maxTeams == null ? "—" : String(tournament.maxTeams);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin/turniere"
        className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
      >
        ← Alle Turniere
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
            {tournament.name}
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            {formatDateDe(tournament.date)} · {tournament.ageGroup}
            {tournament.location ? ` · ${tournament.location}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={tournament.status} />
          <Link
            href={`/admin/turniere/${tournament.id}/bearbeiten`}
            className="inline-flex h-9 items-center bg-brand-yellow px-3 text-[11px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066]"
          >
            Bearbeiten
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CapacityStat
          label="Teilnehmer"
          value={`${capacity.confirmedTeams} / ${maxLabel}`}
        />
        <CapacityStat label="Freie Plätze" value={String(capacity.availableSlots)} />
        <CapacityStat label="Warteliste" value={String(capacity.waitingListCount)} />
        <CapacityStat label="In Prüfung" value={String(capacity.underReviewCount)} />
      </div>

      <div className="mt-8 grid gap-5">
        <AdminCard title="Kapazität">
          <TournamentCapacityForm slug={tournament.slug} maxTeams={tournament.maxTeams} />
        </AdminCard>

        {sections.map((section) => {
          const items = related.filter(
            (application) => application.applicationStatus === section.status,
          );

          return (
            <AdminCard key={section.status} title={section.title}>
              {items.length === 0 ? (
                <p className="text-[14px] text-muted">Keine Einträge in diesem Bereich.</p>
              ) : (
                <div className="grid gap-3">
                  {items.map((application) => (
                    <article key={application.id} className="border border-line p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                            {application.clubName}
                          </p>
                          <p className="mt-1 text-[14px] text-ink">{application.teamName}</p>
                        </div>
                        <ApplicationStatusBadge status={application.applicationStatus} />
                      </div>
                      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <AdminInfo label="Altersklasse" value={application.ageGroup} />
                        <AdminInfo label="Jahrgang" value={String(application.birthYear)} />
                        <AdminInfo label="Spielklasse" value={displayValue(application.league)} />
                        <AdminInfo
                          label="Ansprechpartner"
                          value={displayValue(
                            `${application.contactFirstName} ${application.contactLastName}`.trim(),
                          )}
                        />
                        <AdminInfo
                          label="Bewerbungsdatum"
                          value={formatDateDe(application.createdAt.slice(0, 10))}
                        />
                        <AdminInfo
                          label="Status"
                          value={applicationStatusLabel[application.applicationStatus]}
                        />
                      </dl>
                      <Link
                        href={`/admin/bewerbungen/${application.id}`}
                        className="mt-4 inline-flex text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
                      >
                        Bewerbung öffnen →
                      </Link>
                    </article>
                  ))}
                </div>
              )}
            </AdminCard>
          );
        })}
      </div>
    </div>
  );
}

function CapacityStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="border border-line bg-white px-5 py-5">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-bold tracking-wide text-ink">
        {value}
      </p>
    </article>
  );
}

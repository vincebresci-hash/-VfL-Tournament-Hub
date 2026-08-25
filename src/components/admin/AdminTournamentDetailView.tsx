import Link from "next/link";
import { ApplicationStatusBadge } from "@/components/admin/ApplicationStatusBadge";
import { AdminCard, AdminInfo, displayValue } from "@/components/admin/AdminPanel";
import { TournamentAdminChrome } from "@/components/admin/TournamentAdminChrome";
import { TournamentCapacityForm } from "@/components/admin/TournamentCapacityForm";
import { MeinTurnierplanAdminPanel } from "@/components/admin/MeinTurnierplanAdminPanel";
import { TournamentSyncAdminPanel } from "@/components/admin/TournamentSyncAdminPanel";
import { ExternalTeamsParticipationPanel } from "@/components/admin/ExternalTeamsParticipationPanel";
import { TournamentParticipantsPanel } from "@/components/admin/TournamentParticipantsPanel";
import { applicationStatusLabel } from "@/lib/admin";
import { formatDateDe } from "@/lib/format";
import { acceptedParticipants } from "@/lib/schedule/admin";
import { getTournamentCapacityWithExternal } from "@/lib/mein-turnierplan-participants";
import type { ExternalTeamAdminRow } from "@/lib/db/mein-turnierplan-participants-actions";
import type { TournamentParticipant } from "@/lib/tournament-participants";
import type { AdminTournamentRecord } from "@/types/admin";
import type { AdminApplication, ApplicationStatus } from "@/types/application";
import type { TournamentStageStatus } from "@/types/schedule";

type AdminTournamentDetailViewProps = {
  tournament: AdminTournamentRecord;
  applications: AdminApplication[];
  externalTeams: ExternalTeamAdminRow[];
  participants: TournamentParticipant[];
  groups: Array<{ id: string; name: string }>;
  stageStatus: TournamentStageStatus;
  current: "overview" | "participants";
};

const applicationSections: Array<{ status: ApplicationStatus; title: string }> = [
  { status: "waiting-list", title: "Warteliste" },
  { status: "under-review", title: "In Prüfung" },
  { status: "new", title: "Neue Bewerbungen" },
];

export function AdminTournamentDetailView({
  tournament,
  applications,
  externalTeams,
  participants,
  groups,
  stageStatus,
  current,
}: AdminTournamentDetailViewProps) {
  const related = applications.filter(
    (application) =>
      application.tournamentId === tournament.slug ||
      application.tournamentId === tournament.id,
  );
  const acceptedApplications = acceptedParticipants(applications, tournament);
  const capacity = getTournamentCapacityWithExternal({
    maxTeams: tournament.maxTeams,
    applicationStatuses: related.map((application) => application.applicationStatus),
    acceptedApplicationIds: acceptedApplications.map((application) => application.id),
    externalTeams: externalTeams.map((team) => ({
      participationStatus: team.participationStatus,
      externalActive: team.externalActive,
      applicationId: team.applicationId,
    })),
  });
  const maxLabel = tournament.maxTeams == null ? "—" : String(tournament.maxTeams);

  return (
    <TournamentAdminChrome
      tournament={tournament}
      stageStatus={stageStatus}
      current={current}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

        <MeinTurnierplanAdminPanel tournament={tournament} applications={applications} />

        <TournamentSyncAdminPanel
          tournament={tournament}
          applications={applications}
          detectedExternalTeamCount={
            externalTeams.filter(
              (team) => team.externalActive && team.participationStatus === "detected",
            ).length
          }
        />

        <ExternalTeamsParticipationPanel
          tournamentId={tournament.id}
          teams={externalTeams}
          confirmedParticipantCount={capacity.confirmedTeams}
          maxTeams={tournament.maxTeams}
        />

        <div id="teilnehmer">
          <TournamentParticipantsPanel
            tournamentId={tournament.id}
            participants={participants}
            groups={groups}
          />
        </div>

        {applicationSections.map((section) => {
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
    </TournamentAdminChrome>
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

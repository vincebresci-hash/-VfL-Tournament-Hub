import Link from "next/link";
import { ApplicationStatusBadge } from "@/components/admin/ApplicationStatusBadge";
import { AdminCard, AdminInfo, displayValue } from "@/components/admin/AdminPanel";
import { TournamentAdminChrome } from "@/components/admin/TournamentAdminChrome";
import { TournamentCapacityForm } from "@/components/admin/TournamentCapacityForm";
import { MeinTurnierplanAdminPanel } from "@/components/admin/MeinTurnierplanAdminPanel";
import { TournamentSyncAdminPanel } from "@/components/admin/TournamentSyncAdminPanel";
import { ExternalTeamsParticipationPanel } from "@/components/admin/ExternalTeamsParticipationPanel";
import { TournamentParticipantsPanel } from "@/components/admin/TournamentParticipantsPanel";
import { TournamentStatusCapacityNotice } from "@/components/admin/TournamentStatusCapacityNotice";
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
  clubs: Array<{ id: string; name: string; logoUrl: string | null }>;
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
  clubs,
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

  const base = `/admin/turniere/${tournament.id}`;
  const orientationLinks = [
    {
      href: `/admin/bewerbungen?turnier=${tournament.slug}`,
      label: "Bewerbungen",
      hint: "Eingänge prüfen und entscheiden",
    },
    {
      href: `${base}?bereich=teilnehmer`,
      label: "Teilnehmer",
      hint: "Bestätigtes Teilnehmerfeld",
    },
    {
      href: `${base}/gruppen`,
      label: "Gruppen",
      hint: "Gruppen und Zuordnung",
    },
    {
      href: `${base}/spielplan`,
      label: "Spielplan",
      hint: "Spiele und Zeiten",
    },
    {
      href: `${base}/ergebnisse`,
      label: "Ergebnisse",
      hint: "Ergebnisse erfassen",
    },
    {
      href: `${base}/ko-runde`,
      label: "KO-Runde",
      hint: "K.o.-Phase verwalten",
    },
  ] as const;

  return (
    <TournamentAdminChrome
      tournament={tournament}
      stageStatus={stageStatus}
      current={current}
    >
      <section className="border border-line border-l-4 border-l-brand-yellow bg-white p-4 sm:p-5">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
          Turnierübersicht
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-2xl font-bold tracking-wide text-ink uppercase">
              {tournament.name}
            </p>
            <p className="mt-1 text-[14px] text-muted">
              {formatDateDe(tournament.date)} · {tournament.ageGroup}
              {tournament.location ? ` · ${tournament.location}` : ""}
            </p>
          </div>
          <Link
            href={`${base}/bearbeiten`}
            className="inline-flex h-9 items-center border border-line bg-white px-3 text-[11px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20"
          >
            Bearbeiten
          </Link>
        </div>
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CapacityStat
          label="Teilnehmer"
          value={`${capacity.confirmedTeams} / ${maxLabel}`}
          emphasize
        />
        <CapacityStat label="Freie Plätze" value={String(capacity.availableSlots)} />
        <CapacityStat label="Warteliste" value={String(capacity.waitingListCount)} />
        <CapacityStat label="In Prüfung" value={String(capacity.underReviewCount)} />
      </div>

      <TournamentStatusCapacityNotice
        className="mt-5 border border-[#d9b0b0] bg-[#fff5f5] px-4 py-3 text-[13px] leading-6 text-[#9a2b2b]"
        dbStatus={tournament.status}
        maxTeams={tournament.maxTeams}
        confirmedParticipants={capacity.confirmedTeams}
        editHref={`/admin/turniere/${tournament.id}/bearbeiten`}
      />

      {capacity.availableSlots > 0 && capacity.waitingListCount > 0 ? (
        <p className="mt-5 border border-line bg-white px-4 py-3 text-[13px] leading-6 text-ink">
          Freier Startplatz – Wartelistenmannschaft auswählen ({capacity.waitingListCount}{" "}
          auf der Warteliste).
        </p>
      ) : null}

      <section className="mt-6">
        <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
          Bereiche
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Schnellzugriff auf die bestehenden Turnierbereiche.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {orientationLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="border border-line bg-white px-4 py-3 transition-colors hover:border-navy/20"
            >
              <p className="font-display text-sm font-bold tracking-wide text-ink uppercase">
                {item.label}
              </p>
              <p className="mt-1 text-[13px] text-muted">{item.hint}</p>
            </Link>
          ))}
        </div>
      </section>

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
            clubs={clubs}
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

function CapacityStat({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <article
      className={
        emphasize
          ? "border border-brand-yellow/70 bg-[#fff8e0] px-5 py-5"
          : "border border-line bg-white px-5 py-5"
      }
    >
      <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-bold tracking-wide text-ink">
        {value}
      </p>
    </article>
  );
}

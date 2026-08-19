import Link from "next/link";
import { ApplicationStatusBadge } from "@/components/admin/ApplicationStatusBadge";
import { ClubRecordStatusBadge } from "@/components/admin/ClubRecordStatusBadge";
import { AdminCard, AdminInfo, displayValue } from "@/components/admin/AdminPanel";
import { userRoleLabel } from "@/lib/admin";
import { formatDateDe } from "@/lib/format";
import type { AdminClubDetail } from "@/types/admin";

type AdminClubDetailViewProps = {
  club: AdminClubDetail;
};

export function AdminClubDetailView({ club }: AdminClubDetailViewProps) {
  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin/vereine"
        className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
      >
        ← Alle Vereine
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
            {club.name}
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            Registriert am {formatDateDe(club.createdAt.slice(0, 10))}
          </p>
        </div>
        <ClubRecordStatusBadge status={club.status} />
      </div>

      <div className="mt-8 grid gap-5">
        <AdminCard title="Stammdaten">
          <dl className="grid gap-4 sm:grid-cols-2">
            <AdminInfo label="Vereinsname" value={club.name} />
            <AdminInfo label="Ort" value={displayValue(club.city)} />
            <AdminInfo label="Website" value={displayValue(club.website)} />
            <AdminInfo label="Ansprechpartner" value={displayValue(club.contactName)} />
            <AdminInfo label="E-Mail" value={displayValue(club.contactEmail)} />
            <AdminInfo label="Telefon" value={displayValue(club.contactPhone)} />
            <AdminInfo label="Teams" value={String(club.teamCount)} />
            <AdminInfo label="Bewerbungen" value={String(club.applicationCount)} />
          </dl>
        </AdminCard>

        <AdminCard title="Benutzer / Profile">
          {club.members.length === 0 ? (
            <p className="text-[14px] text-muted">Keine zugehörigen Profile gefunden.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    {["Name", "E-Mail", "Rolle", "Hinweis"].map((heading) => (
                      <th
                        key={heading}
                        className="py-2 pr-4 text-[10px] font-semibold tracking-[0.1em] text-muted uppercase"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {club.members.map((member) => (
                    <tr key={member.id} className="border-b border-line last:border-b-0">
                      <td className="py-3 pr-4 text-[14px] text-ink">
                        {displayValue(`${member.firstName} ${member.lastName}`.trim())}
                      </td>
                      <td className="py-3 pr-4 text-[14px] text-muted">
                        {displayValue(member.email)}
                      </td>
                      <td className="py-3 pr-4 text-[14px] text-ink">
                        {userRoleLabel[member.role]}
                      </td>
                      <td className="py-3 text-[13px] text-muted">
                        {member.isCreator ? "Registrierung" : "Mitglied"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>

        <AdminCard title="Teams">
          {club.teams.length === 0 ? (
            <p className="text-[14px] text-muted">Noch keine Teams erfasst.</p>
          ) : (
            <div className="grid gap-3">
              {club.teams.map((team) => (
                <div
                  key={team.id}
                  className="flex flex-wrap items-center justify-between gap-3 border border-line px-4 py-3"
                >
                  <div>
                    <p className="text-[14px] font-medium text-ink">{team.name}</p>
                    <p className="mt-1 text-[13px] text-muted">
                      {team.ageGroup}
                      {team.birthYear ? ` · Jahrgang ${team.birthYear}` : ""}
                      {team.trainerName ? ` · ${team.trainerName}` : ""}
                      {` · ${team.applicationCount} Bewerbungen`}
                    </p>
                  </div>
                  <Link
                    href={`/admin/teams/${team.id}`}
                    className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
                  >
                    Ansehen
                  </Link>
                </div>
              ))}
            </div>
          )}
        </AdminCard>

        <AdminCard title="Bewerbungen">
          {club.applications.length === 0 ? (
            <p className="text-[14px] text-muted">Noch keine Bewerbungen.</p>
          ) : (
            <div className="grid gap-3">
              {club.applications.map((application) => (
                <div
                  key={application.id}
                  className="flex flex-wrap items-center justify-between gap-3 border border-line px-4 py-3"
                >
                  <div>
                    <p className="text-[14px] font-medium text-ink">
                      {application.teamName}
                    </p>
                    <p className="mt-1 text-[13px] text-muted">
                      {application.tournamentName} ·{" "}
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

        <AdminCard title="Turniere mit Bewerbungen">
          {club.tournaments.length === 0 ? (
            <p className="text-[14px] text-muted">Keine Turnierbewerbungen vorhanden.</p>
          ) : (
            <ul className="grid gap-2">
              {club.tournaments.map((tournament) => (
                <li key={tournament.id} className="flex flex-wrap justify-between gap-2 text-[14px]">
                  <span className="text-ink">{tournament.name}</span>
                  <span className="text-muted">
                    {tournament.applicationCount}{" "}
                    {tournament.applicationCount === 1 ? "Bewerbung" : "Bewerbungen"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>
    </div>
  );
}

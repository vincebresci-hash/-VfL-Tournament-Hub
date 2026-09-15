import Link from "next/link";
import { ApplicationStatusBadge } from "@/components/admin/ApplicationStatusBadge";
import {
  AdminEmpty,
  adminCompactSecondaryButtonClass,
  adminMobileCardClass,
  adminTableHeaderBarClass,
  adminTableRowHoverClass,
  adminTableShellClass,
} from "@/components/admin/AdminPanel";
import { getClubTypeLabel } from "@/lib/admin";
import { formatDateDe } from "@/lib/format";
import type { AdminApplication } from "@/types/application";
import type { Tournament } from "@/types/tournament";

type ApplicationTableProps = {
  applications: AdminApplication[];
  tournaments: Tournament[];
};

export function ApplicationTable({
  applications,
  tournaments,
}: ApplicationTableProps) {
  const tournamentName = (id: string) =>
    tournaments.find((tournament) => tournament.id === id)?.name ?? id;

  if (applications.length === 0) {
    return <AdminEmpty>Keine Bewerbungen für die aktuelle Auswahl.</AdminEmpty>;
  }

  return (
    <div>
      <div className="grid gap-2.5 lg:hidden">
        {applications.map((application) => (
          <article key={`mobile-${application.id}`} className={adminMobileCardClass}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-display text-[15px] font-bold tracking-wide text-ink uppercase">
                  {application.clubName}
                </p>
                <p className="mt-0.5 truncate text-[13px] font-medium text-ink">
                  {application.teamName}
                </p>
              </div>
              <ApplicationStatusBadge status={application.applicationStatus} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2.5 text-[13px]">
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Turnier
                </dt>
                <dd className="mt-0.5 truncate text-ink">
                  {tournamentName(application.tournamentId)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Altersklasse
                </dt>
                <dd className="mt-0.5 text-ink">{application.ageGroup}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Spielstärke
                </dt>
                <dd className="mt-0.5 text-ink">{application.selfRatedStrength}/5</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Eingang
                </dt>
                <dd className="mt-0.5 text-muted">
                  {formatDateDe(application.createdAt.slice(0, 10))}
                </dd>
              </div>
            </dl>
            <Link
              href={`/admin/bewerbungen/${application.id}`}
              className={`${adminCompactSecondaryButtonClass} mt-3`}
            >
              Ansehen
            </Link>
          </article>
        ))}
      </div>

      <div className={adminTableShellClass}>
        <div className={adminTableHeaderBarClass}>
          <p>Bewerbungen</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] table-fixed border-collapse text-left text-[13px]">
            <thead className="border-b border-line bg-white text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
              <tr>
                {[
                  "Verein",
                  "Mannschaft",
                  "Turnier",
                  "Altersklasse",
                  "Spielstärke",
                  "Vereinstyp",
                  "Eingang",
                  "Status",
                  "Aktionen",
                ].map((heading) => (
                  <th key={heading} className="px-3.5 py-2.5">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr key={`desktop-${application.id}`} className={adminTableRowHoverClass}>
                  <td className="min-w-0 px-3.5 py-2.5 text-[14px] font-medium text-ink">
                    <span className="block truncate">{application.clubName}</span>
                  </td>
                  <td className="min-w-0 px-3.5 py-2.5 text-[14px] text-muted">
                    <span className="block truncate">{application.teamName}</span>
                  </td>
                  <td className="min-w-0 px-3.5 py-2.5 text-[14px] text-muted">
                    <span className="block truncate">
                      {tournamentName(application.tournamentId)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-[14px] text-ink">
                    {application.ageGroup}
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-[14px] text-ink">
                    {application.selfRatedStrength}/5
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-[14px] text-muted">
                    {getClubTypeLabel(application.clubType)}
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-[14px] text-muted">
                    {formatDateDe(application.createdAt.slice(0, 10))}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <ApplicationStatusBadge status={application.applicationStatus} />
                  </td>
                  <td className="px-3.5 py-2.5">
                    <Link
                      href={`/admin/bewerbungen/${application.id}`}
                      className={adminCompactSecondaryButtonClass}
                    >
                      Ansehen
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

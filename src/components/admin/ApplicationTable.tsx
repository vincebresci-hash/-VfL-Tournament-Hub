import Link from "next/link";
import { ApplicationStatusBadge } from "@/components/admin/ApplicationStatusBadge";
import { adminTextLinkClass } from "@/components/admin/AdminPanel";
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
    return (
      <p className="border border-line bg-white px-5 py-8 text-[15px] text-muted">
        Keine Bewerbungen für die aktuelle Auswahl.
      </p>
    );
  }

  return (
    <div>
      <div className="grid gap-3 lg:hidden">
        {applications.map((application) => (
          <article
            key={`mobile-${application.id}`}
            className="border border-line bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-bold tracking-wide text-ink uppercase">
                  {application.clubName}
                </p>
                <p className="mt-1 truncate text-[13px] text-muted">{application.teamName}</p>
              </div>
              <ApplicationStatusBadge status={application.applicationStatus} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px] text-muted">
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Turnier
                </dt>
                <dd className="mt-1 truncate">{tournamentName(application.tournamentId)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Altersklasse
                </dt>
                <dd className="mt-1">{application.ageGroup}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Spielstärke
                </dt>
                <dd className="mt-1">{application.selfRatedStrength}/5</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Eingang
                </dt>
                <dd className="mt-1">{formatDateDe(application.createdAt.slice(0, 10))}</dd>
              </div>
            </dl>
            <Link
              href={`/admin/bewerbungen/${application.id}`}
              className={`${adminTextLinkClass} mt-4`}
            >
              Ansehen
            </Link>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto border border-line bg-white lg:block">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-surface">
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
                <th
                  key={heading}
                  className="px-4 py-3 text-[10px] font-semibold tracking-[0.1em] text-muted uppercase"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {applications.map((application) => (
              <tr
                key={`desktop-${application.id}`}
                className="border-b border-line last:border-b-0 hover:bg-surface/70"
              >
                <td className="max-w-[180px] px-4 py-3 text-[14px] font-medium text-ink">
                  <span className="block truncate">{application.clubName}</span>
                </td>
                <td className="max-w-[160px] px-4 py-3 text-[14px] text-muted">
                  <span className="block truncate">{application.teamName}</span>
                </td>
                <td className="max-w-[200px] px-4 py-3 text-[14px] text-muted">
                  <span className="block truncate">
                    {tournamentName(application.tournamentId)}
                  </span>
                </td>
                <td className="px-4 py-3 text-[14px] text-ink">{application.ageGroup}</td>
                <td className="px-4 py-3 text-[14px] text-ink">
                  {application.selfRatedStrength}/5
                </td>
                <td className="px-4 py-3 text-[14px] text-muted">
                  {getClubTypeLabel(application.clubType)}
                </td>
                <td className="px-4 py-3 text-[14px] text-muted">
                  {formatDateDe(application.createdAt.slice(0, 10))}
                </td>
                <td className="px-4 py-3">
                  <ApplicationStatusBadge status={application.applicationStatus} />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/bewerbungen/${application.id}`}
                    className={adminTextLinkClass}
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
  );
}

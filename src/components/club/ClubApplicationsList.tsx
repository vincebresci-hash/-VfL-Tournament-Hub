import Link from "next/link";
import { ClubStatusBadge } from "@/components/club/ClubStatusBadge";
import { formatDateDe } from "@/lib/format";
import type { ClubApplicationView } from "@/types/club";

type ClubApplicationsListProps = {
  applications: ClubApplicationView[];
};

export function ClubApplicationsList({ applications }: ClubApplicationsListProps) {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        Meine Bewerbungen
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-7 text-muted">
        Hier seht ihr ausschließlich eure eigenen Bewerbungen und den aktuellen
        Status. Interne Bewertungen des VfL bleiben unsichtbar.
      </p>

      <div className="mt-8 overflow-x-auto border border-line bg-white">
        <table className="min-w-full text-left">
          <thead className="border-b border-line bg-background">
            <tr className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
              <th className="px-4 py-3">Turnier</th>
              <th className="px-4 py-3">Mannschaft</th>
              <th className="px-4 py-3">Datum</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {applications.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-[15px] text-muted">
                  Noch keine Bewerbungen vorhanden.
                </td>
              </tr>
            ) : null}
            {applications.map((application) => (
              <tr key={application.id} className="border-b border-line last:border-0">
                <td className="px-4 py-4">
                  <Link
                    href={`/verein/bewerbungen/${application.id}`}
                    className="font-medium text-ink hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
                  >
                    {application.tournamentName}
                  </Link>
                </td>
                <td className="px-4 py-4 text-[14px] text-muted">
                  {application.teamName}
                </td>
                <td className="px-4 py-4 text-[14px] text-muted">
                  {formatDateDe(application.tournamentDate)}
                </td>
                <td className="px-4 py-4">
                  <ClubStatusBadge status={application.applicationStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

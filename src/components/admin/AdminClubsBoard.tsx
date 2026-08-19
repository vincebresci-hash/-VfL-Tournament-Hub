"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClubRecordStatusBadge } from "@/components/admin/ClubRecordStatusBadge";
import { AdminEmpty, displayValue } from "@/components/admin/AdminPanel";
import { formatDateDe } from "@/lib/format";
import type { AdminClubListItem } from "@/types/admin";

type AdminClubsBoardProps = {
  clubs: AdminClubListItem[];
};

export function AdminClubsBoard({ clubs }: AdminClubsBoardProps) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return clubs;
    }

    return clubs.filter((club) => {
      return [
        club.name,
        club.city,
        club.contactName,
        club.contactEmail ?? "",
        club.contactPhone ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [clubs, query]);

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Verein, Ansprechpartner oder E-Mail suchen"
        className="mt-6 h-11 w-full max-w-md border border-line bg-white px-3 text-[15px] text-ink placeholder:text-muted/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
      />

      {visible.length === 0 ? (
        <div className="mt-6">
          <AdminEmpty>
            {clubs.length === 0
              ? "Noch keine Vereine registriert."
              : "Keine Vereine für die aktuelle Suche."}
          </AdminEmpty>
        </div>
      ) : (
        <div className="mt-6">
          <div className="grid gap-3 lg:hidden">
            {visible.map((club) => (
              <article key={club.id} className="border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                      {club.name}
                    </p>
                    <p className="mt-1 text-[13px] text-muted">
                      {displayValue(club.contactName)}
                    </p>
                  </div>
                  <ClubRecordStatusBadge status={club.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px] text-muted">
                  <div>
                    <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                      Teams
                    </dt>
                    <dd className="mt-1">{club.teamCount}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                      Bewerbungen
                    </dt>
                    <dd className="mt-1">{club.applicationCount}</dd>
                  </div>
                </dl>
                <Link
                  href={`/admin/vereine/${club.id}`}
                  className="mt-4 inline-flex text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
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
                    "Ansprechpartner",
                    "E-Mail",
                    "Telefon",
                    "Teams",
                    "Bewerbungen",
                    "Registriert",
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
                {visible.map((club) => (
                  <tr
                    key={club.id}
                    className="border-b border-line last:border-b-0 hover:bg-surface/70"
                  >
                    <td className="px-4 py-3 text-[14px] font-medium text-ink">
                      {club.name}
                    </td>
                    <td className="px-4 py-3 text-[14px] text-muted">
                      {displayValue(club.contactName)}
                    </td>
                    <td className="px-4 py-3 text-[14px] text-muted">
                      {displayValue(club.contactEmail)}
                    </td>
                    <td className="px-4 py-3 text-[14px] text-muted">
                      {displayValue(club.contactPhone)}
                    </td>
                    <td className="px-4 py-3 text-[14px] text-ink">{club.teamCount}</td>
                    <td className="px-4 py-3 text-[14px] text-ink">
                      {club.applicationCount}
                    </td>
                    <td className="px-4 py-3 text-[14px] text-muted">
                      {formatDateDe(club.createdAt.slice(0, 10))}
                    </td>
                    <td className="px-4 py-3">
                      <ClubRecordStatusBadge status={club.status} />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/vereine/${club.id}`}
                        className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
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
      )}
    </div>
  );
}

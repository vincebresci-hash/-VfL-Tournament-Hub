"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AdminEmpty,
  adminCompactSecondaryButtonClass,
  adminFilterControlClass,
  adminFilterShellClass,
  adminMobileCardClass,
  adminTableHeaderBarClass,
  adminTableRowHoverClass,
  adminTableShellClass,
  displayValue,
} from "@/components/admin/AdminPanel";
import { formatDateDe } from "@/lib/format";
import type { AdminClubListItem } from "@/types/admin";
import { ClubRecordStatusBadge } from "@/components/admin/ClubRecordStatusBadge";

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
      <div className={`mt-6 ${adminFilterShellClass}`}>
        <label className="block min-w-0">
          <span className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
            Suche
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Verein, Ansprechpartner oder E-Mail suchen"
            className={`${adminFilterControlClass} mt-2`}
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="mt-6">
          <AdminEmpty>
            {clubs.length === 0
              ? "Noch keine Vereine registriert."
              : "Keine Vereine für die aktuelle Suche."}
          </AdminEmpty>
        </div>
      ) : (
        <div className="mt-5">
          <p className="mb-3 text-[13px] text-muted">
            {visible.length} {visible.length === 1 ? "Verein" : "Vereine"}
          </p>

          <div className="grid gap-2.5 lg:hidden">
            {visible.map((club) => (
              <article key={club.id} className={adminMobileCardClass}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-[15px] font-bold tracking-wide text-ink uppercase">
                      {club.name}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-muted">
                      {displayValue(club.contactName)}
                    </p>
                  </div>
                  <ClubRecordStatusBadge status={club.status} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2.5 text-[13px]">
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                      Teams
                    </dt>
                    <dd className="mt-0.5 text-ink">{club.teamCount}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                      Bewerbungen
                    </dt>
                    <dd className="mt-0.5 text-ink">{club.applicationCount}</dd>
                  </div>
                </dl>
                <Link
                  href={`/admin/vereine/${club.id}`}
                  className={`${adminCompactSecondaryButtonClass} mt-3`}
                >
                  Ansehen
                </Link>
              </article>
            ))}
          </div>

          <div className={adminTableShellClass}>
            <div className={adminTableHeaderBarClass}>
              <p>Vereine</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] table-fixed border-collapse text-left text-[13px]">
                <thead className="border-b border-line bg-white text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
                  <tr>
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
                      <th key={heading} className="px-3.5 py-2.5">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((club) => (
                    <tr key={club.id} className={adminTableRowHoverClass}>
                      <td className="min-w-0 px-3.5 py-2.5 text-[14px] font-medium text-ink">
                        <span className="block truncate">{club.name}</span>
                      </td>
                      <td className="min-w-0 px-3.5 py-2.5 text-[14px] text-muted">
                        <span className="block truncate">
                          {displayValue(club.contactName)}
                        </span>
                      </td>
                      <td className="min-w-0 px-3.5 py-2.5 text-[14px] text-muted">
                        <span className="block truncate">
                          {displayValue(club.contactEmail)}
                        </span>
                      </td>
                      <td className="min-w-0 px-3.5 py-2.5 text-[14px] text-muted">
                        <span className="block truncate">
                          {displayValue(club.contactPhone)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-[14px] text-ink">
                        {club.teamCount}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-[14px] text-ink">
                        {club.applicationCount}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-[14px] text-muted">
                        {formatDateDe(club.createdAt.slice(0, 10))}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <ClubRecordStatusBadge status={club.status} />
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Link
                          href={`/admin/vereine/${club.id}`}
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
      )}
    </div>
  );
}

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
import { AGE_GROUPS } from "@/types/tournament";
import type { TeamDirectoryListItem } from "@/types/team-directory";

type TeamDirectoryBoardProps = {
  entries: TeamDirectoryListItem[];
  ready: boolean;
};

function hubLabel(entry: TeamDirectoryListItem) {
  return entry.isHubLinked ? "Hub" : "Extern";
}

function contactName(entry: TeamDirectoryListItem) {
  return [entry.contactFirstName, entry.contactLastName].filter(Boolean).join(" ");
}

export function TeamDirectoryBoard({ entries, ready }: TeamDirectoryBoardProps) {
  const [query, setQuery] = useState("");
  const [ageGroup, setAgeGroup] = useState("all");
  const [hubFilter, setHubFilter] = useState<"all" | "hub" | "external">("all");
  const [archivedFilter, setArchivedFilter] = useState<"active" | "archived" | "all">(
    "active",
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return entries.filter((entry) => {
      const ageMatch = ageGroup === "all" || entry.ageGroup === ageGroup;
      const hubMatch =
        hubFilter === "all" ||
        (hubFilter === "hub" && entry.isHubLinked) ||
        (hubFilter === "external" && !entry.isHubLinked);
      const archivedMatch =
        archivedFilter === "all" ||
        (archivedFilter === "active" && !entry.archivedAt) ||
        (archivedFilter === "archived" && Boolean(entry.archivedAt));
      const queryMatch =
        needle.length === 0 ||
        [
          entry.clubName,
          entry.teamName,
          entry.contactEmail ?? "",
          entry.league ?? "",
          entry.internalCategory ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle);

      return ageMatch && hubMatch && archivedMatch && queryMatch;
    });
  }, [ageGroup, archivedFilter, entries, hubFilter, query]);

  if (!ready) {
    return (
      <AdminEmpty>
        Die Team-Datenbank steht bereit, sobald die Migration angewendet wurde.
      </AdminEmpty>
    );
  }

  return (
    <div>
      <div className={`mt-6 ${adminFilterShellClass}`}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block min-w-0">
            <span className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
              Suche
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Team, Verein, E-Mail"
              className={`${adminFilterControlClass} mt-2`}
            />
          </label>
          <label className="block min-w-0">
            <span className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
              Altersklasse
            </span>
            <select
              value={ageGroup}
              onChange={(event) => setAgeGroup(event.target.value)}
              className={`${adminFilterControlClass} mt-2`}
            >
              <option value="all">Alle</option>
              {AGE_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
              Herkunft
            </span>
            <select
              value={hubFilter}
              onChange={(event) =>
                setHubFilter(event.target.value as "all" | "hub" | "external")
              }
              className={`${adminFilterControlClass} mt-2`}
            >
              <option value="all">Alle</option>
              <option value="hub">Hub</option>
              <option value="external">Extern</option>
            </select>
          </label>
          <label className="block min-w-0">
            <span className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
              Status
            </span>
            <select
              value={archivedFilter}
              onChange={(event) =>
                setArchivedFilter(event.target.value as "active" | "archived" | "all")
              }
              className={`${adminFilterControlClass} mt-2`}
            >
              <option value="active">Aktiv</option>
              <option value="archived">Archiviert</option>
              <option value="all">Alle</option>
            </select>
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-6">
          <AdminEmpty>
            {entries.length === 0
              ? "Noch keine Teams in der Datenbank gespeichert."
              : "Keine Teams für die aktuelle Auswahl."}
          </AdminEmpty>
        </div>
      ) : (
        <div className="mt-5">
          <p className="mb-3 text-[13px] text-muted">
            {visible.length} {visible.length === 1 ? "Team" : "Teams"}
          </p>

          <div className="grid gap-2.5 lg:hidden">
            {visible.map((entry) => (
              <article key={`mobile-${entry.id}`} className={adminMobileCardClass}>
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-bold tracking-wide text-ink uppercase">
                    {entry.teamName}
                    {entry.archivedAt ? (
                      <span className="ml-2 text-[11px] font-semibold text-muted normal-case tracking-normal">
                        (archiviert)
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-muted">{entry.clubName}</p>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2.5 text-[13px]">
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                      Altersklasse
                    </dt>
                    <dd className="mt-0.5 text-ink">{displayValue(entry.ageGroup)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                      Herkunft
                    </dt>
                    <dd className="mt-0.5 text-ink">{hubLabel(entry)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                      Ansprechpartner
                    </dt>
                    <dd className="mt-0.5 truncate text-muted">
                      {displayValue(contactName(entry))}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                      E-Mail
                    </dt>
                    <dd className="mt-0.5 break-all text-muted">
                      {displayValue(entry.contactEmail)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                      Liga
                    </dt>
                    <dd className="mt-0.5 truncate text-muted">
                      {displayValue(entry.league)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                      Kategorie
                    </dt>
                    <dd className="mt-0.5 truncate text-muted">
                      {displayValue(entry.internalCategory)}
                    </dd>
                  </div>
                  <div className="min-w-0 col-span-2">
                    <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                      Letzte Teilnahme
                    </dt>
                    <dd className="mt-0.5 truncate text-muted">
                      {entry.lastParticipationAt
                        ? `${displayValue(entry.lastTournamentName)} · ${formatDateDe(entry.lastParticipationAt.slice(0, 10))}`
                        : "—"}
                    </dd>
                  </div>
                </dl>
                <Link
                  href={`/admin/team-datenbank/${entry.id}`}
                  className={`${adminCompactSecondaryButtonClass} mt-3`}
                >
                  Ansehen
                </Link>
              </article>
            ))}
          </div>

          <div className={adminTableShellClass}>
            <div className={adminTableHeaderBarClass}>
              <p>Teams</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] table-fixed border-collapse text-left text-[13px]">
                <thead className="border-b border-line bg-white text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
                  <tr>
                    {[
                      "Team",
                      "Verein",
                      "Altersklasse",
                      "Hub / extern",
                      "Ansprechpartner",
                      "E-Mail",
                      "Liga",
                      "Kategorie",
                      "Letzte Teilnahme",
                      "Aktionen",
                    ].map((heading) => (
                      <th key={heading} className="px-3.5 py-2.5">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((entry) => (
                    <tr key={`desktop-${entry.id}`} className={adminTableRowHoverClass}>
                      <td className="min-w-0 px-3.5 py-2.5 text-[14px] font-medium text-ink">
                        <span className="block truncate">{entry.teamName}</span>
                        {entry.archivedAt ? (
                          <span className="mt-0.5 block text-[11px] text-muted">
                            (archiviert)
                          </span>
                        ) : null}
                      </td>
                      <td className="min-w-0 px-3.5 py-2.5 text-[14px] text-muted">
                        <span className="block truncate">{entry.clubName}</span>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-[14px] text-ink">
                        {displayValue(entry.ageGroup)}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-[14px] text-ink">
                        {hubLabel(entry)}
                      </td>
                      <td className="min-w-0 px-3.5 py-2.5 text-[14px] text-muted">
                        <span className="block truncate">
                          {displayValue(contactName(entry))}
                        </span>
                      </td>
                      <td className="min-w-0 px-3.5 py-2.5 text-[14px] text-muted">
                        <span className="block truncate">
                          {displayValue(entry.contactEmail)}
                        </span>
                      </td>
                      <td className="min-w-0 px-3.5 py-2.5 text-[14px] text-muted">
                        <span className="block truncate">{displayValue(entry.league)}</span>
                      </td>
                      <td className="min-w-0 px-3.5 py-2.5 text-[14px] text-muted">
                        <span className="block truncate">
                          {displayValue(entry.internalCategory)}
                        </span>
                      </td>
                      <td className="min-w-0 px-3.5 py-2.5 text-[14px] text-muted">
                        <span className="block truncate">
                          {entry.lastParticipationAt
                            ? `${displayValue(entry.lastTournamentName)} · ${formatDateDe(entry.lastParticipationAt.slice(0, 10))}`
                            : "—"}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Link
                          href={`/admin/team-datenbank/${entry.id}`}
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

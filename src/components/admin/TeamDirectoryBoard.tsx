"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminEmpty, displayValue } from "@/components/admin/AdminPanel";
import { formatDateDe } from "@/lib/format";
import { AGE_GROUPS } from "@/types/tournament";
import type { TeamDirectoryListItem } from "@/types/team-directory";

type TeamDirectoryBoardProps = {
  entries: TeamDirectoryListItem[];
  ready: boolean;
};

const selectClassName =
  "h-11 w-full border border-line bg-white px-3 text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow";

function hubLabel(entry: TeamDirectoryListItem) {
  return entry.isHubLinked ? "Hub" : "Extern";
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
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block">
          <span className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
            Suche
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Team, Verein, E-Mail"
            className={`${selectClassName} mt-2`}
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
            Altersklasse
          </span>
          <select
            value={ageGroup}
            onChange={(event) => setAgeGroup(event.target.value)}
            className={`${selectClassName} mt-2`}
          >
            <option value="all">Alle</option>
            {AGE_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
            Herkunft
          </span>
          <select
            value={hubFilter}
            onChange={(event) =>
              setHubFilter(event.target.value as "all" | "hub" | "external")
            }
            className={`${selectClassName} mt-2`}
          >
            <option value="all">Alle</option>
            <option value="hub">Hub</option>
            <option value="external">Extern</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
            Status
          </span>
          <select
            value={archivedFilter}
            onChange={(event) =>
              setArchivedFilter(event.target.value as "active" | "archived" | "all")
            }
            className={`${selectClassName} mt-2`}
          >
            <option value="active">Aktiv</option>
            <option value="archived">Archiviert</option>
            <option value="all">Alle</option>
          </select>
        </label>
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
        <div className="mt-6 overflow-x-auto border border-line bg-white">
          <table className="w-full min-w-[1100px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface">
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
              {visible.map((entry) => (
                <tr key={entry.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-3 text-[14px] font-medium text-ink">
                    {entry.teamName}
                    {entry.archivedAt ? (
                      <span className="ml-2 text-[11px] text-muted">(archiviert)</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[14px] text-muted">{entry.clubName}</td>
                  <td className="px-4 py-3 text-[14px] text-ink">
                    {displayValue(entry.ageGroup)}
                  </td>
                  <td className="px-4 py-3 text-[14px] text-ink">{hubLabel(entry)}</td>
                  <td className="px-4 py-3 text-[14px] text-muted">
                    {displayValue(
                      [entry.contactFirstName, entry.contactLastName]
                        .filter(Boolean)
                        .join(" "),
                    )}
                  </td>
                  <td className="px-4 py-3 text-[14px] text-muted">
                    {displayValue(entry.contactEmail)}
                  </td>
                  <td className="px-4 py-3 text-[14px] text-muted">
                    {displayValue(entry.league)}
                  </td>
                  <td className="px-4 py-3 text-[14px] text-muted">
                    {displayValue(entry.internalCategory)}
                  </td>
                  <td className="px-4 py-3 text-[14px] text-muted">
                    {entry.lastParticipationAt
                      ? `${displayValue(entry.lastTournamentName)} · ${formatDateDe(entry.lastParticipationAt.slice(0, 10))}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/team-datenbank/${entry.id}`}
                      className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
                    >
                      Ansehen
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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
import type { AdminTeamListItem, AdminTournamentOption } from "@/types/admin";

type AdminTeamsBoardProps = {
  teams: AdminTeamListItem[];
  tournaments: AdminTournamentOption[];
};

export function AdminTeamsBoard({ teams, tournaments }: AdminTeamsBoardProps) {
  const [query, setQuery] = useState("");
  const [clubId, setClubId] = useState("all");
  const [ageGroup, setAgeGroup] = useState("all");
  const [tournamentId, setTournamentId] = useState("all");

  const clubs = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of teams) {
      map.set(team.clubId, team.clubName);
    }

    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "de"));
  }, [teams]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return teams.filter((team) => {
      const clubMatch = clubId === "all" || team.clubId === clubId;
      const ageMatch = ageGroup === "all" || team.ageGroup === ageGroup;
      const tournamentMatch =
        tournamentId === "all" || team.tournamentIds.includes(tournamentId);
      const queryMatch =
        needle.length === 0 ||
        [team.name, team.clubName, team.trainerName ?? "", String(team.ageGroup)]
          .join(" ")
          .toLowerCase()
          .includes(needle);

      return clubMatch && ageMatch && tournamentMatch && queryMatch;
    });
  }, [ageGroup, clubId, query, teams, tournamentId]);

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
              placeholder="Team, Verein oder Trainer"
              className={`${adminFilterControlClass} mt-2`}
            />
          </label>
          <label className="block min-w-0">
            <span className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
              Verein
            </span>
            <select
              value={clubId}
              onChange={(event) => setClubId(event.target.value)}
              className={`${adminFilterControlClass} mt-2`}
            >
              <option value="all">Alle Vereine</option>
              {clubs.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
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
              <option value="all">Alle Altersklassen</option>
              {AGE_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
              Turnier
            </span>
            <select
              value={tournamentId}
              onChange={(event) => setTournamentId(event.target.value)}
              className={`${adminFilterControlClass} mt-2`}
            >
              <option value="all">Alle Turniere</option>
              {tournaments.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>
                  {tournament.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-6">
          <AdminEmpty>
            {teams.length === 0
              ? "Noch keine Teams erfasst."
              : "Keine Teams für die aktuelle Auswahl."}
          </AdminEmpty>
        </div>
      ) : (
        <div className="mt-5">
          <p className="mb-3 text-[13px] text-muted">
            {visible.length} {visible.length === 1 ? "Team" : "Teams"}
          </p>

          <div className="grid gap-2.5 lg:hidden">
            {visible.map((team) => (
              <article key={team.id} className={adminMobileCardClass}>
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-bold tracking-wide text-ink uppercase">
                    {team.name}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-muted">{team.clubName}</p>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2.5 text-[13px]">
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                      Altersklasse
                    </dt>
                    <dd className="mt-0.5 text-ink">{displayValue(team.ageGroup)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                      Bewerbungen
                    </dt>
                    <dd className="mt-0.5 text-ink">{team.applicationCount}</dd>
                  </div>
                </dl>
                <Link
                  href={`/admin/teams/${team.id}`}
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
              <table className="w-full min-w-[980px] table-fixed border-collapse text-left text-[13px]">
                <thead className="border-b border-line bg-white text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
                  <tr>
                    {[
                      "Team",
                      "Verein",
                      "Altersklasse",
                      "Jahrgang",
                      "Trainer",
                      "Bewerbungen",
                      "Erstellt",
                      "Aktionen",
                    ].map((heading) => (
                      <th key={heading} className="px-3.5 py-2.5">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((team) => (
                    <tr key={team.id} className={adminTableRowHoverClass}>
                      <td className="min-w-0 px-3.5 py-2.5 text-[14px] font-medium text-ink">
                        <span className="block truncate">{team.name}</span>
                      </td>
                      <td className="min-w-0 px-3.5 py-2.5 text-[14px] text-muted">
                        <span className="block truncate">{team.clubName}</span>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-[14px] text-ink">
                        {displayValue(team.ageGroup)}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-[14px] text-muted">
                        {displayValue(team.birthYear)}
                      </td>
                      <td className="min-w-0 px-3.5 py-2.5 text-[14px] text-muted">
                        <span className="block truncate">
                          {displayValue(team.trainerName)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-[14px] text-ink">
                        {team.applicationCount}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-[14px] text-muted">
                        {formatDateDe(team.createdAt.slice(0, 10))}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Link
                          href={`/admin/teams/${team.id}`}
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

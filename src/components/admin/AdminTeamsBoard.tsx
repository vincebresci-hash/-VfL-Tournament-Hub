"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminEmpty, displayValue } from "@/components/admin/AdminPanel";
import { formatDateDe } from "@/lib/format";
import { AGE_GROUPS } from "@/types/tournament";
import type { AdminTeamListItem, AdminTournamentOption } from "@/types/admin";

type AdminTeamsBoardProps = {
  teams: AdminTeamListItem[];
  tournaments: AdminTournamentOption[];
};

const selectClassName =
  "h-11 w-full border border-line bg-white px-3 text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow";

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
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block">
          <span className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
            Suche
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Team, Verein oder Trainer"
            className={`${selectClassName} mt-2`}
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
            Verein
          </span>
          <select
            value={clubId}
            onChange={(event) => setClubId(event.target.value)}
            className={`${selectClassName} mt-2`}
          >
            <option value="all">Alle Vereine</option>
            {clubs.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
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
            <option value="all">Alle Altersklassen</option>
            {AGE_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
            Turnier
          </span>
          <select
            value={tournamentId}
            onChange={(event) => setTournamentId(event.target.value)}
            className={`${selectClassName} mt-2`}
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

      {visible.length === 0 ? (
        <div className="mt-6">
          <AdminEmpty>
            {teams.length === 0
              ? "Noch keine Teams erfasst."
              : "Keine Teams für die aktuelle Auswahl."}
          </AdminEmpty>
        </div>
      ) : (
        <div className="mt-6">
          <div className="grid gap-3 lg:hidden">
            {visible.map((team) => (
              <article key={team.id} className="border border-line bg-white p-4">
                <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                  {team.name}
                </p>
                <p className="mt-1 text-[13px] text-muted">{team.clubName}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px] text-muted">
                  <div>
                    <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                      Altersklasse
                    </dt>
                    <dd className="mt-1">{displayValue(team.ageGroup)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                      Bewerbungen
                    </dt>
                    <dd className="mt-1">{team.applicationCount}</dd>
                  </div>
                </dl>
                <Link
                  href={`/admin/teams/${team.id}`}
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
                    "Team",
                    "Verein",
                    "Altersklasse",
                    "Jahrgang",
                    "Trainer",
                    "Bewerbungen",
                    "Erstellt",
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
                {visible.map((team) => (
                  <tr
                    key={team.id}
                    className="border-b border-line last:border-b-0 hover:bg-surface/70"
                  >
                    <td className="px-4 py-3 text-[14px] font-medium text-ink">
                      {team.name}
                    </td>
                    <td className="px-4 py-3 text-[14px] text-muted">{team.clubName}</td>
                    <td className="px-4 py-3 text-[14px] text-ink">
                      {displayValue(team.ageGroup)}
                    </td>
                    <td className="px-4 py-3 text-[14px] text-muted">
                      {displayValue(team.birthYear)}
                    </td>
                    <td className="px-4 py-3 text-[14px] text-muted">
                      {displayValue(team.trainerName)}
                    </td>
                    <td className="px-4 py-3 text-[14px] text-ink">
                      {team.applicationCount}
                    </td>
                    <td className="px-4 py-3 text-[14px] text-muted">
                      {formatDateDe(team.createdAt.slice(0, 10))}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/teams/${team.id}`}
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

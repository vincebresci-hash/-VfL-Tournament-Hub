"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AdminEmpty,
  adminFilterControlClass,
  adminFilterShellClass,
  adminStatusBadgeClass,
  adminTextLinkClass,
} from "@/components/admin/AdminPanel";
import { formatDateDe } from "@/lib/format";
import type { AdminUserSummary } from "@/types/rbac";
import type { RbacRoleKey } from "@/types/rbac";

type AccountStatusFilter = "all" | "active" | "inactive" | "invitation_pending";

type AdminUsersBoardProps = {
  users: AdminUserSummary[];
};

function accountStatusLabel(status: AdminUserSummary["accountStatus"]) {
  switch (status) {
    case "active":
      return "Aktiv";
    case "inactive":
      return "Deaktiviert";
    case "invitation_pending":
      return "Einladung ausstehend";
  }
}

function accountStatusClassName(status: AdminUserSummary["accountStatus"]) {
  switch (status) {
    case "inactive":
      return "bg-[#fff5f5] text-[#9a2b2b]";
    case "invitation_pending":
      return "bg-surface text-muted";
    default:
      return "bg-[#e6f4ea] text-[#1f6b3a]";
  }
}

function userDisplayName(user: AdminUserSummary) {
  return (
    user.displayName?.trim() ||
    `${user.firstName} ${user.lastName}`.trim() ||
    user.email
  );
}

export function AdminUsersBoard({ users }: AdminUsersBoardProps) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RbacRoleKey | "">("");
  const [clubFilter, setClubFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<AccountStatusFilter>("all");

  const clubs = useMemo(
    () =>
      Array.from(
        new Set(users.map((user) => user.clubName).filter((name): name is string => Boolean(name))),
      ).sort(),
    [users],
  );

  const teams = useMemo(
    () =>
      Array.from(
        new Set(
          users.flatMap((user) => user.teamAssignments.map((assignment) => assignment.teamName)),
        ),
      ).sort(),
    [users],
  );

  const roles = useMemo(() => {
    const map = new Map<RbacRoleKey, string>();
    for (const user of users) {
      for (const role of user.roles) {
        map.set(role.key, role.name);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [users]);

  const filtered = users.filter((user) => {
    const haystack = [
      user.firstName,
      user.lastName,
      user.displayName,
      user.email,
      user.clubName,
      ...user.teamAssignments.map((t) => t.teamName),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (query.trim() && !haystack.includes(query.trim().toLowerCase())) {
      return false;
    }

    if (roleFilter && !user.roles.some((role) => role.key === roleFilter)) {
      return false;
    }

    if (clubFilter && user.clubName !== clubFilter) {
      return false;
    }

    if (teamFilter && !user.teamAssignments.some((t) => t.teamName === teamFilter)) {
      return false;
    }

    if (statusFilter !== "all" && user.accountStatus !== statusFilter) {
      return false;
    }

    return true;
  });

  return (
    <div className="mt-8 space-y-4">
      <div className={adminFilterShellClass}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="grid min-w-0 gap-1 text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
            Suche
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, E-Mail, Verein, Team…"
              className={`${adminFilterControlClass} font-normal normal-case tracking-normal`}
            />
          </label>
          <label className="grid min-w-0 gap-1 text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
            Rolle
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as RbacRoleKey | "")}
              className={`${adminFilterControlClass} font-normal normal-case tracking-normal`}
            >
              <option value="">Alle</option>
              {roles.map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
            Verein
            <select
              value={clubFilter}
              onChange={(event) => setClubFilter(event.target.value)}
              className={`${adminFilterControlClass} font-normal normal-case tracking-normal`}
            >
              <option value="">Alle</option>
              {clubs.map((club) => (
                <option key={club} value={club}>
                  {club}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
            Team
            <select
              value={teamFilter}
              onChange={(event) => setTeamFilter(event.target.value)}
              className={`${adminFilterControlClass} font-normal normal-case tracking-normal`}
            >
              <option value="">Alle</option>
              {teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as AccountStatusFilter)}
              className={`${adminFilterControlClass} font-normal normal-case tracking-normal`}
            >
              <option value="all">Alle</option>
              <option value="active">Aktiv</option>
              <option value="inactive">Deaktiviert</option>
              <option value="invitation_pending">Einladung ausstehend</option>
            </select>
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4">
          <AdminEmpty>Keine Benutzer für die aktuelle Filterauswahl gefunden.</AdminEmpty>
        </div>
      ) : (
        <div>
          <p className="mb-4 text-[13px] text-muted">
            {filtered.length} {filtered.length === 1 ? "Benutzer" : "Benutzer"}
          </p>

          <div className="grid gap-3 lg:hidden">
            {filtered.map((user) => {
              const displayName = userDisplayName(user);
              return (
                <article
                  key={`mobile-${user.id}`}
                  className="border border-line bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg font-bold tracking-wide text-ink uppercase">
                        {displayName}
                      </p>
                      <p className="mt-1 break-all text-[13px] text-muted">{user.email}</p>
                    </div>
                    <span
                      className={`shrink-0 ${adminStatusBadgeClass} ${accountStatusClassName(user.accountStatus)}`}
                    >
                      {accountStatusLabel(user.accountStatus)}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px] text-muted">
                    <div className="min-w-0">
                      <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                        Verein
                      </dt>
                      <dd className="mt-1 truncate">{user.clubName ?? "—"}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                        Seit
                      </dt>
                      <dd className="mt-1">{formatDateDe(user.createdAt.slice(0, 10))}</dd>
                    </div>
                    <div className="min-w-0 col-span-2">
                      <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                        Rollen
                      </dt>
                      <dd className="mt-1">
                        {user.roles.length > 0
                          ? user.roles.map((role) => role.name).join(", ")
                          : "—"}
                      </dd>
                    </div>
                    <div className="min-w-0 col-span-2">
                      <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                        Teams
                      </dt>
                      <dd className="mt-1">
                        {user.teamAssignments.length > 0
                          ? user.teamAssignments.map((t) => t.teamName).join(", ")
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                  <Link
                    href={`/admin/benutzer/${user.id}`}
                    className={`${adminTextLinkClass} mt-4`}
                  >
                    Ansehen
                  </Link>
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto border border-line bg-white lg:block">
            <table className="min-w-full text-left text-[14px]">
              <thead className="border-b border-line bg-surface text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">E-Mail</th>
                  <th className="px-4 py-3">Verein</th>
                  <th className="px-4 py-3">Rollen</th>
                  <th className="px-4 py-3">Teams</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Seit</th>
                  <th className="px-4 py-3">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => {
                  const displayName = userDisplayName(user);

                  return (
                    <tr
                      key={`desktop-${user.id}`}
                      className="border-b border-line last:border-b-0 hover:bg-surface/70"
                    >
                      <td className="max-w-[160px] px-4 py-3">
                        <Link
                          href={`/admin/benutzer/${user.id}`}
                          className="block truncate font-medium text-navy hover:underline"
                        >
                          {displayName}
                        </Link>
                      </td>
                      <td className="max-w-[200px] px-4 py-3 text-muted">
                        <span className="block truncate">{user.email}</span>
                      </td>
                      <td className="max-w-[140px] px-4 py-3 text-muted">
                        <span className="block truncate">{user.clubName ?? "—"}</span>
                      </td>
                      <td className="max-w-[180px] px-4 py-3 text-muted">
                        <span className="block truncate">
                          {user.roles.length > 0
                            ? user.roles.map((role) => role.name).join(", ")
                            : "—"}
                        </span>
                      </td>
                      <td className="max-w-[160px] px-4 py-3 text-muted">
                        <span className="block truncate">
                          {user.teamAssignments.length > 0
                            ? user.teamAssignments.map((t) => t.teamName).join(", ")
                            : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`${adminStatusBadgeClass} ${accountStatusClassName(user.accountStatus)}`}
                        >
                          {accountStatusLabel(user.accountStatus)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {formatDateDe(user.createdAt.slice(0, 10))}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/benutzer/${user.id}`}
                          className={adminTextLinkClass}
                        >
                          Ansehen
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminUserPermissionsCard({ user }: { user: AdminUserSummary }) {
  return (
    <div className="border border-line bg-white p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
        Effektive Berechtigungen
      </h2>
      {user.permissions.length === 0 ? (
        <p className="mt-3 text-[14px] text-muted">Keine Berechtigungen zugewiesen.</p>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {user.permissions.map((permission) => (
            <li
              key={permission}
              className="border border-line px-3 py-2 text-[13px] text-ink"
            >
              {permission}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

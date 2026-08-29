"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AdminNotice } from "@/components/admin/AdminPanel";
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
      <div className="grid gap-3 border border-line bg-white p-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="grid gap-1 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">
          Suche
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, E-Mail, Verein, Team…"
            className="h-10 border border-line px-3 text-[14px] font-normal normal-case tracking-normal text-ink"
          />
        </label>
        <label className="grid gap-1 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">
          Rolle
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as RbacRoleKey | "")}
            className="h-10 border border-line px-3 text-[14px] font-normal normal-case tracking-normal text-ink"
          >
            <option value="">Alle</option>
            {roles.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">
          Verein
          <select
            value={clubFilter}
            onChange={(event) => setClubFilter(event.target.value)}
            className="h-10 border border-line px-3 text-[14px] font-normal normal-case tracking-normal text-ink"
          >
            <option value="">Alle</option>
            {clubs.map((club) => (
              <option key={club} value={club}>
                {club}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">
          Team
          <select
            value={teamFilter}
            onChange={(event) => setTeamFilter(event.target.value)}
            className="h-10 border border-line px-3 text-[14px] font-normal normal-case tracking-normal text-ink"
          >
            <option value="">Alle</option>
            {teams.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as AccountStatusFilter)}
            className="h-10 border border-line px-3 text-[14px] font-normal normal-case tracking-normal text-ink"
          >
            <option value="all">Alle</option>
            <option value="active">Aktiv</option>
            <option value="inactive">Deaktiviert</option>
            <option value="invitation_pending">Einladung ausstehend</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <AdminNotice>Keine Benutzer für die aktuelle Filterauswahl gefunden.</AdminNotice>
      ) : (
        <div className="overflow-x-auto border border-line bg-white">
          <table className="min-w-full text-left text-[14px]">
            <thead className="border-b border-line bg-background text-[11px] font-semibold tracking-[0.1em] text-ink/60 uppercase">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">E-Mail</th>
                <th className="px-4 py-3">Verein</th>
                <th className="px-4 py-3">Rollen</th>
                <th className="px-4 py-3">Teams</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Seit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => {
                const displayName =
                  user.displayName?.trim() ||
                  `${user.firstName} ${user.lastName}`.trim() ||
                  user.email;

                return (
                  <tr key={user.id} className="border-b border-line/70">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/benutzer/${user.id}`}
                        className="font-medium text-navy hover:underline"
                      >
                        {displayName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{user.email}</td>
                    <td className="px-4 py-3 text-muted">{user.clubName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">
                      {user.roles.length > 0
                        ? user.roles.map((role) => role.name).join(", ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {user.teamAssignments.length > 0
                        ? user.teamAssignments.map((t) => t.teamName).join(", ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          user.accountStatus === "inactive"
                            ? "font-medium text-[#9a2b2b]"
                            : user.accountStatus === "invitation_pending"
                              ? "text-muted"
                              : "text-ink"
                        }
                      >
                        {accountStatusLabel(user.accountStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {formatDateDe(user.createdAt.slice(0, 10))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

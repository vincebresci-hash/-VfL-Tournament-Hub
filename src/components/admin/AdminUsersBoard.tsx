import Link from "next/link";
import { AdminCard } from "@/components/admin/AdminPanel";
import { userRoleLabel } from "@/lib/admin";
import { formatDateDe } from "@/lib/format";
import type { AdminUserSummary } from "@/types/rbac";

type AdminUsersBoardProps = {
  users: AdminUserSummary[];
};

export function AdminUsersBoard({ users }: AdminUsersBoardProps) {
  return (
    <div className="mt-8 overflow-x-auto border border-line bg-white">
      <table className="min-w-full text-left text-[14px]">
        <thead className="border-b border-line bg-background text-[11px] font-semibold tracking-[0.1em] text-ink/60 uppercase">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">E-Mail</th>
            <th className="px-4 py-3">Profilrolle</th>
            <th className="px-4 py-3">RBAC-Rollen</th>
            <th className="px-4 py-3">Verein</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Seit</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
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
                <td className="px-4 py-3">{userRoleLabel[user.profileRole]}</td>
                <td className="px-4 py-3 text-muted">
                  {user.roles.length > 0
                    ? user.roles.map((role) => role.name).join(", ")
                    : "—"}
                </td>
                <td className="px-4 py-3 text-muted">{user.clubName ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      user.isActive
                        ? "text-ink"
                        : "font-medium text-[#9a2b2b]"
                    }
                  >
                    {user.isActive ? "Aktiv" : "Inaktiv"}
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
  );
}

export function AdminUserPermissionsCard({ user }: { user: AdminUserSummary }) {
  return (
    <AdminCard title="Effektive Berechtigungen">
      {user.permissions.length === 0 ? (
        <p className="text-[14px] text-muted">Keine Berechtigungen zugewiesen.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
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
    </AdminCard>
  );
}

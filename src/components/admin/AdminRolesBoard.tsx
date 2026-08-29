import { AdminCard } from "@/components/admin/AdminPanel";
import type { Permission } from "@/types/rbac";

type AdminRolesBoardProps = {
  matrix: Array<{ roleKey: string; roleName: string; permissions: Permission[] }>;
};

export function AdminRolesBoard({ matrix }: AdminRolesBoardProps) {
  return (
    <div className="mt-8 grid gap-6">
      {matrix.map((role) => (
        <AdminCard key={role.roleKey} title={`${role.roleName} (${role.roleKey})`}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {role.permissions.map((permission) => (
              <li
                key={permission}
                className="border border-line px-3 py-2 text-[13px] text-ink"
              >
                {permission}
              </li>
            ))}
          </ul>
        </AdminCard>
      ))}
    </div>
  );
}

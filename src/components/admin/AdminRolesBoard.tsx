import {
  AdminCard,
  adminMobileCardClass,
} from "@/components/admin/AdminPanel";
import type { Permission } from "@/types/rbac";

type AdminRolesBoardProps = {
  matrix: Array<{ roleKey: string; roleName: string; permissions: Permission[] }>;
};

export function AdminRolesBoard({ matrix }: AdminRolesBoardProps) {
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      {matrix.map((role) => (
        <AdminCard key={role.roleKey} title={`${role.roleName} (${role.roleKey})`}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {role.permissions.map((permission) => (
              <li
                key={permission}
                className={`${adminMobileCardClass} py-2.5 text-[12px] font-medium text-ink`}
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

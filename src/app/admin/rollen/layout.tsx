import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/rbac/page-access";

export default async function AdminRolesLayout({ children }: { children: ReactNode }) {
  await requirePagePermission("roles.manage");
  return children;
}

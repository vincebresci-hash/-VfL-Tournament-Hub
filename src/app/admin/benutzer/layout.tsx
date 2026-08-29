import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/rbac/page-access";

export default async function AdminUsersLayout({ children }: { children: ReactNode }) {
  await requirePagePermission("users.view");
  return children;
}

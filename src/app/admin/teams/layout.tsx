import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/rbac/page-access";

export default async function AdminTeamsLayout({ children }: { children: ReactNode }) {
  await requirePagePermission("teams.view");
  return children;
}

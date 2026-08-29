import type { ReactNode } from "react";
import { requireAnyPagePermission } from "@/lib/rbac/page-access";

export default async function AdminSettingsLayout({ children }: { children: ReactNode }) {
  await requireAnyPagePermission(["users.manage", "tournaments.manage"]);
  return children;
}

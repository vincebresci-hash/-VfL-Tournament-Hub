import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/rbac/page-access";

export default async function AdminClubsLayout({ children }: { children: ReactNode }) {
  await requirePagePermission("clubs.view");
  return children;
}

import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/rbac/page-access";

export default async function AdminTournamentsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePagePermission("tournaments.view");
  return children;
}

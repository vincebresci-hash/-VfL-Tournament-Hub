import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/rbac/page-access";

export default async function AdminApplicationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePagePermission("applications.view");
  return children;
}

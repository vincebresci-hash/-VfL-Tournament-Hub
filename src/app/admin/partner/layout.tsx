import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/rbac/page-access";

export default async function AdminPartnerLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePagePermission("partners.view");
  return children;
}

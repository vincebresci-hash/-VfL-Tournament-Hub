import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/rbac/page-access";

export default async function AdminPaymentsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePagePermission("payments.view");
  return children;
}

import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/rbac/page-access";

export default async function AdminCancellationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePagePermission("cancellations.view");
  return children;
}

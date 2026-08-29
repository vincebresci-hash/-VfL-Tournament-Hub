import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/rbac/page-access";

export default async function AdminEmailsLayout({ children }: { children: ReactNode }) {
  await requirePagePermission("communications.view");
  return children;
}

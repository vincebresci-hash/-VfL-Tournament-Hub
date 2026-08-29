import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/rbac/page-access";

export default async function AdminNewsLayout({ children }: { children: ReactNode }) {
  await requirePagePermission("news.view");
  return children;
}

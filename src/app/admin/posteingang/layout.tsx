import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/rbac/page-access";

/** Hobby-safe ceiling for manual sync server actions on this segment. */
export const maxDuration = 10;
export const runtime = "nodejs";

export default async function AdminInboxLayout({ children }: { children: ReactNode }) {
  await requirePagePermission("inbox.view");
  return children;
}

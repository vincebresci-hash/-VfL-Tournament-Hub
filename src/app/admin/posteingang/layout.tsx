import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/rbac/page-access";

/**
 * Hobby Fluid Compute allows up to 300s. Inbox reply SMTP (incl. future
 * attachment send) uses 180s so download + SMTP + finalize/compensation fit;
 * keep `/api/inbox/sync` at maxDuration = 10.
 */
export const maxDuration = 180;
export const runtime = "nodejs";

export default async function AdminInboxLayout({ children }: { children: ReactNode }) {
  await requirePagePermission("inbox.view");
  return children;
}

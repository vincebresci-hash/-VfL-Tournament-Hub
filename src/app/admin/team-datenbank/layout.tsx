import type { ReactNode } from "react";
import { requirePlatformTeamDirectoryPage } from "@/lib/team-directory/access";

export default async function AdminTeamDirectoryLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePlatformTeamDirectoryPage();
  return children;
}

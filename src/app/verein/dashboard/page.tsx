import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClubDashboard } from "@/components/club/ClubDashboard";
import { CLUB_LOGIN } from "@/lib/auth/roles";
import { getAuthSession } from "@/lib/auth/session";
import { loadClubWorkspace } from "@/lib/club/workspace";

export const metadata: Metadata = { title: "Übersicht" };

export default async function ClubDashboardPage() {
  const session = await getAuthSession();
  const workspace = session ? await loadClubWorkspace(session) : null;

  if (!workspace) {
    redirect(CLUB_LOGIN);
  }

  return <ClubDashboard workspace={workspace} />;
}

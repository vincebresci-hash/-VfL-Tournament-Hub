import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClubApplicationsList } from "@/components/club/ClubApplicationsList";
import { CLUB_LOGIN } from "@/lib/auth/roles";
import { getAuthSession } from "@/lib/auth/session";
import { loadClubWorkspace } from "@/lib/club/workspace";

export const metadata: Metadata = { title: "Meine Bewerbungen" };

export default async function ClubApplicationsPage() {
  const session = await getAuthSession();
  const workspace = session ? await loadClubWorkspace(session) : null;

  if (!workspace) {
    redirect(CLUB_LOGIN);
  }

  return <ClubApplicationsList applications={workspace.applications} />;
}

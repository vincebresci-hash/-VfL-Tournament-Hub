import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClubTeamsBoard } from "@/components/club/ClubTeamsBoard";
import { CLUB_LOGIN } from "@/lib/auth/roles";
import { getAuthSession } from "@/lib/auth/session";
import { loadClubWorkspace } from "@/lib/club/workspace";

export const metadata: Metadata = { title: "Meine Teams" };

export default async function ClubTeamsPage() {
  const session = await getAuthSession();
  const workspace = session ? await loadClubWorkspace(session) : null;

  if (!workspace) {
    redirect(CLUB_LOGIN);
  }

  return <ClubTeamsBoard teams={workspace.teams} />;
}

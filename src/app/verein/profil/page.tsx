import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClubProfileForm } from "@/components/club/ClubProfileForm";
import { CLUB_LOGIN } from "@/lib/auth/roles";
import { getAuthSession } from "@/lib/auth/session";
import { loadClubWorkspace } from "@/lib/club/workspace";

export const metadata: Metadata = { title: "Vereinsprofil" };

export default async function ClubProfilePage() {
  const session = await getAuthSession();
  const workspace = session ? await loadClubWorkspace(session) : null;

  if (!workspace) {
    redirect(CLUB_LOGIN);
  }

  return <ClubProfileForm workspace={workspace} />;
}

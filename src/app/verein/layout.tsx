import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ClubShell } from "@/components/club/ClubShell";
import { canAccessClub, CLUB_LOGIN } from "@/lib/auth/roles";
import { getAuthSession } from "@/lib/auth/session";
import { loadClubWorkspace } from "@/lib/club/workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Verein",
    template: "%s | Verein | VfL Kirchheim Tournament Hub",
  },
};

export default async function ClubLayout({ children }: { children: ReactNode }) {
  const session = await getAuthSession();

  if (!session || !canAccessClub(session.user.role)) {
    redirect(CLUB_LOGIN);
  }

  const workspace = await loadClubWorkspace(session);

  return (
    <ClubShell
      clubName={workspace?.club.name ?? "Verein"}
      usingDemoData={workspace?.usingDemoData}
    >
      {children}
    </ClubShell>
  );
}

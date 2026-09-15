import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminProfileForm } from "@/components/admin/AdminProfileForm";
import { AdminPageHeader } from "@/components/admin/AdminPanel";
import { loadOwnTeamAssignments } from "@/lib/auth/own-affiliations";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { ADMIN_LOGIN } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Profil" };

export default async function AdminProfilePage() {
  const session = await getAuthSession();

  if (!session || !canAccessAdmin(session.user.role)) {
    redirect(ADMIN_LOGIN);
  }

  const teamAssignments = await loadOwnTeamAssignments(session.user.id);

  return (
    <div className="mx-auto max-w-3xl">
      <AdminPageHeader
        title="Profil"
        description="Persönliche Angaben zum Admin-Konto. Das Passwort liegt ausschließlich bei Supabase Auth."
      />
      <div className="mt-5">
        <AdminProfileForm
          profile={session.user}
          club={session.club}
          teamAssignments={teamAssignments}
        />
      </div>
    </div>
  );
}

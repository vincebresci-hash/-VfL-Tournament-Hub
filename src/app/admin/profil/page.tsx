import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminProfileForm } from "@/components/admin/AdminProfileForm";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { ADMIN_LOGIN } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Profil" };

export default async function AdminProfilePage() {
  const session = await getAuthSession();

  if (!session || !canAccessAdmin(session.user.role)) {
    redirect(ADMIN_LOGIN);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        Profil
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-7 text-muted">
        Persönliche Angaben zum Admin-Konto. Das Passwort liegt ausschließlich bei
        Supabase Auth.
      </p>
      <div className="mt-8">
        <AdminProfileForm profile={session.user} />
      </div>
    </div>
  );
}

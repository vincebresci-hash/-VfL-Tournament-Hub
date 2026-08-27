import type { Metadata } from "next";
import { withCanonical } from "@/lib/site";
import { redirect } from "next/navigation";
import { AuthCard, AuthHeadline, AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { canAccessClub, CLUB_HOME } from "@/lib/auth/roles";
import { getAuthSession } from "@/lib/auth/session";

export const metadata: Metadata = withCanonical("/registrieren", {
  title: "Vereinskonto erstellen"
});

export default async function RegisterPage() {
  const session = await getAuthSession();

  if (session && canAccessClub(session.user.role)) {
    redirect(CLUB_HOME);
  }

  return (
    <AuthShell wide>
      <AuthHeadline
        title="Vereinskonto erstellen"
        subtitle="Registriert euren Verein und verwaltet zukünftige Turnierbewerbungen zentral."
      />
      <AuthCard>
        <RegisterForm />
      </AuthCard>
    </AuthShell>
  );
}

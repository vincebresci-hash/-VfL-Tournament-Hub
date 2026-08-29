import type { Metadata } from "next";
import { withCanonical } from "@/lib/site";
import { AuthCard, AuthHeadline, AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getAuthSession } from "@/lib/auth/session";
import { markInvitationAcceptedForAuthUser } from "@/lib/rbac/invitation-acceptance";

export const metadata: Metadata = withCanonical("/passwort-zuruecksetzen", {
  title: "Passwort zurücksetzen"
});

export default async function ResetPasswordPage() {
  const session = await getAuthSession();

  if (session) {
    await markInvitationAcceptedForAuthUser({
      userId: session.user.id,
      email: session.user.email,
      source: "password_setup",
    });
  }

  return (
    <AuthShell>
      <AuthHeadline
        title="Neues Passwort"
        subtitle="Vergib ein neues Passwort für dein Vereinskonto."
      />
      <AuthCard>
        {session ? (
          <ResetPasswordForm />
        ) : (
          <p className="text-[15px] leading-7 text-ink">
            Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen
            Link zum Zurücksetzen an.
          </p>
        )}
      </AuthCard>
    </AuthShell>
  );
}

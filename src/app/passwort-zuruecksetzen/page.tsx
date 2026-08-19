import type { Metadata } from "next";
import { AuthCard, AuthHeadline, AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getAuthSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Passwort zurücksetzen" };

export default async function ResetPasswordPage() {
  const session = await getAuthSession();

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
